function isAllowedOAuthAuthorizationUrl(value, providerOrigin) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:'
            && url.origin === providerOrigin
            && url.pathname === '/auth/v1/authorize';
    } catch {
        return false;
    }
}

function isDesktopOAuthCallback(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'allyx:' || url.hostname !== 'auth' || url.pathname !== '/callback') return false;
        return Boolean(url.searchParams.get('code') || url.searchParams.get('error') || url.searchParams.get('error_description'));
    } catch {
        return false;
    }
}

function toAppOAuthCallbackUrl(value, appUrl) {
    if (!isDesktopOAuthCallback(value)) return null;
    const callback = new URL('/auth/callback', appUrl);
    callback.search = new URL(value).search;
    return callback.toString();
}

module.exports = { isAllowedOAuthAuthorizationUrl, isDesktopOAuthCallback, toAppOAuthCallbackUrl };
