const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Window controls
    toggleApp: () => ipcRenderer.send('toggle-app'),
    showApp: () => ipcRenderer.send('show-app'),
    hideApp: () => ipcRenderer.send('hide-app'),
    closeApp: () => ipcRenderer.send('close-app'),
    goBack: () => ipcRenderer.send('go-back'),
    canGoBack: () => ipcRenderer.sendSync('can-go-back'),
    openGoogleSignIn: (authorizationUrl) => ipcRenderer.invoke('open-google-sign-in', authorizationUrl),
    copyToClipboard: (text) => ipcRenderer.send('copy-to-clipboard', text),
    isDesktopMode: () => ipcRenderer.sendSync('get-desktop-mode'),
    isPresentationSafeMode: () => ipcRenderer.sendSync('get-presentation-safe-mode'),
    setPresentationSafeMode: (active) => ipcRenderer.invoke('set-presentation-safe-mode', active),
    togglePresentationSafeMode: () => ipcRenderer.invoke('toggle-presentation-safe-mode'),
    onPresentationSafeModeChange: (callback) => {
        const wrapper = (event, active) => callback(active);
        ipcRenderer.on('presentation-safe-mode-changed', wrapper);
        return () => ipcRenderer.removeListener('presentation-safe-mode-changed', wrapper);
    },

    // Audio capture
    getSystemAudioSource: () => ipcRenderer.invoke('get-system-audio-source'),
    listSystemAudioSources: () => ipcRenderer.invoke('list-system-audio-sources'),
    startSystemAudioCapture: (sourceId) => ipcRenderer.invoke('start-system-audio-capture', sourceId),
    stopSystemAudioCapture: () => ipcRenderer.invoke('stop-system-audio-capture'),
    relaunchApp: () => ipcRenderer.send('relaunch-app'),
    onStopAudioSource: (callback) => {
        const wrapper = () => callback();
        ipcRenderer.on('stop-audio-source', wrapper);
        return () => ipcRenderer.removeListener('stop-audio-source', wrapper);
    },

    // Broadcast updates to Overlay
    sendTranscript: (text) => ipcRenderer.send('transcript-update', text),
    sendAnswer: (text) => ipcRenderer.send('answer-update', text),
    sendCapturedText: (text) => ipcRenderer.send('overlay-captured-text', text),
    sendOverlayStatus: (message, tone, action) => ipcRenderer.send('overlay-status', { message, tone, action }),
    setInterviewReady: (ready) => ipcRenderer.send('interview-ready', ready),

    // Overlay Controls
    resizeOverlay: (width, height) => ipcRenderer.send('resize-overlay', { width, height }),
    setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
    getOverlayState: () => ipcRenderer.sendSync('get-overlay-state'),
    onOverlayInteractionChange: (callback) => {
        const wrapper = (event, interactive) => callback(interactive);
        ipcRenderer.on('overlay-interaction-changed', wrapper);
        return () => ipcRenderer.removeListener('overlay-interaction-changed', wrapper);
    },
    submitOverlayQuestion: (question) => ipcRenderer.invoke('submit-overlay-question', question),
    continueOverlayAnswer: () => ipcRenderer.invoke('continue-overlay-answer'),
    toggleOverlayListening: () => ipcRenderer.invoke('toggle-overlay-listening'),
    endOverlayInterview: () => ipcRenderer.invoke('end-overlay-interview'),
    sendRecordingState: (state) => ipcRenderer.send('recording-state-update', state),
    onOverlayManualQuestion: (callback) => {
        const wrapper = (event, question) => callback(question);
        ipcRenderer.on('overlay-manual-question', wrapper);
        return () => ipcRenderer.removeListener('overlay-manual-question', wrapper);
    },
    onOverlayContinueAnswer: (callback) => {
        const wrapper = () => callback();
        ipcRenderer.on('overlay-continue-answer', wrapper);
        return () => ipcRenderer.removeListener('overlay-continue-answer', wrapper);
    },
    onOverlayToggleListening: (callback) => {
        const wrapper = () => callback();
        ipcRenderer.on('overlay-toggle-listening', wrapper);
        return () => ipcRenderer.removeListener('overlay-toggle-listening', wrapper);
    },
    onOverlayEndInterview: (callback) => {
        const wrapper = () => callback();
        ipcRenderer.on('overlay-end-interview', wrapper);
        return () => ipcRenderer.removeListener('overlay-end-interview', wrapper);
    },
    onRecordingState: (callback) => {
        const wrapper = (event, state) => callback(state);
        ipcRenderer.on('recording-state', wrapper);
        return () => ipcRenderer.removeListener('recording-state', wrapper);
    },

    // Compatibility shims for the currently deployed renderer. The owner-
    // controlled updater was removed from this desktop fork, but older web
    // releases still subscribe to these callbacks during startup.
    downloadUpdate: () => undefined,
    installUpdate: () => undefined,
    onUpdateAvailable: () => () => {},
    onUpdateReady: () => () => {},

    // Callbacks
    onTranscript: (callback) => {
        const wrapper = (event, text) => callback(text);
        ipcRenderer.on('transcript', wrapper);
        return () => ipcRenderer.removeListener('transcript', wrapper);
    },

    onAnswer: (callback) => {
        const wrapper = (event, answer) => callback(answer);
        ipcRenderer.on('answer', wrapper);
        return () => ipcRenderer.removeListener('answer', wrapper);
    },
    onOverlayCapturedText: (callback) => {
        const wrapper = (event, text) => callback(text);
        ipcRenderer.on('overlay-captured-text', wrapper);
        return () => ipcRenderer.removeListener('overlay-captured-text', wrapper);
    },
    onOverlayStatus: (callback) => {
        const wrapper = (event, status) => callback(status);
        ipcRenderer.on('overlay-status', wrapper);
        return () => ipcRenderer.removeListener('overlay-status', wrapper);
    },

    onAudioSourceReady: (callback) => {
        // Force removal of any existing listeners to prevent zombie callbacks
        ipcRenderer.removeAllListeners('audio-source-ready');
        const wrapper = (event, sourceId) => callback(sourceId);
        ipcRenderer.on('audio-source-ready', wrapper);
        return () => ipcRenderer.removeListener('audio-source-ready', wrapper);
    },

    // Error Handling & Connectivity
    retryConnection: () => ipcRenderer.send('retry-connection'),
    quitApp: () => ipcRenderer.send('quit-app'),
    hideIcon: () => ipcRenderer.send('hide-icon'),
    hideOverlay: () => ipcRenderer.send('hide-overlay'),
    onLoadError: (callback) => {
        const wrapper = (event, errorDescription) => callback(errorDescription);
        ipcRenderer.on('load-error', wrapper);
        return () => ipcRenderer.removeListener('load-error', wrapper);
    },

    // --- STEALTH SCANNER API ---
    toggleScannerFrame: () => ipcRenderer.invoke('toggle-scanner-frame'),
    updateScannerBounds: (bounds) => ipcRenderer.send('update-scanner-bounds', bounds),
    captureScannerArea: (bounds) => ipcRenderer.invoke('capture-scanner-area', bounds),
    openScreenRecordingSettings: () => ipcRenderer.invoke('open-screen-recording-settings'),

    onProcessOcr: (callback) => {
        const wrapper = (event, data) => callback(data);
        ipcRenderer.on('process-ocr-request', wrapper);
        return () => ipcRenderer.removeListener('process-ocr-request', wrapper);
    },

    onScannerStateChange: (callback) => {
        const wrapper = (event, active) => callback(active);
        ipcRenderer.on('scanner-state-changed', wrapper);
        return () => ipcRenderer.removeListener('scanner-state-changed', wrapper);
    },

    isElectron: true
});
