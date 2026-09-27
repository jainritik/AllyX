const MAIN_WINDOW_MEDIA_PERMISSIONS = new Set([
    'media',
    'audioCapture',
    'speech',
    'display-capture',
]);

function isAllowedMainWindowMediaPermission({ isMainWindow, isTrustedOrigin, permission }) {
    return Boolean(isMainWindow && isTrustedOrigin && MAIN_WINDOW_MEDIA_PERMISSIONS.has(permission));
}

function shouldAttemptScreenCapturePermission(status, attempted) {
    if (status === 'restricted') return false;
    if (status === 'granted' || status === 'not-determined' || status === 'unknown') return true;
    return status === 'denied' && !attempted;
}

module.exports = { isAllowedMainWindowMediaPermission, shouldAttemptScreenCapturePermission };
