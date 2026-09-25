export function safeReturnPath(value: string | null): string {
    if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20]/.test(value)) return '/dashboard';
    try {
        const url = new URL(value, 'https://allyx.invalid');
        return url.origin === 'https://allyx.invalid' && ['/dashboard', '/interview'].some(path => url.pathname === path || url.pathname.startsWith(path + '/'))
            ? url.pathname + url.search : '/dashboard';
    } catch { return '/dashboard'; }
}

export function authCallbackUrl(): string {
    const url = new URL('/auth/callback', window.location.origin);
    url.searchParams.set('from', safeReturnPath(new URLSearchParams(window.location.search).get('from')));
    return url.toString();
}
