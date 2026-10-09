export function safeReturnPath(value: string | null): string {
    if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20]/.test(value)) return '/dashboard';
    try {
        const url = new URL(value, 'https://allyx.invalid');
        return url.origin === 'https://allyx.invalid' && ['/dashboard', '/interview'].some(path => url.pathname === path || url.pathname.startsWith(path + '/'))
            ? url.pathname + url.search : '/dashboard';
    } catch { return '/dashboard'; }
}

export function authCallbackUrl(): string {
    const from = safeReturnPath(new URLSearchParams(window.location.search).get('from'));
    const url = new URL('/auth/callback', window.location.origin);
    if (window.electronAPI?.isElectron) {
        // Google completes OAuth in the user's system browser. The public
        // callback immediately hands the PKCE code back to the registered
        // AllyX desktop protocol, where this renderer owns the verifier.
        url.searchParams.set('desktop', '1');
        url.searchParams.set('from', from);
        return url.toString();
    }
    url.searchParams.set('from', from);
    return url.toString();
}
