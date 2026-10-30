export interface ElectronAPI {
    toggleOverlay: () => void;
    hideOverlay: () => void;
    // Main process control
    hideApp: () => void;
    showApp: () => void;
    closeApp: () => void;
    quitApp: () => void;
    toggleApp: () => void;
    goBack: () => void;
    canGoBack: () => boolean;
    openGoogleSignIn: (authorizationUrl: string) => Promise<{ success: boolean }>;
    isDesktopMode: () => boolean;
    isPresentationSafeMode: () => boolean;
    setPresentationSafeMode: (active: boolean) => Promise<{ active: boolean }>;
    togglePresentationSafeMode: () => Promise<{ active: boolean }>;
    onPresentationSafeModeChange: (callback: (active: boolean) => void) => () => void;
    // Utils
    copyToClipboard: (text: string) => void;
    sendTranscript: (transcript: string) => void;
    sendAnswer: (answer: string) => void;
    sendCapturedText: (text: string) => void;
    sendOverlayStatus: (message: string, tone: "progress" | "success" | "error", action?: "continue") => void;
    setInterviewReady: (ready: boolean) => void;
    sendRecordingState: (state: { listening: boolean; meetingAudio: boolean; finalizing: boolean }) => void;
    // Audio
    listSystemAudioSources: () => Promise<{ success: boolean; sources: Array<{ id: string; name: string }> ; error?: string }>;
    startSystemAudioCapture: (sourceId?: string) => Promise<{ success: boolean; sourceId?: string; error?: string; permissionStatus?: string; restartRequired?: boolean; selectionRequired?: boolean }>;
    stopSystemAudioCapture: () => Promise<{ success: boolean }>;
    relaunchApp: () => void;
    onStopAudioSource: (callback: () => void) => () => void;
    onAudioSourceReady: (callback: (sourceId: string) => void) => (() => void);
    // Events
    onTranscript: (callback: (text: string) => void) => () => void;
    onAnswer: (callback: (answer: string) => void) => () => void;
    onOverlayCapturedText: (callback: (text: string) => void) => () => void;
    onOverlayStatus: (callback: (status: { message: string; tone: "progress" | "success" | "error" }) => void) => () => void;
    // Overlay Controls
    resizeOverlay: (width: number, height: number) => void;
    setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) => void;
    getOverlayState: () => { interactive: boolean };
    onOverlayInteractionChange: (callback: (interactive: boolean) => void) => () => void;
    submitOverlayQuestion: (question: string) => Promise<{ success: boolean; error?: string }>;
    continueOverlayAnswer: () => Promise<{ success: boolean; error?: string }>;
    toggleOverlayListening: () => Promise<{ success: boolean; error?: string }>;
    endOverlayInterview: () => Promise<{ success: boolean; error?: string }>;
    onOverlayManualQuestion: (callback: (question: string) => void) => () => void;
    onOverlayContinueAnswer: (callback: () => void) => () => void;
    onOverlayToggleListening: (callback: () => void) => () => void;
    onOverlayEndInterview: (callback: () => void) => () => void;
    onRecordingState: (callback: (state: { listening: boolean; meetingAudio: boolean; finalizing: boolean }) => void) => () => void;
    downloadUpdate: () => void;
    installUpdate: () => void;
    onUpdateAvailable: (callback: (version: string) => void) => () => void;
    onUpdateReady: (callback: () => void) => () => void;
    // Screen capture
    toggleScannerFrame: () => Promise<{
        active: boolean;
        error?: string;
        message?: string;
        permissionStatus?: string;
        setupState?: 'ready' | 'install-required' | 'consent-probe' | 'capture-probe' | 'awaiting-consent' | 'restart-required' | 'settings-required' | 'capture-unavailable';
    }>;
    captureScannerArea: () => Promise<{
        success: boolean;
        error?: string;
        failureCode?: 'capture-in-progress' | 'display-changed' | 'display-identity-unavailable' | 'permission-denied' | 'permission-required' | 'capture-timeout' | 'no-pixels' | 'capture-api-error' | 'renderer-not-ready';
        settingsRequired?: boolean;
        restartRequired?: boolean;
        setupPending?: boolean;
    }>;
    listScannerWindows?: () => Promise<{ success: boolean; windows: { id: string; name: string }[]; error?: string }>;
    previewScannerWindow?: (id: string) => Promise<{ success: boolean; id?: number; imageData?: string; error?: string }>;
    captureScannerPage?: (id: number, top: number) => Promise<{ success: boolean; error?: string }>;
    captureScannerDisplay: () => Promise<{
        success: boolean;
        error?: string;
        failureCode?: 'capture-in-progress' | 'permission-denied' | 'permission-required' | 'capture-timeout' | 'no-pixels' | 'capture-api-error' | 'renderer-not-ready';
        settingsRequired?: boolean;
        restartRequired?: boolean;
        setupPending?: boolean;
    }>;
    acknowledgeScannerCapture: (captureId: string) => Promise<{ success: boolean }>;
    setScannerProcessing: (active: boolean) => Promise<{ success: boolean; active: boolean }>;
    openScreenRecordingSettings: () => Promise<{ success: boolean; error?: string }>;
    getDesktopPermissions: () => Promise<{
        screen: string;
        microphone: string;
        platform: string;
        screenCaptureSetup?: 'ready' | 'install-required' | 'consent-probe' | 'capture-probe' | 'awaiting-consent' | 'restart-required' | 'settings-required' | 'capture-unavailable';
        isRunningFromMountedDmg?: boolean;
    }>;
    requestMicrophoneAccess: () => Promise<{ status: string; granted: boolean }>;
    onProcessOcr: (callback: (data: { id?: string; imageData: string; captureMode?: "area" | "display" }) => void) => () => void;
    onScannerStateChange: (callback: (active: boolean) => void) => () => void;
    isElectron: boolean;
    platform: string;
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }
}

export { };
