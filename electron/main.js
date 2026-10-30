const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, clipboard, session, desktopCapturer, globalShortcut, dialog, shell, systemPreferences } = require('electron');
const path = require('path');
const { fileURLToPath } = require('url');
const os = require('os');
const fs = require('fs/promises');
const { createCapturePrivacy } = require('./capture-privacy');
const { allowAppNavigation } = require('./navigation-policy');
const { isAllowedOAuthAuthorizationUrl, isDesktopOAuthCallback, toAppOAuthCallbackUrl } = require('./oauth-window-policy');
const { shouldPreventWindowClose, shouldShowInterviewOverlay } = require('./window-lifecycle');
const { isAllowedAuxiliaryChannel } = require('./ipc-policy');
const { calculateCaptureCrop } = require('./capture-crop');
const { windowSources, cropPage } = require('./window-capture');
const { constrainNativeCaptureImage } = require('./native-capture-image');
const { captureMacOSRegion } = require('./macos-screen-capture');
const { getScreenSourcesWithRetry, getUsableScreenSource } = require('./screen-capture-source');
const { screenCaptureFailure } = require('./screen-capture-failure');
const { resolveScreenCaptureSetup } = require('./screen-capture-setup');
const { effectiveScreenCapturePermissionStatus } = require('./screen-capture-permission');
const { isAllowedMainWindowMediaPermission } = require('./media-permission-policy');

// AllyX currently presents the macOS Screen & System Audio Recording permission
// flow to customers. Electron 39's default CoreAudio Tap path does not fall back
// to that permission flow when it cannot initialise a desktop-audio track, so
// keep Electron's documented legacy path until the product adopts CoreAudio Tap
// end-to-end and updates its user-facing setup steps at the same time.
if (process.platform === 'darwin') {
    app.commandLine.appendSwitch('disable-features', 'MacCatapLoopbackAudioForScreenShare');
}

const capturePrivacy = createCapturePrivacy({
    platform: process.platform,
    release: os.release(),
    getWindows: () => BrowserWindow.getAllWindows(),
});
let hideShortcutRegistered = false;

// Apply before any of our initially hidden windows can render onscreen.
app.on('browser-window-created', (event, window) => capturePrivacy.apply(window));

function showPrivacyStatus() {
    const state = capturePrivacy.status();
    const failures = state.windows.filter(window => !window.requestApplied);
    dialog.showMessageBox({
        type: 'info',
        title: 'AllyX Capture Privacy',
        message: `Capture privacy request: ${state.requested ? 'ON' : 'OFF'}`,
        detail: [
            `AllyX ${app.getVersion()} · ${process.platform} ${os.release()}`,
            'This mode keeps AllyX visible on your display. It does not pause the assistant.',
            failures.length ? `${failures.length} window requests were not applied.` : 'Window request settings applied.',
            process.platform === 'darwin'
                ? 'Experimental on macOS: modern screen sharing can ignore this setting, including captures using ScreenCaptureKit.'
                : 'Capture exclusion depends on Windows version and the recording application.',
            `Receiver verification: ${state.receiverVerificationStatus.toUpperCase()}. Check from a second participant while sharing the entire display. If AllyX is visible there, this mode does not work for that setup.`,
            `Not covered by the BrowserWindow request: ${state.uncoveredSurfaces.join(', ')}.`,
            hideShortcutRegistered ? 'Cmd/Ctrl+Shift+H hides the app locally instead.' : 'Hide shortcut unavailable; use the tray menu.',
        ].join('\n\n'),
        buttons: ['Close'],
    });
}

const ICON_PATH = path.join(__dirname, '..', 'public', 'favicon.ico');
const LOADING_PAGE_PATH = path.join(__dirname, 'loading.html');
const LOADING_PAGE_CHANNELS = new Set(['retry-connection', 'quit-app']);

function initPlatform() {
    if (process.platform === 'win32') {
        app.setAppUserModelId('com.allyx.ai');
    }
}

let floatingIconWindow = null;
let mainAppWindow = null;
let scannerFrameWindow = null;
let tray = null;
let isAppVisible = false;
let isScannerFrameOpen = false;
let isPresentationSafeMode = false;
let isOverlayInteractive = true;
let isInterviewRendererReady = false;
let scannerCaptureInFlight = false;
let scannerOcrInFlight = false;
let pendingScannerCapture = null;
let scannerCaptureSequence = 0;
let screenCaptureSetupProbePromise = null;
let screenCaptureVerifiedInProcess = false;
let scannerOpenPromise = null;
let pendingWindowPreview = null;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
    app.quit();
}

const isDev = !app.isPackaged;
const APP_URL = process.env.ALLYX_APP_URL || (isDev ? 'http://localhost:3000' : 'https://allyx.vercel.app');
const APP_ORIGIN = new URL(APP_URL).origin;
const COMPATIBILITY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SUPABASE_AUTH_ORIGIN = 'https://eslcatxyhshjlgukkfhc.supabase.co';
const OAUTH_NAVIGATION_ORIGINS = [SUPABASE_AUTH_ORIGIN, 'https://accounts.google.com', 'https://accounts.googleusercontent.com'];
const DESKTOP_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DEEP_LINK_SCHEME = 'allyx';
let isQuitting = false;
let pendingDesktopOAuthCallback = null;
let isInitialized = false;

function registerDesktopProtocol() {
    if (process.defaultApp && process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME, process.execPath, [path.resolve(process.argv[1])]);
        return;
    }
    app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);
}

function handleDesktopOAuthCallback(value) {
    if (!isDesktopOAuthCallback(value)) return;
    const callbackUrl = toAppOAuthCallbackUrl(value, APP_URL);
    if (!callbackUrl) return;
    if (!isInitialized) {
        pendingDesktopOAuthCallback = value;
        return;
    }
    if (!mainAppWindow || mainAppWindow.isDestroyed()) createMainAppWindow();
    if (!mainAppWindow || mainAppWindow.isDestroyed()) return;
    void mainAppWindow.loadURL(callbackUrl).catch(error => console.error('[Auth] Could not complete Google sign-in:', error));
    if (!isPresentationSafeMode) {
        mainAppWindow.show();
        mainAppWindow.focus();
        isAppVisible = true;
    }
}

// macOS sends this event to an already-open app. Windows and Linux pass the
// same URL through `second-instance` below.
app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDesktopOAuthCallback(url);
});

function isTrustedPage(event, channel) {
    const sender = event.sender;
    const frame = event.senderFrame;
    const frameUrl = frame?.url;
    if (!frameUrl) return false;
    if (sender === mainAppWindow?.webContents) {
        if (frame === sender.mainFrame && frame.origin === APP_ORIGIN) return true;
        try {
            const url = new URL(frameUrl);
            return frame === sender.mainFrame
                && url.protocol === 'file:'
                && path.resolve(fileURLToPath(url)) === LOADING_PAGE_PATH
                && LOADING_PAGE_CHANNELS.has(channel);
        } catch { return false; }
    }
    if (sender === scannerFrameWindow?.webContents) {
        try { return frame === sender.mainFrame && frame.origin === APP_ORIGIN && new URL(frameUrl).pathname === '/scanner-frame' && isAllowedAuxiliaryChannel('scanner', channel); } catch { return false; }
    }
    if (sender === floatingIconWindow?.webContents) {
        return frame === sender.mainFrame
            && frameUrl.startsWith('file:')
            && isAllowedAuxiliaryChannel('overlay', channel);
    }
    return false;
}

function sendSafeModeState(active) {
    BrowserWindow.getAllWindows().forEach((window) => {
        if (!window.isDestroyed()) window.webContents.send('presentation-safe-mode-changed', active);
    });
}

function closeScannerFrame() {
    pendingWindowPreview = null;
    isScannerFrameOpen = false;
    if (scannerFrameWindow && !scannerFrameWindow.isDestroyed()) {
        scannerFrameWindow.destroy();
    }
    scannerFrameWindow = null;
    broadcastScannerState(false);
}

function getScreenCapturePermissionStatus() {
    if (process.platform !== 'darwin') return 'not-applicable';
    try {
        return systemPreferences.getMediaAccessStatus('screen');
    } catch (error) {
        console.warn('[Scanner] Could not read macOS Screen Recording status:', error);
        return 'unknown';
    }
}

function isRunningFromMountedDmg() {
    if (process.platform !== 'darwin') return false;
    try {
        // A TCC decision made for a temporary copy on a mounted installer can
        // belong to a different path than the installed application. Never
        // request Screen Recording from that temporary copy.
        return app.getAppPath().startsWith('/Volumes/');
    } catch (error) {
        console.warn('[Scanner] Could not read the app path for capture setup:', error);
        return false;
    }
}

function getScreenCaptureSetup(options = {}) {
    const permissionStatus = effectiveScreenCapturePermissionStatus({
        reportedStatus: getScreenCapturePermissionStatus(),
        captureVerifiedInProcess: screenCaptureVerifiedInProcess,
    });
    return resolveScreenCaptureSetup({
        platform: process.platform,
        permissionStatus,
        isRunningFromMountedDmg: isRunningFromMountedDmg(),
        // A source returned by the native service is stronger evidence than a
        // short-lived stale permission read. Keep it only for this app
        // process; a managed `restricted` state still takes precedence.
        sourceAvailable: screenCaptureVerifiedInProcess && permissionStatus !== 'restricted',
        ...options,
    });
}

function getPassiveScreenCaptureSetup() {
    return getScreenCaptureSetup();
}

function screenCaptureSetupMessage(state) {
    switch (state) {
        case 'install-required':
            return 'Install AllyX in Applications before enabling Screen Capture.';
        case 'awaiting-consent':
            return 'macOS is waiting for your Screen & System Audio Recording decision.';
        case 'restart-required':
            return 'Screen & System Audio Recording was enabled. Restart AllyX once to finish setup.';
        case 'settings-required':
            return 'Allow AllyX in System Settings → Privacy & Security → Screen & System Audio Recording, then restart AllyX.';
        case 'capture-unavailable':
            return 'macOS could not prepare Screen Capture yet. Close System Settings and try again.';
        default:
            return 'Screen Capture setup is not ready yet.';
    }
}

async function prepareScreenCaptureSetup() {
    // An explicit scanner action verifies that a "granted" status can really
    // enumerate a display. Passive setup/status checks deliberately skip this
    // probe so they never create a surprise macOS consent request.
    const beforeProbe = getScreenCaptureSetup({ probeOnGranted: true });
    if (!beforeProbe.shouldProbe) return beforeProbe;
    if (screenCaptureSetupProbePromise) return screenCaptureSetupProbePromise;

    const initialPermissionStatus = beforeProbe.permissionStatus;
    screenCaptureSetupProbePromise = (async () => {
        let capture = null;
        try {
            // This is intentionally a single, tiny native request. Its only
            // job is to let macOS show its own first-use consent dialog before
            // we create any scanner UI. It never retries behind that dialog.
            // A source identifier alone is not proof that macOS will give the
            // app pixels. Require a real, tiny thumbnail from the primary
            // display so that this proof can safely suppress a later stale
            // TCC status rather than creating a Settings loop.
            const display = screen.getPrimaryDisplay();
            capture = await getUsableScreenSource({
                getSources: options => desktopCapturer.getSources(options),
                displayId: display.id,
                displayCount: screen.getAllDisplays().length,
                options: {
                    types: ['screen'],
                    thumbnailSize: { width: 16, height: 16 },
                    fetchWindowIcons: false,
                },
                attempts: 1,
                retryDelays: [],
                timeoutMs: 4500,
            });
        } catch (error) {
            console.warn('[Scanner] Native capture setup probe failed:', error);
        }

        const rawPermissionStatus = getScreenCapturePermissionStatus();
        const sourceAvailable = Boolean(capture?.source && capture?.size);
        if (sourceAvailable) screenCaptureVerifiedInProcess = true;
        const permissionStatus = effectiveScreenCapturePermissionStatus({
            reportedStatus: rawPermissionStatus,
            captureVerifiedInProcess: screenCaptureVerifiedInProcess,
        });
        const setup = resolveScreenCaptureSetup({
            platform: process.platform,
            permissionStatus,
            isRunningFromMountedDmg: isRunningFromMountedDmg(),
            probeComplete: true,
            sourceAvailable,
            grantedDuringProbe: initialPermissionStatus === 'not-determined' && rawPermissionStatus === 'granted',
            probeOnGranted: true,
        });
        return {
            ...setup,
            diagnostics: capture ? {
                reason: capture.reason || null,
                attempts: capture.attempts || 0,
                sourceCount: capture.sourceCount || 0,
            } : undefined,
        };
    })().finally(() => {
        screenCaptureSetupProbePromise = null;
    });

    return screenCaptureSetupProbePromise;
}

function getMicrophonePermissionStatus() {
    if (process.platform !== 'darwin') return 'not-applicable';
    try {
        return systemPreferences.getMediaAccessStatus('microphone');
    } catch (error) {
        console.warn('[Audio] Could not read macOS microphone permission status:', error);
        return 'unknown';
    }
}

function settlePendingScannerCapture(captureId, accepted) {
    if (!pendingScannerCapture || pendingScannerCapture.id !== captureId) return false;
    const pending = pendingScannerCapture;
    pendingScannerCapture = null;
    clearTimeout(pending.timeout);
    pending.resolve(Boolean(accepted));
    return true;
}

function cancelPendingScannerCapture() {
    if (!pendingScannerCapture) return;
    settlePendingScannerCapture(pendingScannerCapture.id, false);
}

async function deliverScannerCapture(imageData, captureMode = 'area') {
    if (!mainAppWindow || mainAppWindow.isDestroyed() || !isInterviewRendererReady || !isInterviewSessionPage()) {
        return false;
    }
    if (pendingScannerCapture) return false;

    const id = `scan-${Date.now()}-${++scannerCaptureSequence}`;
    const accepted = await new Promise(resolve => {
        const timeout = setTimeout(() => settlePendingScannerCapture(id, false), 5000);
        pendingScannerCapture = { id, timeout, resolve };
        try {
            mainAppWindow.webContents.send('process-ocr-request', { id, imageData, captureMode });
        } catch (error) {
            console.error('[Scanner] Could not send captured image to the interview renderer:', error);
            settlePendingScannerCapture(id, false);
        }
    });
    return accepted;
}

async function getNativeDisplayCapture(display) {
    return getUsableScreenSource({
        getSources: options => desktopCapturer.getSources(options),
        displayId: display.id,
        displayCount: screen.getAllDisplays().length,
        options: {
            types: ['screen'],
            thumbnailSize: {
                width: Math.max(1, Math.round(display.bounds.width * display.scaleFactor)),
                height: Math.max(1, Math.round(display.bounds.height * display.scaleFactor)),
            },
            fetchWindowIcons: false,
        },
    });
}

function nativeCaptureFailure(display, error) {
    const errorCode = typeof error?.code === 'string' ? error.code : null;
    return {
        source: null,
        size: null,
        // Only a failed screencapture command can reasonably be a macOS
        // Screen Recording permission problem. File/decode/region failures
        // have different remedies, so keep them out of the Settings loop.
        reason: errorCode === 'CAPTURE_COMMAND_FAILED'
            ? 'capture-error'
            : errorCode === 'CAPTURE_TIMEOUT'
                ? 'capture-timeout'
                : 'native-capture-error',
        errorCode,
        attempts: 1,
        error: error instanceof Error ? error : null,
        sourceCount: 0,
        sourceDisplayIdCount: 0,
        displayId: String(display?.id ?? ''),
        displayCount: screen.getAllDisplays().length,
    };
}

async function getScannerAreaCapture(display, selectionBounds) {
    // Request pixels from Electron first. `desktopCapturer` runs in the AllyX
    // process, so macOS evaluates the Screen & System Audio Recording approval
    // shown for AllyX in System Settings. A spawned `/usr/sbin/screencapture`
    // helper can have a different TCC identity and must only be a fallback.
    const electronCapture = await getNativeDisplayCapture(display);
    if (electronCapture.source && electronCapture.size) {
        return { ...electronCapture, isExactRegion: false, captureMethod: 'electron' };
    }

    if (process.platform === 'darwin') {
        try {
            const { image, size } = await captureMacOSRegion({
                region: selectionBounds,
                nativeImage,
            });
            return {
                source: { thumbnail: image },
                size,
                reason: null,
                attempts: (electronCapture.attempts || 0) + 1,
                error: null,
                sourceCount: 1,
                sourceDisplayIdCount: 1,
                displayId: String(display.id),
                displayCount: screen.getAllDisplays().length,
                isExactRegion: true,
                captureMethod: 'macos-fallback',
            };
        } catch (error) {
            return nativeCaptureFailure(display, error);
        }
    }
    return electronCapture;
}

function nativeScreenCaptureFailure(capture) {
    // Keep a prior real thumbnail as proof for this process. A later empty
    // source can be a transient ScreenCaptureKit gap; clearing the proof here
    // made the UI treat an already enabled toggle as a fresh denial.
    if (capture?.source && capture?.size) screenCaptureVerifiedInProcess = true;
    const result = screenCaptureFailure({
        platform: process.platform,
        permissionStatus: effectiveScreenCapturePermissionStatus({
            reportedStatus: getScreenCapturePermissionStatus(),
            captureVerifiedInProcess: screenCaptureVerifiedInProcess,
        }),
        capture,
    });
    // Do not send customers back to Chromium's getDisplayMedia picker here.
    // That is the stream that timed out before returning video frames on
    // macOS 26. Native capture is the normal and retryable path.
    return result;
}

function setPresentationSafeMode(active) {
    isPresentationSafeMode = Boolean(active);
    sendSafeModeState(isPresentationSafeMode);

    if (isPresentationSafeMode) {
        closeScannerFrame();
        BrowserWindow.getAllWindows().forEach((window) => {
            if (!window.isDestroyed()) window.hide();
        });
        isAppVisible = false;
    } else if (mainAppWindow && !mainAppWindow.isDestroyed()) {
        mainAppWindow.show();
        mainAppWindow.focus();
        if (canShowInterviewOverlay() && (!floatingIconWindow || floatingIconWindow.isDestroyed())) {
            createFloatingIcon();
        }
        if (canShowInterviewOverlay()) floatingIconWindow?.showInactive();
        isAppVisible = true;
    }

    updateTrayMenu();
    return isPresentationSafeMode;
}

// --- SCANNER FRAME ---
// Do not tell the renderer the scanner is open until its remote page is ready.
// Otherwise a navigation/load failure looks like a working Capture button.
function createScannerFrame() {
    if (isPresentationSafeMode || !isInterviewRendererReady || !isInterviewSessionPage()) {
        return Promise.resolve({ active: false, error: 'Wait for the interview session to finish loading.' });
    }
    if (scannerFrameWindow && !scannerFrameWindow.isDestroyed()) closeScannerFrame();

    const primaryWorkArea = screen.getPrimaryDisplay().workArea;
    const frame = new BrowserWindow({
        width: 400,
        height: 300,
        x: Math.floor(primaryWorkArea.x + (primaryWorkArea.width - 400) / 2),
        y: Math.floor(primaryWorkArea.y + (primaryWorkArea.height - 300) / 2),
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        // Keep scanner geometry in Electron's native coordinate space. The
        // renderer's screen coordinates can differ on Retina/scaled displays.
        resizable: true,
        minWidth: 200,
        minHeight: 150,
        movable: true,
        focusable: true,
        thickFrame: false,
        hasShadow: false,
        backgroundColor: '#00000000',
        icon: ICON_PATH,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            partition: 'persist:main',
            // Keep capture status and retry controls responsive if macOS
            // temporarily moves focus away from this compact window.
            backgroundThrottling: false,
        }
    });
    scannerFrameWindow = frame;
    allowAppNavigation(frame, APP_ORIGIN, url => shell.openExternal(url));

    if (process.platform === 'win32') {
        frame.setAlwaysOnTop(true, 'screen-saver', 1);
    } else {
        frame.setAlwaysOnTop(true, 'floating', 1);
    }

    return new Promise(resolve => {
        let settled = false;
        const settle = (result) => {
            if (settled) return;
            settled = true;
            clearTimeout(loadTimeout);
            resolve(result);
        };
        const fail = (error) => {
            settle({ active: false, error });
            // Closing the window synchronously emits `closed`. Settle first
            // so that event cannot replace a useful load/timeout error with
            // the generic "closed before opening" message.
            if (scannerFrameWindow === frame) closeScannerFrame();
        };
        const loadTimeout = setTimeout(() => {
            fail('Screen Capture took too long to open. Check your connection and try again.');
        }, 10000);

        frame.once('ready-to-show', () => {
            if (scannerFrameWindow !== frame || isPresentationSafeMode) {
                fail('Screen Capture is not available right now.');
                return;
            }
            // A timed-out or expired hosted session can redirect this compact
            // window to login. Never present that page as a working scanner:
            // the scanner must be on its dedicated, trusted capture route.
            try {
                if (new URL(frame.webContents.getURL()).pathname !== '/scanner-frame') {
                    fail('Your interview session changed before Screen Capture opened. Return to AllyX and start the interview again.');
                    return;
                }
            } catch {
                fail('Screen Capture opened an invalid page. Return to AllyX and try again.');
                return;
            }
            isScannerFrameOpen = true;
            frame.show();
            broadcastScannerState(true);
            settle({ active: true });
        });
        frame.webContents.once('did-fail-load', (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
            if (!isMainFrame || errorCode === -3) return;
            fail(`Could not open Screen Capture (${errorDescription || errorCode}). Try again.`);
        });
        frame.on('closed', () => {
            const wasCurrentFrame = scannerFrameWindow === frame;
            if (wasCurrentFrame) {
                scannerFrameWindow = null;
                isScannerFrameOpen = false;
                broadcastScannerState(false);
            }
            if (!settled) {
                settle({ active: false, error: 'Screen Capture was closed before it finished opening.' });
            }
        });
        frame.loadURL(`${APP_URL}/scanner-frame?isScanner=true`, {
            extraHeaders: "x-is-scanner: true\n"
        }).catch(error => {
            console.error('[Scanner] Could not load scanner frame:', error);
            fail('Could not open Screen Capture. Check your connection and try again.');
        });
    });
}

function broadcastScannerState(active) {
    if (mainAppWindow && !mainAppWindow.isDestroyed()) {
        mainAppWindow.webContents.send('scanner-state-changed', active);
    }
}

function createFloatingIcon() {
    if (!canShowInterviewOverlay()) return null;
    if (floatingIconWindow && !floatingIconWindow.isDestroyed()) return floatingIconWindow;

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width } = primaryDisplay.workAreaSize;
    const centerX = Math.round((width / 2) - 28);

    floatingIconWindow = new BrowserWindow({
        width: 480,
        height: 460,
        x: Math.max(10, centerX - 212),
        y: 36,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: true,
        minWidth: 320,
        minHeight: 220,
        movable: true,
        hasShadow: false,
        icon: ICON_PATH,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true
        }
    });

    if (process.platform === 'win32') {
        floatingIconWindow.setAlwaysOnTop(true, 'screen-saver', 10);
    }
    floatingIconWindow.setIgnoreMouseEvents(!isOverlayInteractive, { forward: true });
    floatingIconWindow.setFocusable(isOverlayInteractive);

    floatingIconWindow.loadFile(path.join(__dirname, 'overlay.html'));
    floatingIconWindow.once('ready-to-show', () => {
        if (canShowInterviewOverlay()) floatingIconWindow?.showInactive();
    });
    floatingIconWindow.on('closed', () => {
        floatingIconWindow = null;
        updateTrayMenu();
    });
    return floatingIconWindow;
}

function setOverlayInteractive(active) {
    isOverlayInteractive = Boolean(active);
    if (!floatingIconWindow || floatingIconWindow.isDestroyed()) return isOverlayInteractive;
    floatingIconWindow.setIgnoreMouseEvents(!isOverlayInteractive, { forward: true });
    floatingIconWindow.setFocusable(isOverlayInteractive);
    floatingIconWindow.webContents.send('overlay-interaction-changed', isOverlayInteractive);
    if (isOverlayInteractive && canShowInterviewOverlay()) {
        floatingIconWindow.showInactive();
    }
    return isOverlayInteractive;
}

function openGoogleSignInInSystemBrowser(authorizationUrl) {
    if (!isAllowedOAuthAuthorizationUrl(authorizationUrl, SUPABASE_AUTH_ORIGIN)) {
        throw new Error('Invalid Google sign-in request. Please try again from AllyX.');
    }
    // Google OAuth must use the customer's browser. Once approved, the
    // registered allyx:// callback returns the PKCE code to this desktop app.
    return shell.openExternal(authorizationUrl);
}

function createMainAppWindow() {
    const { width } = screen.getPrimaryDisplay().workAreaSize;

    mainAppWindow = new BrowserWindow({
        width: 500,
        height: 750,
        minWidth: 400,
        minHeight: 600,
        x: Math.floor(width / 2) - 250,
        y: 120,
        frame: false,
        transparent: false,
        icon: ICON_PATH,
        alwaysOnTop: true,
        skipTaskbar: true, // HIDE FROM TASKBAR
        resizable: true,
        movable: true,
        hasShadow: true,
        focusable: true,
        show: false,
        backgroundColor: '#18181b',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            backgroundThrottling: false,
            partition: 'persist:main'
        }
    });
    allowAppNavigation(mainAppWindow, APP_ORIGIN, url => shell.openExternal(url), OAUTH_NAVIGATION_ORIGINS);
    mainAppWindow.webContents.setUserAgent(DESKTOP_USER_AGENT);

    if (process.platform === 'win32') {
        mainAppWindow.setAlwaysOnTop(true, 'screen-saver', 5);
    } else {
        mainAppWindow.setAlwaysOnTop(true, 'floating', 5);
    }

    mainAppWindow.on('close', (e) => {
        if (!shouldPreventWindowClose(isQuitting)) return;
        e.preventDefault();
        mainAppWindow?.hide();
        isAppVisible = false;
    });

    // Notify renderer if page fails to load
    mainAppWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame || errorCode === -3 || typeof validatedURL !== 'string' || !validatedURL.startsWith(APP_ORIGIN)) return;
        console.error(`[App] Load fail: ${errorDescription} (${errorCode})`);
        closeInterviewWindows();
        void mainAppWindow.loadFile(LOADING_PAGE_PATH, {
            query: { error: errorDescription.slice(0, 180) },
        }).then(() => {
            if (!isPresentationSafeMode && mainAppWindow && !mainAppWindow.isDestroyed()) showApp();
        }).catch(error => console.error('[App] Could not show the connection recovery screen:', error));
    });
    mainAppWindow.webContents.on('did-start-navigation', (event, url, isInPlace, isMainFrame) => {
        if (isMainFrame && !isInPlace) closeInterviewWindows();
    });
    mainAppWindow.webContents.on('did-navigate', (event, url) => syncInterviewWindowLifecycle(url));
    mainAppWindow.webContents.on('did-navigate-in-page', (event, url, isMainFrame) => {
        if (isMainFrame) syncInterviewWindowLifecycle(url);
    });
    mainAppWindow.webContents.on('render-process-gone', () => closeInterviewWindows());

    loadAppContent();
    mainAppWindow.once('ready-to-show', () => {
        if (!isPresentationSafeMode) showApp();
    });
}

function isVersionAtLeast(actual, required) {
    const left = actual.split('.').map(Number);
    const right = required.split('.').map(Number);
    if (left.length !== 3 || right.length !== 3 || [...left, ...right].some(n => !Number.isInteger(n))) return false;
    for (let i = 0; i < 3; i++) {
        if (left[i] !== right[i]) return left[i] > right[i];
    }
    return true;
}

function validCompatibility(value) {
    return value && typeof value === 'object'
        && /^\d+\.\d+\.\d+$/.test(value.minimumDesktopVersion)
        && typeof value.rendererVersion === 'string'
        && value.rendererVersion.length <= 40;
}

const compatibilityCachePath = () => path.join(app.getPath('userData'), 'desktop-compatibility.json');

async function writeCompatibilityCache(compatibility) {
    try {
        await fs.writeFile(compatibilityCachePath(), JSON.stringify({ ...compatibility, cachedAt: Date.now() }), { mode: 0o600 });
    } catch (error) {
        console.warn('[App] Could not cache compatibility response:', error.message);
    }
}

async function readCompatibilityCache() {
    try {
        const cached = JSON.parse(await fs.readFile(compatibilityCachePath(), 'utf8'));
        if (!validCompatibility(cached) || !Number.isFinite(cached.cachedAt)) return null;
        if (Date.now() - cached.cachedAt > COMPATIBILITY_CACHE_MAX_AGE_MS) return null;
        return cached;
    } catch { return null; }
}

async function fetchCompatibilityWithRetry() {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await fetch(`${APP_ORIGIN}/api/desktop-compat`, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
            if (!response.ok) throw new Error(`Compatibility check failed (${response.status})`);
            const compatibility = await response.json();
            if (!validCompatibility(compatibility)) throw new Error('Compatibility response was invalid');
            await writeCompatibilityCache(compatibility);
            return { compatibility, cached: false };
        } catch (error) {
            lastError = error;
            if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 500));
        }
    }
    const compatibility = await readCompatibilityCache();
    if (compatibility) {
        console.warn('[App] Compatibility service unavailable; using the last verified response.');
        return { compatibility, cached: true };
    }
    throw lastError || new Error('Compatibility service unavailable');
}

async function loadAppContent() {
    if (!mainAppWindow) return;
    const startUrl = `${APP_URL}/dashboard?desktop=true`;
    mainAppWindow.loadURL(startUrl).catch(e => console.error('[App] Load fail:', e));

    // A remote availability or version lookup must never prevent the locally
    // installed app from opening. The signed-in renderer can still show its
    // normal update guidance, while a temporary web/API issue cannot strand
    // a customer behind a modal before the app has loaded.
    if (app.isPackaged) {
        void fetchCompatibilityWithRetry()
            .then(({ compatibility }) => {
                if (!isVersionAtLeast(app.getVersion(), compatibility.minimumDesktopVersion)) {
                    console.warn(
                        `[App] Desktop ${app.getVersion()} is below the recommended ${compatibility.minimumDesktopVersion}; continuing so the user can access the app.`,
                    );
                }
            })
            .catch(error => {
                console.warn('[App] Compatibility service unavailable; continuing without a startup block:', error.message);
            });
    }
}

function toggleApp() {
    if (!mainAppWindow || isPresentationSafeMode) return;
    if (mainAppWindow.isVisible()) {
        mainAppWindow.hide();
        isAppVisible = false;
    } else {
        mainAppWindow.show();
        mainAppWindow.focus();
        isAppVisible = true;
    }
}

function showApp() {
    if (!mainAppWindow || isPresentationSafeMode) return;
    mainAppWindow.show();
    mainAppWindow.focus();
}

function isInterviewSessionPage() {
    try { return Boolean(mainAppWindow && !mainAppWindow.isDestroyed() && new URL(mainAppWindow.webContents.getURL()).pathname === '/interview'); }
    catch { return false; }
}

function canShowInterviewOverlay() {
    return shouldShowInterviewOverlay({
        rendererReady: isInterviewRendererReady,
        isInterviewPage: isInterviewSessionPage(),
        presentationSafeMode: isPresentationSafeMode,
    });
}

function closeInterviewWindows() {
    isInterviewRendererReady = false;
    scannerOcrInFlight = false;
    cancelPendingScannerCapture();
    closeScannerFrame();
    if (floatingIconWindow && !floatingIconWindow.isDestroyed()) {
        floatingIconWindow.destroy();
    }
    floatingIconWindow = null;
    updateTrayMenu();
}

function syncInterviewWindowLifecycle(url) {
    const wasInterviewReady = isInterviewRendererReady;
    try {
        if (new URL(url).pathname === '/interview') return;
    } catch { /* Treat invalid or empty navigation targets as outside the interview. */ }
    closeInterviewWindows();
    if (wasInterviewReady && !isPresentationSafeMode && mainAppWindow && !mainAppWindow.isDestroyed()) {
        mainAppWindow.show();
        mainAppWindow.focus();
        isAppVisible = true;
    }
}

function setupIpcHandlers() {
    const onTrusted = (channel, handler) => ipcMain.on(channel, (event, ...args) => {
        if (!isTrustedPage(event, channel)) return;
        handler(event, ...args);
    });
    const handleTrusted = (channel, handler) => ipcMain.handle(channel, (event, ...args) => {
        if (!isTrustedPage(event, channel)) throw new Error('Untrusted desktop request');
        return handler(event, ...args);
    });
    handleTrusted('toggle-scanner-frame', async () => {
        if (isPresentationSafeMode) return { active: false, error: 'Presentation Safe Mode is active.' };
        if (scannerCaptureInFlight || scannerOcrInFlight) {
            return { active: false, error: 'The previous screen capture is still being read. Wait for it to finish before starting another one.' };
        }
        if (scannerOpenPromise) return scannerOpenPromise;
        if (isScannerFrameOpen || (scannerFrameWindow && !scannerFrameWindow.isDestroyed())) {
            closeScannerFrame();
            return { active: false };
        }
        // Ask macOS for consent before creating the always-on-top scanner.
        // In particular, a not-determined status must leave the native consent
        // dialog unobstructed instead of opening a scanner that immediately
        // reports a red capture failure behind it.
        scannerOpenPromise = (async () => {
            const setup = await prepareScreenCaptureSetup();
            if (setup.state !== 'ready') {
                return {
                    active: false,
                    setupState: setup.state,
                    permissionStatus: setup.permissionStatus,
                    message: screenCaptureSetupMessage(setup.state),
                };
            }
            return await createScannerFrame();
        })().finally(() => { scannerOpenPromise = null; });
        return scannerOpenPromise;
    });

    handleTrusted('open-screen-recording-settings', async () => {
        if (process.platform !== 'darwin') {
            return { success: false, error: 'Screen recording settings are managed by your operating system.' };
        }
        try {
            // macOS keeps screen-recording approval under the Privacy & Security
            // pane. The user still makes the final choice; AllyX only opens the
            // correct destination instead of making them search for it.
            await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
            return { success: true };
        } catch (error) {
            console.error('[Scanner] Could not open Screen & System Audio Recording settings:', error);
            return { success: false, error: 'Could not open System Settings. Open Privacy & Security → Screen & System Audio Recording.' };
        }
    });

    // Keep the first-use setup in one place. This check does not request or
    // infer consent: macOS remains the source of truth and the customer makes
    // the final choice in its own prompt or Settings pane.
    handleTrusted('get-desktop-permissions', async () => {
        const screenCaptureSetup = getPassiveScreenCaptureSetup();
        return {
            screen: screenCaptureSetup.permissionStatus,
            microphone: getMicrophonePermissionStatus(),
            platform: process.platform,
            screenCaptureSetup: screenCaptureSetup.state,
            isRunningFromMountedDmg: isRunningFromMountedDmg(),
        };
    });

    handleTrusted('request-microphone-access', async () => {
        if (process.platform !== 'darwin') {
            return { status: 'not-applicable', granted: true };
        }
        const current = getMicrophonePermissionStatus();
        if (current === 'granted') return { status: current, granted: true };
        if (current !== 'not-determined') return { status: current, granted: false };
        try {
            const granted = await systemPreferences.askForMediaAccess('microphone');
            return { status: getMicrophonePermissionStatus(), granted };
        } catch (error) {
            console.warn('[Audio] Could not request microphone access:', error);
            return { status: getMicrophonePermissionStatus(), granted: false };
        }
    });

    handleTrusted('capture-scanner-area', async () => {
        if (scannerCaptureInFlight) {
            return { success: false, failureCode: 'capture-in-progress', error: 'A screen capture is already being processed. Wait for it to finish.' };
        }
        scannerCaptureInFlight = true;
        let floatingIconWasVisible = false;
        try {
            if (!mainAppWindow || isPresentationSafeMode) return { success: false, error: 'Presentation Safe Mode is active.' };
            if (!scannerFrameWindow || scannerFrameWindow.isDestroyed()) {
                return { success: false, error: 'Screen Capture is no longer open. Reopen it and try again.' };
            }
            // Browser `screenX`/`screenY` can use a different coordinate scale
            // than Electron's display bounds on Retina and scaled displays.
            // Read the native BrowserWindow bounds here so the selected region
            // and `screen.getDisplayMatching` always use the same DIP space.
            const selectionBounds = scannerFrameWindow.getBounds();
            if (![selectionBounds.x, selectionBounds.y, selectionBounds.width, selectionBounds.height].every(Number.isFinite) || selectionBounds.width < 1 || selectionBounds.height < 1) {
                return { success: false, error: 'Invalid capture bounds.' };
            }
            // `getMediaAccessStatus('screen')` can remain stale after the user
            // changes the current macOS Screen & System Audio toggle. Attempt the
            // actual capture first; its returned pixels are the only useful signal.
            const display = screen.getDisplayMatching(selectionBounds);
            try {
                calculateCaptureCrop(display.bounds, { width: display.bounds.width, height: display.bounds.height }, selectionBounds);
            } catch (error) {
                if (error instanceof Error && error.message === 'Select an area within one display.') {
                    return {
                        success: false,
                        failureCode: 'display-changed',
                        error: 'Keep the Screen Capture frame entirely on one display, then try Capture again.',
                    };
                }
                return { success: false, failureCode: 'invalid-capture-area', error: 'The Screen Capture area is invalid. Reopen it and try again.' };
            }

            // Hide AllyX's own capture chrome for the native snapshot, then
            // restore it. The captured image should contain the selected text,
            // not the scanner or floating assistant controls.
            floatingIconWasVisible = Boolean(floatingIconWindow && !floatingIconWindow.isDestroyed() && floatingIconWindow.isVisible());
            scannerFrameWindow?.hide();
            if (floatingIconWasVisible) floatingIconWindow?.hide();
            // Give macOS a compositor turn after hiding the selection frame.
            // This avoids a transient empty thumbnail immediately after focus.
            await new Promise(resolve => setTimeout(resolve, 350));
            const capture = await getScannerAreaCapture(display, selectionBounds);
            if (!capture.source || !capture.size) {
                const result = nativeScreenCaptureFailure(capture);
                console.warn('[Scanner] No usable screen image:', result.diagnostics);
                return result;
            }
            try {
                // The macOS utility has already captured the exact selection
                // rectangle. Other platforms still receive a full thumbnail
                // and need the geometry crop below.
                const image = capture.isExactRegion
                    ? capture.source.thumbnail
                    : capture.source.thumbnail.crop(calculateCaptureCrop(display.bounds, capture.size, selectionBounds));
                // Retina-sized scans can otherwise create a very large data URL
                // and stall the renderer while it receives and OCRs the image.
                const imageData = constrainNativeCaptureImage(image).toDataURL();
                const rendererAccepted = await deliverScannerCapture(imageData);
                if (!rendererAccepted) {
                    return {
                        success: false,
                        failureCode: 'renderer-not-ready',
                        error: 'AllyX was not ready to read the capture. Reopen Screen Capture and try again.',
                    };
                }
                floatingIconWindow?.webContents.send('overlay-status', { message: 'Reading captured code…', tone: 'progress' });
                closeScannerFrame();
                return { success: true };
            } catch (err) {
                console.error('[Scanner] Could not prepare the captured screen image:', err);
                return screenCaptureFailure({
                    platform: process.platform,
                    permissionStatus: getScreenCapturePermissionStatus(),
                    capture: {
                        reason: 'post-capture-error',
                        attempts: capture.attempts,
                        sourceCount: capture.sourceCount,
                        displayId: String(display.id),
                        displayCount: screen.getAllDisplays().length,
                        sourceDisplayIdCount: capture.sourceDisplayIdCount,
                    },
                });
            }
        } catch (err) {
            console.error('[Scanner] Native screen capture failed:', err);
            return {
                success: false,
                failureCode: 'capture-api-error',
                error: 'Screen Capture could not start. Close and reopen Screen Capture, then try again.',
            };
        } finally {
            scannerCaptureInFlight = false;
            if (!isPresentationSafeMode && scannerFrameWindow && !scannerFrameWindow.isDestroyed()) scannerFrameWindow.showInactive();
            if (!isPresentationSafeMode && floatingIconWasVisible && floatingIconWindow && !floatingIconWindow.isDestroyed()) floatingIconWindow.showInactive();
        }
    });

    // Legacy renderers must never silently capture the desktop for this action.
    handleTrusted('capture-scanner-display', async () => ({ success: false, error: 'Reopen Screen Capture and choose Capture webpage content.' }));
    const excludedWindowIds = () => BrowserWindow.getAllWindows().filter(w => !w.isDestroyed()).map(w => w.getMediaSourceId());
    handleTrusted('list-scanner-windows', async () => {
        if (!scannerFrameWindow || isPresentationSafeMode) return { success: false, windows: [], error: 'Reopen Screen Capture.' };
        pendingWindowPreview = null;
        try {
            const sources = await windowSources(options => desktopCapturer.getSources(options), excludedWindowIds());
            return { success: true, windows: sources.map(source => ({ id: source.id, name: source.name })) };
        } catch { return { success: false, windows: [], error: 'Could not list windows. Check screen recording permission and try again.' }; }
    });
    handleTrusted('preview-scanner-window', async (_event, sourceId) => {
        pendingWindowPreview = null;
        if (!scannerFrameWindow || isPresentationSafeMode || typeof sourceId !== 'string' || !sourceId.startsWith('window:')) return { success: false, error: 'Choose a browser window.' };
        try {
            const sources = await windowSources(options => desktopCapturer.getSources(options), excludedWindowIds(), true);
            const source = sources.find(item => item.id === sourceId);
            if (!source || source.thumbnail.isEmpty()) return { success: false, error: 'That window is unavailable. Bring it onscreen, then select it again.' };
            const image = constrainNativeCaptureImage(source.thumbnail);
            const id = ++scannerCaptureSequence;
            pendingWindowPreview = { id, image, frame: scannerFrameWindow, created: Date.now() };
            return { success: true, id, imageData: image.toDataURL() };
        } catch { return { success: false, error: 'Could not capture that window. Try selected-area capture.' }; }
    });
    handleTrusted('capture-scanner-page', async (_event, previewId, top) => {
        if (scannerCaptureInFlight) return { success: false, error: 'A capture is already being processed.' };
        const preview = pendingWindowPreview;
        if (!preview || preview.id !== previewId || preview.frame !== scannerFrameWindow || !scannerFrameWindow || isPresentationSafeMode || Date.now() - preview.created > 120000) return { success: false, error: 'The preview expired. Select the window again.' };
        scannerCaptureInFlight = true;
        try {
            const imageData = cropPage(preview.image, top).toDataURL();
            if (!await deliverScannerCapture(imageData, 'area')) return { success: false, error: 'AllyX was not ready to read the capture. Try again.' };
            pendingWindowPreview = null;
            closeScannerFrame();
            return { success: true };
        } catch (error) { return { success: false, error: error.message || 'Could not capture webpage content.' }; }
        finally { scannerCaptureInFlight = false; }
    });

    handleTrusted('acknowledge-scanner-capture', async (_event, captureId) => ({
        success: typeof captureId === 'string' && settlePendingScannerCapture(captureId, true),
    }));

    handleTrusted('set-scanner-processing', async (_event, active) => {
        scannerOcrInFlight = Boolean(active);
        return { success: true, active: scannerOcrInFlight };
    });

    onTrusted('toggle-app', () => toggleApp());
    onTrusted('show-app', () => showApp());

    onTrusted('hide-app', () => {
        if (mainAppWindow) {
            mainAppWindow.hide();
            isAppVisible = false;
        }
    });

    onTrusted('hide-icon', () => {
        if (floatingIconWindow) {
            floatingIconWindow.hide();
        }
        if (mainAppWindow) {
            mainAppWindow.hide();
            isAppVisible = false;
        }
    });
    onTrusted('hide-overlay', () => floatingIconWindow?.hide());

    handleTrusted('open-google-sign-in', async (_event, authorizationUrl) => {
        await openGoogleSignInInSystemBrowser(authorizationUrl);
        return { success: true };
    });
    onTrusted('retry-connection', () => loadAppContent());
    onTrusted('quit-app', () => app.quit());
    onTrusted('go-back', () => mainAppWindow?.webContents.goBack());
    onTrusted('close-app', () => {
        if (mainAppWindow) {
            mainAppWindow.hide();
            isAppVisible = false;
        }
    });
    onTrusted('copy-to-clipboard', (event, text) => { if (typeof text === 'string') clipboard.writeText(text.slice(0, 100000)); });
    onTrusted('get-desktop-mode', (event) => { event.returnValue = true; });
    onTrusted('get-presentation-safe-mode', (event) => { event.returnValue = isPresentationSafeMode; });
    handleTrusted('set-presentation-safe-mode', (event, active) => ({ active: setPresentationSafeMode(active) }));
    handleTrusted('toggle-presentation-safe-mode', () => ({ active: setPresentationSafeMode(!isPresentationSafeMode) }));
    onTrusted('can-go-back', (event) => { event.returnValue = mainAppWindow?.webContents.canGoBack() || false; });

    const readSystemAudioSources = () => getScreenSourcesWithRetry({
        getSources: options => desktopCapturer.getSources(options),
        // Source IDs are sufficient for `getUserMedia`; requesting pixels here
        // adds work without improving meeting-audio setup.
        options: { types: ['screen'], thumbnailSize: { width: 0, height: 0 } },
    });

    const systemAudioSourceError = (result) => {
        switch (result?.reason) {
            case 'no-sources':
                return 'macOS did not provide a display for meeting audio. Close System Settings and try again.';
            case 'source-id-missing':
                return 'macOS returned a display without a usable identifier. Close System Settings, then restart AllyX and try again.';
            case 'capture-timeout':
                return 'macOS took too long to list displays for meeting audio. Close System Settings and other screen-recording apps, then try again.';
            default:
                return 'macOS could not provide a display for meeting audio. Close System Settings and other screen-recording apps, then try again.';
        }
    };

    const listSystemAudioSources = async () => {
        if (isPresentationSafeMode) return { success: false, sources: [], error: 'Presentation Safe Mode is active.' };
        // Background display enumeration should never create a second macOS
        // consent request. The explicit Screen Capture action owns first-use
        // consent; this handler only runs after the passive status is ready.
        const setup = getPassiveScreenCaptureSetup();
        if (setup.state !== 'ready') {
            return {
                success: false,
                sources: [],
                setupState: setup.state,
                error: screenCaptureSetupMessage(setup.state),
            };
        }
        const result = await readSystemAudioSources();
        if (!result.sources.length) {
            console.warn('[Meeting Audio] No usable display sources:', {
                reason: result.reason,
                attempts: result.attempts,
                sourceCount: result.sourceCount,
                selectableSourceCount: result.selectableSourceCount,
            });
            return {
                success: false,
                sources: [],
                error: systemAudioSourceError(result),
                diagnostics: {
                    reason: result.reason,
                    attempts: result.attempts,
                    sourceCount: result.sourceCount,
                },
            };
        }
        return {
            success: true,
            sources: result.sources.map((source, index) => ({
                id: source.id,
                name: String(source.name || `Display ${index + 1}`).slice(0, 120),
            })),
        };
    };

    handleTrusted('list-system-audio-sources', listSystemAudioSources);
    // Kept for older renderer releases. The current renderer uses the explicit
    // source picker above and never silently chooses a display on multi-monitor
    // machines.
    handleTrusted('get-system-audio-source', async () => {
        const result = await listSystemAudioSources();
        return result.success && result.sources.length === 1
            ? { success: true, sourceId: result.sources[0].id }
            : { success: false, error: result.error || 'Choose a display before starting meeting audio.' };
    });

    handleTrusted('start-system-audio-capture', async (_event, requestedSourceId) => {
        try {
            if (isPresentationSafeMode) return { success: false, error: 'Presentation Safe Mode is active.' };
            // Do not block desktopCapturer from making the first request based
            // on getMediaAccessStatus('screen'). On macOS that status can lag
            // behind a newly enabled Screen & System Audio toggle; Chromium's
            // capture result is authoritative for this running process.
            // Meeting audio uses an entire display source. Choosing explicitly
            // prevents a second monitor from being captured by accident.
            const sourceResult = await readSystemAudioSources();
            const sources = sourceResult.sources;
            if (!sources.length) {
                return {
                    success: false,
                    failureCode: sourceResult.reason || 'no-sources',
                    restartRequired: process.platform === 'darwin' && sourceResult.reason === 'capture-timeout',
                    error: systemAudioSourceError(sourceResult),
                };
            }
            const selectedSource = typeof requestedSourceId === 'string'
                ? sources.find(source => source.id === requestedSourceId)
                : (sources.length === 1 ? sources[0] : undefined);
            if (!selectedSource) {
                return {
                    success: false,
                    selectionRequired: true,
                    error: sources.length > 1
                        ? 'Choose the display that contains your meeting before starting meeting audio.'
                        : 'The selected display is no longer available. Refresh the display list and choose it again.',
                };
            }
            return { success: true, sourceId: selectedSource.id };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : 'Meeting audio could not be started.' };
        }
    });

    handleTrusted('stop-system-audio-capture', async () => {
        mainAppWindow?.webContents.send('stop-audio-source');
        return { success: true };
    });

    onTrusted('relaunch-app', () => {
        isQuitting = true;
        app.relaunch();
        app.quit();
    });

    onTrusted('transcript-update', (event, text) => floatingIconWindow?.webContents.send('transcript', text));
    onTrusted('answer-update', (event, text) => {
        if (!floatingIconWindow || floatingIconWindow.isDestroyed()) return;
        floatingIconWindow.webContents.send('answer', text);
        if (!isPresentationSafeMode) floatingIconWindow.showInactive();
    });
    onTrusted('overlay-captured-text', (event, text) => {
        if (typeof text === 'string' && text.trim()) floatingIconWindow?.webContents.send('overlay-captured-text', text.slice(0, 12000));
    });
    onTrusted('overlay-status', (event, status) => {
        if (!status || typeof status.message !== 'string') return;
        floatingIconWindow?.webContents.send('overlay-status', {
            message: status.message.slice(0, 500),
            tone: ['progress', 'success', 'error'].includes(status.tone) ? status.tone : 'progress',
            action: status.action === 'continue' ? 'continue' : undefined,
        });
    });
    onTrusted('interview-ready', (event, ready) => {
        isInterviewRendererReady = Boolean(ready) && isInterviewSessionPage();
        if (!isInterviewRendererReady) {
            closeInterviewWindows();
            return;
        }
        createFloatingIcon();
        if (mainAppWindow && !mainAppWindow.isDestroyed()) {
            mainAppWindow.hide();
            isAppVisible = false;
        }
        updateTrayMenu();
    });
    onTrusted('resize-overlay', (event, { width, height }) => {
        if (!Number.isFinite(width) || !Number.isFinite(height)) return;
        floatingIconWindow?.setSize(
            Math.max(320, Math.min(900, Math.round(width))),
            Math.max(220, Math.min(900, Math.round(height)))
        );
    });
    onTrusted('set-ignore-mouse-events', (event, ignore) => setOverlayInteractive(!ignore));
    onTrusted('get-overlay-state', (event) => {
        event.returnValue = { interactive: isOverlayInteractive };
    });
    handleTrusted('submit-overlay-question', async (event, value) => {
        const question = typeof value === 'string' ? value.trim() : '';
        if (question.length > 12000) return { success: false, error: 'This question exceeds 12,000 characters. Split it into smaller questions; no text has been submitted.' };
        if (!question || !mainAppWindow || mainAppWindow.isDestroyed()) return { success: false, error: 'Enter a question first.' };
        if (!isInterviewSessionPage() || !isInterviewRendererReady) return { success: false, error: 'Wait for the interview session to finish loading.' };
        mainAppWindow.webContents.send('overlay-manual-question', question);
        return { success: true };
    });
    handleTrusted('continue-overlay-answer', async () => {
        if (!mainAppWindow || mainAppWindow.isDestroyed() || !isInterviewSessionPage() || !isInterviewRendererReady) {
            return { success: false, error: 'Start an interview session in the main window first.' };
        }
        mainAppWindow.webContents.send('overlay-continue-answer');
        return { success: true };
    });
    handleTrusted('toggle-overlay-listening', async () => {
        if (!mainAppWindow || mainAppWindow.isDestroyed() || !isInterviewSessionPage() || !isInterviewRendererReady) {
            return { success: false, error: 'Start an interview session first.' };
        }
        mainAppWindow.webContents.send('overlay-toggle-listening');
        return { success: true };
    });
    handleTrusted('end-overlay-interview', async () => {
        if (!mainAppWindow || mainAppWindow.isDestroyed() || !isInterviewSessionPage() || !isInterviewRendererReady) {
            return { success: false, error: 'No active interview session was found.' };
        }
        mainAppWindow.webContents.send('overlay-end-interview');
        return { success: true };
    });
    onTrusted('recording-state-update', (event, state) => {
        floatingIconWindow?.webContents.send('recording-state', {
            listening: Boolean(state?.listening),
            meetingAudio: Boolean(state?.meetingAudio),
            finalizing: Boolean(state?.finalizing),
        });
    });

    // Updater IPCs
    // No update feed is configured for this fork. Re-enable only with an
    // owner-controlled signed release channel.
}

function updateTrayMenu() {
    if (!tray) return;
    const contextMenu = Menu.buildFromTemplate([
        {
            label: process.platform === 'darwin' ? 'Capture Privacy (Experimental)' : 'Capture Privacy',
            type: 'checkbox',
            checked: capturePrivacy.status().requested,
            click: (item) => {
                capturePrivacy.setRequested(item.checked);
                updateTrayMenu();
            }
        },
        { label: 'Capture Privacy Status / Test Instructions', click: showPrivacyStatus },
        { type: 'separator' },
        {
            label: isPresentationSafeMode ? 'Restore Assistant' : 'Hide Assistant Locally',
            accelerator: 'CommandOrControl+Shift+H',
            click: () => setPresentationSafeMode(!isPresentationSafeMode)
        },
        { label: 'Open Assistant', enabled: !isPresentationSafeMode, click: () => toggleApp() },
        { label: 'Show Answer Overlay', enabled: canShowInterviewOverlay(), click: () => floatingIconWindow?.showInactive() },
        {
            label: isOverlayInteractive ? 'Make Overlay Click-through' : 'Make Overlay Interactive',
            accelerator: 'CommandOrControl+Shift+O',
            enabled: canShowInterviewOverlay(),
            click: () => setOverlayInteractive(!isOverlayInteractive)
        },
        { type: 'separator' },
        { label: 'Quit Entirely', click: () => app.quit() }
    ]);
    tray.setContextMenu(contextMenu);
    tray.setToolTip(isPresentationSafeMode ? 'AllyX — Presentation Safe Mode' : 'AllyX');
}

function createTray() {
    try {
        const icon = nativeImage.createFromPath(ICON_PATH).resize({ width: 16, height: 16 });
        tray = new Tray(icon);
        updateTrayMenu();
        tray.on('click', () => {
            if (!isPresentationSafeMode) toggleApp();
        });
    } catch (e) { }
}

async function initialize() {
    initPlatform();
    registerDesktopProtocol();
    const appSession = session.fromPartition('persist:main');
    const allowedPermission = (wc, permission, details) => {
        try {
            return isAllowedMainWindowMediaPermission({
                isMainWindow: wc === mainAppWindow?.webContents,
                isScannerWindow: wc === scannerFrameWindow?.webContents
                    && new URL(wc.getURL()).pathname === '/scanner-frame',
                isTrustedOrigin: new URL(wc.getURL()).origin === APP_ORIGIN,
                permission,
                details,
            });
        }
        catch { return false; }
    };
    appSession.setPermissionRequestHandler((wc, permission, callback, details) => callback(allowedPermission(wc, permission, details)));
    appSession.setPermissionCheckHandler((wc, permission, _requestingOrigin, details) => allowedPermission(wc, permission, details));
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    createMainAppWindow();
    isInitialized = true;
    if (pendingDesktopOAuthCallback) {
        const callbackUrl = pendingDesktopOAuthCallback;
        pendingDesktopOAuthCallback = null;
        handleDesktopOAuthCallback(callbackUrl);
    }
    createTray();
    setupIpcHandlers();
    hideShortcutRegistered = globalShortcut.register('CommandOrControl+Shift+H', () => {
        setPresentationSafeMode(!isPresentationSafeMode);
    });
    globalShortcut.register('CommandOrControl+Shift+O', () => {
        if (canShowInterviewOverlay()) setOverlayInteractive(!isOverlayInteractive);
    });


}

if (hasSingleInstanceLock) {
    app.on('second-instance', (_event, commandLine) => {
        const deepLink = commandLine.find(value => typeof value === 'string' && value.startsWith(`${DEEP_LINK_SCHEME}://`));
        if (deepLink) {
            handleDesktopOAuthCallback(deepLink);
            return;
        }
        showApp();
    });
    app.whenReady().then(initialize);
}
app.on('activate', () => {
    if (!app.isReady() || isQuitting || isPresentationSafeMode) return;
    if (!mainAppWindow || mainAppWindow.isDestroyed()) {
        createMainAppWindow();
    } else {
        showApp();
    }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => {
    isQuitting = true;
    // A duplicate launch can be rejected before Electron finishes becoming
    // ready. Calling globalShortcut in that state throws and replaces the
    // normal quit with a customer-facing JavaScript error dialog.
    if (app.isReady()) globalShortcut.unregisterAll();
});
