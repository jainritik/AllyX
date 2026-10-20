const SCREEN_PERMISSION_ACTIONABLE = new Set(['not-determined', 'denied', 'restricted']);

function screenCaptureFailure({ platform, permissionStatus, capture }) {
    const diagnostics = {
        permissionStatus: permissionStatus || 'unknown',
        reason: capture?.reason || 'capture-error',
        attempts: Number.isFinite(capture?.attempts) ? capture.attempts : 0,
        sourceCount: Number.isFinite(capture?.sourceCount) ? capture.sourceCount : 0,
    };

    if (diagnostics.reason === 'display-not-found') {
        return {
            success: false,
            failureCode: 'display-changed',
            error: 'The selected display changed. Reopen Screen Capture and keep the frame on one display.',
            diagnostics,
        };
    }

    // macOS owns the consent decision. We only inspect it after the real
    // capture attempt has failed, because a freshly changed TCC toggle can
    // briefly report a stale state.
    if (platform === 'darwin' && SCREEN_PERMISSION_ACTIONABLE.has(permissionStatus)) {
        const denied = permissionStatus === 'denied' || permissionStatus === 'restricted';
        return {
            success: false,
            failureCode: denied ? 'permission-denied' : 'permission-required',
            settingsRequired: true,
            restartRequired: true,
            error: denied
                ? 'Allow AllyX in System Settings → Privacy & Security → Screen & System Audio Recording, then restart AllyX.'
                : 'Allow AllyX in System Settings → Privacy & Security → Screen & System Audio Recording, then restart AllyX.',
            diagnostics,
        };
    }

    if (diagnostics.reason === 'capture-timeout') {
        return {
            success: false,
            failureCode: 'capture-timeout',
            restartRequired: platform === 'darwin',
            error: 'Screen capture did not respond in time. Close System Settings and other screen-recording apps, then try Capture again.',
            diagnostics,
        };
    }

    if (diagnostics.reason === 'no-sources' || diagnostics.reason === 'thumbnail-empty') {
        return {
            success: false,
            failureCode: 'no-pixels',
            restartRequired: platform === 'darwin',
            error: platform === 'darwin' && permissionStatus === 'granted'
                ? 'Screen & System Audio Recording is enabled, but macOS did not provide a screen image yet. Close System Settings and other screen-recording apps, then try Capture again.'
                : 'The operating system did not provide a screen image yet. Close System Settings and other screen-recording apps, then try Capture again.',
            diagnostics,
        };
    }

    return {
        success: false,
        failureCode: 'capture-api-error',
        restartRequired: platform === 'darwin',
        error: 'Could not read this screen. Try Capture again; if it keeps failing, restart AllyX.',
        diagnostics,
    };
}

module.exports = { screenCaptureFailure };
