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
    startSystemAudioCapture: () => Promise<{ success: boolean; sourceId?: string; error?: string; permissionStatus?: string; restartRequired?: boolean }>;
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
    // Stealth Scanner
    toggleScannerFrame: () => Promise<{ active: boolean }>;
    updateScannerBounds: (bounds: { x: number, y: number, width: number, height: number }) => void;
    captureScannerArea: (bounds: { x: number, y: number, width: number, height: number }) => Promise<{ success: boolean; error?: string }>;
    onProcessOcr: (callback: (data: { imageData: string }) => void) => () => void;
    onScannerStateChange: (callback: (active: boolean) => void) => () => void;
    isElectron: boolean;
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }
}

export { };
