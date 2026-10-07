import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

function loginRedirect(request: NextRequest) {
    const url = new URL('/login', request.url);
    url.searchParams.set('from', request.nextUrl.pathname + request.nextUrl.search);
    const response = NextResponse.redirect(url);
    response.cookies.delete('auth_token');
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
}

function hasSupabaseSessionCookie(request: NextRequest) {
    return request.cookies.getAll().some(({ name }) => name.startsWith('sb-') && name.includes('-auth-token'));
}

export default async function proxy(request: NextRequest) {
    const headers = new Headers(request.headers);
    headers.delete('x-is-scanner');
    headers.set('x-url', request.url);
    if (request.nextUrl.pathname === '/scanner-frame') headers.set('x-is-scanner', 'true');
    let response = NextResponse.next({ request: { headers } });
    // These auxiliary windows use their own Electron session and contain no account data.
    if (headers.get('x-is-scanner') === 'true') {
        response.headers.set('X-Robots-Tag', 'noindex, nofollow');
        return response;
    }
    // Do not make an anonymous visitor wait on Supabase just to learn that this
    // is an account-only page. It also prevents a temporary auth-service outage
    // from rendering a raw JSON 503 instead of the normal sign-in screen.
    if (!hasSupabaseSessionCookie(request)) return loginRedirect(request);
    const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookies: {
            getAll: () => request.cookies.getAll(),
            setAll(cookies) {
                cookies.forEach(({ name, value }) => request.cookies.set(name, value));
                headers.set('cookie', request.cookies.toString());
                const previous = response.cookies.getAll();
                response = NextResponse.next({ request: { headers } });
                previous.forEach(cookie => response.cookies.set(cookie));
                cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
            },
        },
    });
    let result;
    try { result = await client.auth.getUser(); }
    catch {
        const unavailable = NextResponse.json({ error: 'Could not verify your session. Reload and try again.' }, { status: 503 });
        response.cookies.getAll().forEach(cookie => unavailable.cookies.set(cookie));
        unavailable.headers.set('Cache-Control', 'private, no-store');
        unavailable.headers.set('Retry-After', '10');
        unavailable.headers.set('X-Robots-Tag', 'noindex, nofollow');
        return unavailable;
    }
    const { data: { user }, error } = result;
    if (error && (error.name === 'AuthRetryableFetchError' || (error.status && error.status >= 500))) {
        const unavailable = NextResponse.json({ error: 'Authentication is temporarily unavailable. Reload and try again.' }, { status: 503 });
        response.cookies.getAll().forEach(cookie => unavailable.cookies.set(cookie));
        unavailable.headers.set('Cache-Control', 'private, no-store');
        unavailable.headers.set('Retry-After', '10');
        unavailable.headers.set('X-Robots-Tag', 'noindex, nofollow');
        return unavailable;
    }
    if (error || !user) {
        const denied = loginRedirect(request);
        response.cookies.getAll().forEach(cookie => denied.cookies.set(cookie));
        response = denied;
    }
    response.cookies.delete('auth_token');
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
}

export const config = {
    matcher: ['/dashboard/:path*', '/interview/:path*', '/scanner-frame/:path*'],
};
