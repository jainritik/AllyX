function allowAppNavigation(window, appOrigin, openExternal) {
    const denyOtherOrigins = (details) => {
        try { if (new URL(details.url).origin === appOrigin) return; } catch { /* deny */ }
        details.preventDefault();
    };
    window.webContents.on('will-frame-navigate', denyOtherOrigins);
    window.webContents.on('will-redirect', denyOtherOrigins);
    window.webContents.setWindowOpenHandler(({ url }) => {
        try { if (new URL(url).protocol === 'https:') void openExternal(url); } catch { /* deny */ }
        return { action: 'deny' };
    });
    window.webContents.on('will-attach-webview', details => details.preventDefault());
}

module.exports = { allowAppNavigation };
