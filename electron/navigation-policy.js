function allowAppNavigation(window, appOrigin, openExternal, additionalOrigins = [], embeddedOrigins = []) {
    const allowedOrigins = new Set([appOrigin, ...additionalOrigins]);
    const allowedEmbeddedOrigins = new Set(embeddedOrigins);
    const denyOtherOrigins = (details) => {
        try {
            const origin = new URL(details.url).origin;
            if (allowedOrigins.has(origin)) return;
            if (details.isMainFrame === false && allowedEmbeddedOrigins.has(origin)) return;
        } catch { /* deny */ }
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
