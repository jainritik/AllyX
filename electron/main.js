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
const { getUsableScreenSource } = require('./screen-capture-source');
const { isAllowedMainWindowMediaPermission, shouldAttemptScreenCapturePermission } = require('./media-permission-policy');

// Electron 39 moved macOS desktop audio to the CoreAudio Tap path. On machines
// where that path cannot start, Chromium exposes a live-but-silent track with no
// useful error. AllyX already asks for the established Screen & System Audio
// permission, so retain that dependable capture path until CoreAudio Tap is
// consistently reliable across supported macOS releases.
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
let screenPermissionRequestAttempted = false;
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
    isScannerFrameOpen = false;
    if (scannerFrameWindow && !scannerFrameWindow.isDestroyed()) {
        scannerFrameWindow.removeAllListeners('closed');
        scannerFrameWindow.destroy();
    }
    scannerFrameWindow = null;
    broadcastScannerState(false);
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

// --- STEALTH SCANNER FRAME ---
function createScannerFrame() {
    if (isPresentationSafeMode || !isInterviewRendererReady || !isInterviewSessionPage()) return;
    // v19.0 FIX: Remove listeners from old window before destroying to prevent race condition "closed" signals
    if (scannerFrameWindow) {
        try {
            if (!scannerFrameWindow.isDestroyed()) {
                scannerFrameWindow.removeAllListeners('closed');
                scannerFrameWindow.destroy();
            }
        } catch (e) { }
    }
    scannerFrameWindow = null;
    isScannerFrameOpen = true;

    const primaryWorkArea = screen.getPrimaryDisplay().workArea;

    scannerFrameWindow = new BrowserWindow({
        width: 400,
        height: 300,
        x: Math.floor(primaryWorkArea.x + (primaryWorkArea.width - 400) / 2),
        y: Math.floor(primaryWorkArea.y + (primaryWorkArea.height - 300) / 2),
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
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
            webSecurity: true
        }
    });
    allowAppNavigation(scannerFrameWindow, APP_ORIGIN, url => shell.openExternal(url));

    if (process.platform === 'win32') {
        scannerFrameWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    } else {
        scannerFrameWindow.setAlwaysOnTop(true, 'floating', 1);
    }

    scannerFrameWindow.loadURL(`${APP_URL}/scanner-frame?isScanner=true`, {
        extraHeaders: "x-is-scanner: true\n"
    });
    scannerFrameWindow.once('ready-to-show', () => {
        if (!isPresentationSafeMode) scannerFrameWindow?.show();
    });

    scannerFrameWindow.on('closed', () => {
        scannerFrameWindow = null;
        isScannerFrameOpen = false;
        broadcastScannerState(false);
    });

    broadcastScannerState(true);
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
    onTrusted('update-scanner-bounds', (event, { x, y, width, height }) => {
        if (![x, y, width, height].every(Number.isFinite) || width < 50 || height < 50 || width > 4000 || height > 4000) return;
        if (scannerFrameWindow && !scannerFrameWindow.isDestroyed()) {
            scannerFrameWindow.setBounds({
                x: Math.round(x),
                y: Math.round(y),
                width: Math.round(width),
                height: Math.round(height)
            });
        }
    });

    handleTrusted('toggle-scanner-frame', async () => {
        if (isPresentationSafeMode) return { active: false, error: 'Presentation Safe Mode is active.' };
        if (isScannerFrameOpen) {
            isScannerFrameOpen = false;
            // v19.0: Atomic close with broadcase
            if (scannerFrameWindow) {
                try { scannerFrameWindow.close(); } catch (e) { }
                scannerFrameWindow = null;
            }
            return { active: false };
        } else {
            if (!isInterviewSessionPage() || !isInterviewRendererReady) return { active: false, error: 'Wait for the interview session to finish loading.' };
            createScannerFrame();
            return { active: true };
        }
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

    handleTrusted('capture-scanner-area', async (event, bounds) => {
        let permission = null;
        try {
            if (!mainAppWindow || isPresentationSafeMode) return { success: false, error: 'Presentation Safe Mode is active.' };
            if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width < 1 || bounds.height < 1) return { success: false, error: 'Invalid capture bounds.' };
            if (process.platform === 'darwin') {
                permission = systemPreferences.getMediaAccessStatus('screen');
                if (!shouldAttemptScreenCapturePermission(permission, screenPermissionRequestAttempted)) {
                    return {
                        success: false,
                        settingsRequired: true,
                        restartRequired: true,
                        error: 'Allow AllyX in Screen & System Audio Recording, then restart AllyX.',
                    };
                }
                if (permission !== 'granted') screenPermissionRequestAttempted = true;
            }
            const display = screen.getDisplayMatching(bounds);
            calculateCaptureCrop(display.bounds, { width: display.bounds.width, height: display.bounds.height }, bounds);

            // Hide the selection chrome for the native snapshot, then restore it.
            scannerFrameWindow?.hide();
            await new Promise(resolve => setTimeout(resolve, 180));
            const capture = await getUsableScreenSource({
                getSources: options => desktopCapturer.getSources(options),
                displayId: display.id,
                options: {
                    types: ['screen'],
                    thumbnailSize: {
                        width: Math.max(1, Math.round(display.bounds.width * display.scaleFactor)),
                        height: Math.max(1, Math.round(display.bounds.height * display.scaleFactor)),
                    },
                    fetchWindowIcons: false,
                },
            });
            if (!capture.source || !capture.size) {
                const permissionStillMissing = process.platform === 'darwin'
                    && systemPreferences.getMediaAccessStatus('screen') !== 'granted';
                if (permissionStillMissing) {
                    return {
                        success: false,
                        settingsRequired: true,
                        restartRequired: true,
                        error: 'Screen & System Audio Recording access is not active yet. Confirm the permission, then restart AllyX.',
                    };
                }
                if (capture.reason === 'display-not-found') {
                    return { success: false, error: 'The selected display changed. Reopen Screen Capture and keep the frame within one display.' };
                }
                return { success: false, error: 'macOS did not provide an image yet. Wait a moment, close other screen-recording apps, then press Capture again.' };
            }
            const crop = calculateCaptureCrop(display.bounds, capture.size, bounds);
            const imageData = capture.source.thumbnail.crop(crop).toDataURL();
            mainAppWindow.webContents.send('process-ocr-request', { imageData });
            floatingIconWindow?.webContents.send('overlay-status', { message: 'Reading captured code…', tone: 'progress' });
            closeScannerFrame();
            return { success: true };
        } catch (err) {
            const permissionStillMissing = process.platform === 'darwin'
                && systemPreferences.getMediaAccessStatus('screen') !== 'granted';
            if (permissionStillMissing || permission === 'denied' || permission === 'restricted') {
                return {
                    success: false,
                    settingsRequired: true,
                    restartRequired: true,
                    error: 'Screen & System Audio Recording access is not active yet. Confirm the permission, then press Restart AllyX.',
                };
            }
            console.error('[Scanner] Native screen capture failed:', err);
            return { success: false, error: 'Could not capture this screen. Wait a moment, then press Capture again.' };
        } finally {
            if (!isPresentationSafeMode && scannerFrameWindow && !scannerFrameWindow.isDestroyed()) scannerFrameWindow.showInactive();
        }
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

    const listSystemAudioSources = async () => {
        if (isPresentationSafeMode) return { success: false, sources: [], error: 'Presentation Safe Mode is active.' };
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
        return {
            success: true,
            sources: sources.map((source, index) => ({
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
            if (process.platform === 'darwin') {
                const permissionStatus = systemPreferences.getMediaAccessStatus('screen');
                if (!shouldAttemptScreenCapturePermission(permissionStatus, screenPermissionRequestAttempted)) {
                    return {
                        success: false,
                        permissionStatus,
                        restartRequired: true,
                        error: 'macOS has not applied Screen & System Audio access to this AllyX process. Enable AllyX in System Settings, then restart AllyX once.',
                    };
                }
                // After a stale permission record is cleared, macOS may report
                // `denied` until one capture attempt registers the current app
                // identity. Permit that bootstrap attempt once per app launch.
                if (permissionStatus !== 'granted') screenPermissionRequestAttempted = true;
            }
            // Meeting audio uses an entire display source. Choosing explicitly
            // prevents a second monitor from being captured by accident.
            const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
            if (!sources.length) return { success: false, error: 'No display source was available for meeting audio.' };
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
        const question = typeof value === 'string' ? value.trim().slice(0, 12000) : '';
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
    const allowedPermission = (wc, permission) => {
        try {
            return isAllowedMainWindowMediaPermission({
                isMainWindow: wc === mainAppWindow?.webContents,
                isTrustedOrigin: new URL(wc.getURL()).origin === APP_ORIGIN,
                permission,
            });
        }
        catch { return false; }
    };
    appSession.setPermissionRequestHandler((wc, permission, callback) => callback(allowedPermission(wc, permission)));
    appSession.setPermissionCheckHandler((wc, permission) => allowedPermission(wc, permission));
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
    globalShortcut.unregisterAll();
});
