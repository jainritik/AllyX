const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, clipboard, session, desktopCapturer, globalShortcut, dialog, shell } = require('electron');
const path = require('path');
const os = require('os');
const { createCapturePrivacy } = require('./capture-privacy');
const { allowAppNavigation } = require('./navigation-policy');
const { shouldPreventWindowClose } = require('./window-lifecycle');
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
        title: 'ZEDX Capture Privacy',
        message: `Capture privacy request: ${state.requested ? 'ON' : 'OFF'}`,
        detail: [
            `ZEDX ${app.getVersion()} · ${process.platform} ${os.release()}`,
            'This mode keeps ZEDX visible on your display. It does not pause the assistant.',
            failures.length ? `${failures.length} window requests were not applied.` : 'Window request settings applied.',
            process.platform === 'darwin'
                ? 'Experimental on macOS: modern screen sharing can ignore this setting, including captures using ScreenCaptureKit.'
                : 'Capture exclusion depends on Windows version and the recording application.',
            `Receiver verification: ${state.receiverVerificationStatus.toUpperCase()}. Check from a second participant while sharing the entire display. If ZEDX is visible there, this mode does not work for that setup.`,
            `Not covered by the BrowserWindow request: ${state.uncoveredSurfaces.join(', ')}.`,
            hideShortcutRegistered ? 'Cmd/Ctrl+Shift+H hides the app locally instead.' : 'Hide shortcut unavailable; use the tray menu.',
        ].join('\n\n'),
        buttons: ['Close'],
    });
}

const ICON_PATH = path.join(__dirname, '..', 'public', 'favicon.ico');

function initPlatform() {
    if (process.platform === 'win32') {
        app.setAppUserModelId('com.zedx.ai');
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

const isDev = !app.isPackaged;
const APP_URL = process.env.ZEDX_APP_URL || (isDev ? 'http://localhost:3000' : 'https://zedx-private-demo.vercel.app');
const APP_ORIGIN = new URL(APP_URL).origin;
let isQuitting = false;

function isTrustedPage(event, channel) {
    const sender = event.sender;
    const frame = event.senderFrame;
    const frameUrl = frame?.url;
    if (!frameUrl) return false;
    if (sender === mainAppWindow?.webContents) {
        return frame === sender.mainFrame && frame.origin === APP_ORIGIN;
    }
    if (sender === scannerFrameWindow?.webContents) {
        try { return frame === sender.mainFrame && frame.origin === APP_ORIGIN && new URL(frameUrl).pathname === '/scanner-frame' && ['update-scanner-bounds', 'capture-scanner-area'].includes(channel); } catch { return false; }
    }
    if (sender === floatingIconWindow?.webContents) {
        return frame === sender.mainFrame
            && frameUrl.startsWith('file:')
            && ['show-app', 'hide-overlay', 'resize-overlay', 'set-ignore-mouse-events', 'get-overlay-state', 'submit-overlay-question', 'toggle-scanner-frame'].includes(channel);
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
        floatingIconWindow?.showInactive();
        isAppVisible = true;
    }

    updateTrayMenu();
    return isPresentationSafeMode;
}

// --- STEALTH SCANNER FRAME ---
function createScannerFrame() {
    if (isPresentationSafeMode) return;
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

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    scannerFrameWindow = new BrowserWindow({
        width: 400,
        height: 300,
        x: Math.floor(width / 2 - 200),
        y: Math.floor(height / 2 - 150),
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

    floatingIconWindow.loadFile(path.join(__dirname, 'overlay.html'));
    floatingIconWindow.once('ready-to-show', () => {
        if (!isPresentationSafeMode) floatingIconWindow?.show();
    });
}

function setOverlayInteractive(active) {
    isOverlayInteractive = Boolean(active);
    if (!floatingIconWindow || floatingIconWindow.isDestroyed()) return isOverlayInteractive;
    floatingIconWindow.setIgnoreMouseEvents(!isOverlayInteractive, { forward: true });
    floatingIconWindow.setFocusable(isOverlayInteractive);
    floatingIconWindow.webContents.send('overlay-interaction-changed', isOverlayInteractive);
    if (isOverlayInteractive && !isPresentationSafeMode) {
        floatingIconWindow.showInactive();
    }
    return isOverlayInteractive;
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
            partition: 'persist:main'
        }
    });
    allowAppNavigation(mainAppWindow, APP_ORIGIN, url => shell.openExternal(url));

    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    mainAppWindow.webContents.setUserAgent(userAgent);

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
    mainAppWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error(`[App] Load fail: ${errorDescription} (${errorCode})`);
        mainAppWindow.webContents.send('load-error', errorDescription);
    });

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

async function loadAppContent() {
    if (!mainAppWindow) return;
    if (app.isPackaged) {
        try {
            const response = await fetch(`${APP_ORIGIN}/api/desktop-compat`, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
            if (!response.ok) throw new Error(`Compatibility check failed (${response.status})`);
            const compatibility = await response.json();
            if (!isVersionAtLeast(app.getVersion(), compatibility.minimumDesktopVersion)) {
                dialog.showErrorBox('ZEDX update required', `This web release needs desktop version ${compatibility.minimumDesktopVersion} or newer. Please install the current beta build.`);
                return;
            }
        } catch (error) {
            dialog.showErrorBox('ZEDX connection unavailable', 'Could not verify desktop and web version compatibility. Check your connection and retry from the tray.');
            return;
        }
    }
    const startUrl = `${APP_URL}/dashboard?desktop=true`;
    mainAppWindow.loadURL(startUrl).catch(e => console.error('[App] Load fail:', e));
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
            createScannerFrame();
            return { active: true };
        }
    });

    handleTrusted('capture-scanner-area', async (event, bounds) => {
        try {
            if (!mainAppWindow || isPresentationSafeMode) return { success: false, error: 'Presentation Safe Mode is active.' };
            if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width < 1 || bounds.height < 1) return { success: false, error: 'Invalid capture bounds.' };
            const display = screen.getDisplayMatching(bounds);
            const relative = { x: bounds.x - display.bounds.x, y: bounds.y - display.bounds.y, width: bounds.width, height: bounds.height };
            if (relative.x < 0 || relative.y < 0 || relative.x + relative.width > display.bounds.width || relative.y + relative.height > display.bounds.height) return { success: false, error: 'Select an area within one display.' };

            // Hide the selection chrome for the native snapshot, then restore it.
            scannerFrameWindow?.hide();
            await new Promise(resolve => setTimeout(resolve, 120));
            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: {
                    width: Math.max(1, Math.round(display.bounds.width * display.scaleFactor)),
                    height: Math.max(1, Math.round(display.bounds.height * display.scaleFactor)),
                },
                fetchWindowIcons: false,
            });
            if (sources.length === 0) return { success: false };
            const source = sources.find(item => item.display_id === String(display.id)) || (sources.length === 1 ? sources[0] : null);
            if (!source) return { success: false, error: 'Could not identify the selected display.' };
            const size = source.thumbnail.getSize();
            if (!size.width || !size.height) return { success: false, error: 'Screen capture permission is required.' };
            const scaleX = size.width / display.bounds.width;
            const scaleY = size.height / display.bounds.height;
            const crop = {
                x: Math.max(0, Math.round(relative.x * scaleX)),
                y: Math.max(0, Math.round(relative.y * scaleY)),
                width: Math.max(1, Math.min(size.width, Math.round(relative.width * scaleX))),
                height: Math.max(1, Math.min(size.height, Math.round(relative.height * scaleY))),
            };
            if (crop.x + crop.width > size.width) crop.width = size.width - crop.x;
            if (crop.y + crop.height > size.height) crop.height = size.height - crop.y;
            const imageData = source.thumbnail.crop(crop).toDataURL();
            mainAppWindow.webContents.send('process-ocr-request', { imageData });
            return { success: true };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : 'Screen capture failed.' };
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

    handleTrusted('get-system-audio-source', async () => {
        if (isPresentationSafeMode) return { success: false, error: 'Presentation Safe Mode is active.' };
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
        return sources.length > 0 ? { success: true, sourceId: sources[0].id } : { success: false };
    });

    handleTrusted('start-system-audio-capture', async () => {
        try {
            if (isPresentationSafeMode) return { success: false, error: 'Presentation Safe Mode is active.' };
            const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
            if (sources.length > 0) {
                // Try to find a screen source first, then fall back to window
                const bestSource = sources.find(s => s.id.startsWith('screen')) || sources[0];
                mainAppWindow?.webContents.send('audio-source-ready', bestSource.id);
                return { success: true, sourceId: bestSource.id };
            }
            return { success: false, error: "No screen or window sources found." };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    handleTrusted('stop-system-audio-capture', async () => {
        mainAppWindow?.webContents.send('stop-audio-source');
        return { success: true };
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
        mainAppWindow.webContents.send('overlay-manual-question', question);
        return { success: true };
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
        { label: 'Show Answer Overlay', enabled: !isPresentationSafeMode, click: () => floatingIconWindow?.showInactive() },
        {
            label: isOverlayInteractive ? 'Make Overlay Click-through' : 'Make Overlay Interactive',
            accelerator: 'CommandOrControl+Shift+O',
            enabled: !isPresentationSafeMode,
            click: () => setOverlayInteractive(!isOverlayInteractive)
        },
        { type: 'separator' },
        { label: 'Quit Entirely', click: () => app.quit() }
    ]);
    tray.setContextMenu(contextMenu);
    tray.setToolTip(isPresentationSafeMode ? 'ZEDX AI — Presentation Safe Mode' : 'ZEDX AI');
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
    const appSession = session.fromPartition('persist:main');
    const allowedPermission = (wc, permission) => {
        try { return wc === mainAppWindow?.webContents && new URL(wc.getURL()).origin === APP_ORIGIN && ['media', 'audioCapture', 'speech'].includes(permission); }
        catch { return false; }
    };
    appSession.setPermissionRequestHandler((wc, permission, callback) => callback(allowedPermission(wc, permission)));
    appSession.setPermissionCheckHandler((wc, permission) => allowedPermission(wc, permission));
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    createFloatingIcon();
    createMainAppWindow();
    createTray();
    setupIpcHandlers();
    hideShortcutRegistered = globalShortcut.register('CommandOrControl+Shift+H', () => {
        setPresentationSafeMode(!isPresentationSafeMode);
    });
    globalShortcut.register('CommandOrControl+Shift+O', () => {
        if (!isPresentationSafeMode) setOverlayInteractive(!isOverlayInteractive);
    });


}

app.whenReady().then(initialize);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => {
    isQuitting = true;
    globalShortcut.unregisterAll();
});
