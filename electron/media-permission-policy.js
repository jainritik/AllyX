const MAIN_WINDOW_MEDIA_PERMISSIONS = new Set([
    'media',
    'audioCapture',
    'speech',
    'display-capture',
]);

function isAllowedMainWindowMediaPermission({ isMainWindow, isTrustedOrigin, permission }) {
    return Boolean(isMainWindow && isTrustedOrigin && MAIN_WINDOW_MEDIA_PERMISSIONS.has(permission));
}

module.exports = { isAllowedMainWindowMediaPermission };
