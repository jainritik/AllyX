// Keep consent setup separate from an actual scanner capture. A first macOS
// desktopCapturer request may trigger a native consent dialog; opening the
// scanner behind that dialog makes a normal first-use flow look like a failed
// capture. This helper describes the state before and after that one probe.
const SETTINGS_REQUIRED_STATUSES = new Set(['denied', 'restricted']);

function normalizePermissionStatus(status) {
    return typeof status === 'string' && status.trim() ? status : 'unknown';
}

function resolveScreenCaptureSetup({
    platform,
    permissionStatus,
    isRunningFromMountedDmg = false,
    probeComplete = false,
    sourceAvailable = false,
    grantedDuringProbe = false,
    probeOnGranted = false,
} = {}) {
    const status = normalizePermissionStatus(permissionStatus);

    if (platform !== 'darwin') {
        return { state: 'ready', permissionStatus: status, shouldProbe: false };
    }

    // TCC grants should belong to the installed copy, not an app launched from
    // a mounted installer volume. Do not request capture from a temporary copy.
    if (isRunningFromMountedDmg) {
        return { state: 'install-required', permissionStatus: status, shouldProbe: false };
    }

    // macOS commonly needs an app restart after it grants Screen & System Audio
    // Recording for the first time. Prefer that clear state over showing a
    // scanner with a second capture error behind the native consent prompt.
    if (grantedDuringProbe) {
        return { state: 'restart-required', permissionStatus: status, shouldProbe: false };
    }

    // A non-empty native source is authoritative even if getMediaAccessStatus
    // momentarily lags after a user changes the toggle in System Settings,
    // including an overly pessimistic denied status from a stale TCC read.
    if (sourceAvailable || status === 'not-applicable') {
        return { state: 'ready', permissionStatus: status, shouldProbe: false };
    }

    if (SETTINGS_REQUIRED_STATUSES.has(status)) {
        return { state: 'settings-required', permissionStatus: status, shouldProbe: false };
    }

    // Reading the status is not a proof that ScreenCaptureKit can return a
    // usable source. An explicit Capture action asks for one small probe even
    // after a granted status; passive page loads never set this flag.
    if (status === 'granted') {
        if (!probeOnGranted) return { state: 'ready', permissionStatus: status, shouldProbe: false };
        if (!probeComplete) return { state: 'capture-probe', permissionStatus: status, shouldProbe: true };
        return { state: 'capture-unavailable', permissionStatus: status, shouldProbe: false };
    }

    if (!probeComplete) {
        return { state: 'consent-probe', permissionStatus: status, shouldProbe: true };
    }

    // Do not convert this into a Settings error. The native dialog owns the
    // decision and may still be on screen while desktopCapturer times out.
    if (status === 'not-determined') {
        return { state: 'awaiting-consent', permissionStatus: status, shouldProbe: false };
    }

    return { state: 'capture-unavailable', permissionStatus: status, shouldProbe: false };
}

module.exports = { normalizePermissionStatus, resolveScreenCaptureSetup };
