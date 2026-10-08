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

function isCompletedOAuthNavigation(value, appOrigin) {
    try {
        const url = new URL(value);
        if (url.origin !== appOrigin || url.pathname === '/auth/callback') return false;
        return url.pathname === '/dashboard'
            || url.pathname.startsWith('/dashboard/')
            || url.pathname === '/interview'
            || url.pathname.startsWith('/interview/');
    } catch {
        return false;
    }
}

module.exports = { isAllowedOAuthAuthorizationUrl, isCompletedOAuthNavigation };
