const MAIN_WINDOW_MEDIA_PERMISSIONS = new Set([
    'media',
    'audioCapture',
    'speech',
    'display-capture',
]);

function isAllowedMainWindowMediaPermission({ isMainWindow, isScannerWindow, isTrustedOrigin, permission }) {
    if (!isTrustedOrigin) return false;
    if (isMainWindow && MAIN_WINDOW_MEDIA_PERMISSIONS.has(permission)) return true;
    // The scanner's recovery picker is a direct user action that requests only a
    // video capture. It still goes through the native macOS picker; this merely
    // permits Chromium to show that picker for the trusted scanner route.
    return Boolean(isScannerWindow && permission === 'display-capture');
}

module.exports = { isAllowedMainWindowMediaPermission };
