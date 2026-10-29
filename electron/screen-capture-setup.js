// Keep consent setup separate from an actual scanner capture. A first macOS
// desktopCapturer request may trigger a native consent dialog; opening the
// scanner behind that dialog makes a normal first-use flow look like a failed
// capture. This helper describes the state before and after that one probe.

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

    // A managed restriction takes precedence even over cached pixel evidence.
    if (status === 'restricted') {
        return { state: 'settings-required', permissionStatus: status, shouldProbe: false };
    }

    // Successful pixels prove this process can capture, including immediately
    // after consent. Requiring a restart here creates an unnecessary loop.
    if (sourceAvailable || status === 'not-applicable') {
        return { state: 'ready', permissionStatus: status, shouldProbe: false };
    }

    if (grantedDuringProbe) {
        return { state: 'restart-required', permissionStatus: status, shouldProbe: false };
    }

    if (status === 'denied') {
        // Only an explicit Scan retries a potentially stale TCC read. Passive
        // status checks stay passive, and failed probes still require consent.
        if (probeOnGranted && !probeComplete) {
            return { state: 'capture-probe', permissionStatus: status, shouldProbe: true };
        }
        return { state: 'settings-required', permissionStatus: status, shouldProbe: false };
    }

    if (status === 'granted') {
        if (probeOnGranted && !probeComplete) {
            return { state: 'capture-probe', permissionStatus: status, shouldProbe: true };
        }
        // A tiny setup thumbnail can fail transiently. Let the scanner's real
        // capture run its bounded retries and native fallback instead of
        // blocking access to both recovery paths before the frame opens.
        return { state: 'ready', permissionStatus: status, shouldProbe: false };
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
