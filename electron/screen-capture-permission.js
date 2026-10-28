function effectiveScreenCapturePermissionStatus({ reportedStatus, captureVerifiedInProcess = false } = {}) {
    const status = typeof reportedStatus === 'string' && reportedStatus.trim()
        ? reportedStatus
        : 'unknown';

    // macOS can briefly return `denied` after its privacy toggle has changed.
    // Once this exact AllyX process has received a real screen thumbnail, that
    // pixel result is stronger evidence than the stale status read. Do not
    // send the customer back to Settings after a later transient source gap.
    // `restricted` is intentionally never overridden because it can represent
    // a device-management policy rather than a delayed TCC update.
    if (captureVerifiedInProcess && status === 'denied') return 'granted';
    return status;
}

module.exports = { effectiveScreenCapturePermissionStatus };
