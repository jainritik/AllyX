const SCREEN_PERMISSION_ACTIONABLE = new Set(['not-determined', 'denied', 'restricted']);
// Only a failure while asking macOS for screen pixels can be attributed to
// Screen Recording consent. Crop, image conversion, or renderer delivery can
// fail after pixels were already available; sending customers to Settings in
// those cases is misleading and does not solve the actual problem.
const NATIVE_SCREEN_ACQUISITION_FAILURES = new Set([
    'no-sources',
    'thumbnail-empty',
    'capture-timeout',
    'capture-error',
]);

function screenCaptureFailure({ platform, permissionStatus, capture }) {
    const diagnostics = {
        permissionStatus: permissionStatus || 'unknown',
        reason: capture?.reason || 'capture-error',
        attempts: Number.isFinite(capture?.attempts) ? capture.attempts : 0,
        sourceCount: Number.isFinite(capture?.sourceCount) ? capture.sourceCount : 0,
        displayId: typeof capture?.displayId === 'string' ? capture.displayId : null,
        displayCount: Number.isInteger(capture?.displayCount) ? capture.displayCount : null,
        sourceDisplayIdCount: Number.isFinite(capture?.sourceDisplayIdCount) ? capture.sourceDisplayIdCount : 0,
        thumbnailState: typeof capture?.thumbnailState === 'string' ? capture.thumbnailState : null,
        errorCode: typeof capture?.errorCode === 'string' ? capture.errorCode : null,
    };

    if (diagnostics.reason === 'display-not-found') {
        return {
            success: false,
            failureCode: 'display-changed',
            error: 'The selected display changed. Reopen Screen Capture and keep the frame on one display.',
            diagnostics,
        };
    }

    if (diagnostics.reason === 'display-id-missing') {
        return {
            success: false,
            failureCode: 'display-identity-unavailable',
            error: 'macOS did not identify the display containing the Screen Capture frame. Reopen Screen Capture and keep the frame on one display.',
            diagnostics,
        };
    }

    // macOS owns the consent decision. We only inspect it after the real
    // capture attempt has failed, because a freshly changed TCC toggle can
    // briefly report a stale state.
    if (
        platform === 'darwin'
        && SCREEN_PERMISSION_ACTIONABLE.has(permissionStatus)
        && NATIVE_SCREEN_ACQUISITION_FAILURES.has(diagnostics.reason)
    ) {
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

    if (diagnostics.reason === 'native-capture-error') {
        return {
            success: false,
            failureCode: 'capture-api-error',
            error: 'macOS could not prepare a screen image. Try Capture again; if it keeps failing, restart AllyX.',
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
