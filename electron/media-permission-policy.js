const MAIN_WINDOW_MEDIA_PERMISSIONS = new Set([
    'media',
    'audioCapture',
    'speech',
    'display-capture',
]);

function isAllowedMainWindowMediaPermission({ isMainWindow, isTrustedOrigin, permission }) {
    if (!isTrustedOrigin) return false;
    if (isMainWindow && MAIN_WINDOW_MEDIA_PERMISSIONS.has(permission)) return true;
    return false;
}

module.exports = { isAllowedMainWindowMediaPermission };
