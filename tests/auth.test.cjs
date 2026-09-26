const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest } = require('next/server');

function load(file, mocks = {}) {
    const source = fs.readFileSync(file, 'utf8');
    const exports = {};
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(compiled, {
        exports, require: name => mocks[name] || require(name),
        process, URL, URLSearchParams, Headers,
    });
    return exports;
}

function authWith(provider) {
    let state;
    return load('src/lib/auth.ts', {
        './supabase': { supabase: { auth: provider } },
        './auth-navigation': { authCallbackUrl: () => 'https://allyx.invalid/auth/callback?from=%2Fdashboard' },
        zustand: { create: initializer => {
            state = initializer(update => Object.assign(state, update));
            return { getState: () => state };
        } },
    }).useAuth.getState();
}

test('signup supplies the callback and preserves an immediate session', async () => {
    let request;
    const auth = authWith({ signUp: async args => { request = args; return { data: { session: { user: { id: 'test' } } }, error: null }; } });
    const result = await auth.signUp(' test@example.com ', 'example-password', ' Tester ');
    assert.equal(request.email, 'test@example.com');
    assert.equal(request.options.data.full_name, 'Tester');
    assert.match(request.options.emailRedirectTo, /\/auth\/callback/);
    assert.equal(result.session.user.id, 'test');
});

test('missing password-login session is an error, never a fabricated login', async () => {
    const auth = authWith({ signInWithPassword: async () => ({ data: { session: null }, error: null }) });
    await assert.rejects(() => auth.signIn('test@example.com', 'example-password'), /No session received/);
});

test('signup can return no session without falsely logging in a repeated or unconfirmed user', async () => {
    const auth = authWith({ signUp: async () => ({ data: { session: null }, error: null }) });
    const result = await auth.signUp('test@example.com', 'example-password', 'Tester');
    assert.equal(result.session, null);
    assert.equal(auth.user, null);
});

test('signup rejects blank names and weak passwords before calling the provider', async () => {
    const auth = authWith({ signUp: async () => { throw new Error('Provider must not be called'); } });
    await assert.rejects(() => auth.signUp('test@example.com', 'short', 'Tester'), /8 characters/);
    await assert.rejects(() => auth.signUp('test@example.com', 'example-password', '  '), /Full name/);
});

test('email OTP signs in existing users and creates new users without a password', async () => {
    let request;
    const auth = authWith({ signInWithOtp: async args => { request = args; return { error: null }; } });
    await auth.sendEmailOtp(' NewUser@Example.com ');
    assert.equal(request.email, 'newuser@example.com');
    assert.equal(request.options.shouldCreateUser, true);
    assert.match(request.options.emailRedirectTo, /\/auth\/callback/);
});

test('wrong password and unconfirmed account preserve provider errors for the correct UI state', async () => {
    for (const code of ['invalid_credentials', 'email_not_confirmed']) {
        const error = { code };
        const auth = authWith({ signInWithPassword: async () => ({ data: {}, error }) });
        await assert.rejects(() => auth.signIn('test@example.com', 'example-password'), result => result.code === code);
        assert.equal(auth.user, null);
    }
});

test('email sender failures, throttling, and expired links have actionable messages', () => {
    const { authErrorMessage, validateNewPassword } = load('src/lib/auth-errors.ts');
    assert.match(authErrorMessage({ code: 'email_address_not_authorized' }), /email sender/);
    assert.match(authErrorMessage({ code: 'over_email_send_rate_limit' }), /sending limit/);
    assert.match(authErrorMessage({ code: 'otp_expired' }), /already used/);
    assert.match(authErrorMessage({ name: 'AuthRetryableFetchError' }), /connection/);
    assert.match(authErrorMessage({ status: 503 }), /temporarily unavailable/);
    assert.match(validateNewPassword('short', 'short'), /8 characters/);
    assert.match(validateNewPassword('long-password', 'different'), /do not match/);
    assert.equal(validateNewPassword('long-password', 'long-password'), null);
});

test('session checks do not add more auth subscriptions', async () => {
    let subscriptions = 0;
    const auth = authWith({
        getUser: async () => ({ data: { user: null }, error: null }),
        onAuthStateChange: () => { subscriptions++; },
    });
    await auth.checkSession();
    await auth.checkSession();
    assert.equal(subscriptions, 0);
    assert.equal(auth.loading, false);
});

test('return URLs preserve an internal destination and reject external/malformed paths', () => {
    const { safeReturnPath } = load('src/lib/auth-navigation.ts');
    assert.equal(safeReturnPath('/interview?mode=practice'), '/interview?mode=practice');
    assert.equal(safeReturnPath('/dashboard/new'), '/dashboard/new');
    for (const path of [null, '//evil.example', '/\\evil.example', 'https://evil.example', '/login', '/dashboard/../../login', '/dashboard\n']) {
        assert.equal(safeReturnPath(path), '/dashboard');
    }
});

function proxyFor(result, refresh = false) {
    return load('src/proxy.ts', {
        '@supabase/ssr': { createServerClient: (_url, _key, { cookies }) => ({
            auth: { getUser: async () => {
                if (refresh) cookies.setAll([{ name: 'sb-test-auth-token', value: 'refreshed', options: { httpOnly: false, path: '/', sameSite: 'lax' } }]);
                return result;
            } },
        }) },
    }).default;
}

const { completeAuthCallback } = load('src/lib/auth-callback.ts', {
    './auth-navigation': load('src/lib/auth-navigation.ts'),
    './auth-errors': load('src/lib/auth-errors.ts'),
});

test('email token-hash links work without a browser PKCE verifier and enforce token type', async () => {
    for (const type of ['email', 'recovery']) {
        let verified;
        const destination = await completeAuthCallback(new URL(`https://allyx.invalid/auth/callback#token_hash=test-hash&type=${type}`), { auth: {
            verifyOtp: async args => { verified = args; return { error: null }; },
            getUser: async () => ({ data: { user: { id: 'test' } }, error: null }),
        } });
        assert.equal(verified.token_hash, 'test-hash');
        assert.equal(verified.type, type);
        assert.equal(destination, type === 'recovery' ? '/auth/reset-password' : '/dashboard');
    }
    await assert.rejects(() => completeAuthCallback(new URL('https://allyx.invalid/auth/callback#token_hash=test&type=invalid'), { auth: {} }), /Invalid email link/);
    await assert.rejects(() => completeAuthCallback(new URL('https://allyx.invalid/auth/callback#token_hash=test&type=recovery'), { auth: {
        verifyOtp: async () => ({ error: { code: 'otp_expired' } }),
    } }), /expired/);
});

test('callback exchanges PKCE code before verifying identity and honoring destination', async () => {
    const calls = [];
    const result = await completeAuthCallback(new URL('https://allyx.invalid/auth/callback?code=test-code&from=/interview'), { auth: {
        exchangeCodeForSession: async code => { calls.push(code); return { error: null }; },
        getUser: async () => { calls.push('verify'); return { data: { user: { id: 'test' } }, error: null }; },
    } });
    assert.deepEqual(calls, ['test-code', 'verify']);
    assert.equal(result, '/interview');
});

test('recovery callback goes to reset form only after successful identity verification', async () => {
    const result = await completeAuthCallback(new URL('https://allyx.invalid/auth/callback?code=test-code&recovery=1'), { auth: {
        exchangeCodeForSession: async () => ({ error: null }),
        getUser: async () => ({ data: { user: { id: 'test' } }, error: null }),
    } });
    assert.equal(result, '/auth/reset-password');
});

test('expired callback and missing reset session do not report success', async () => {
    await assert.rejects(() => completeAuthCallback(new URL('https://allyx.invalid/auth/callback#error=access_denied&error_description=Link+expired'), { auth: {} }), /Link expired/);
    await assert.rejects(() => completeAuthCallback(new URL('https://allyx.invalid/auth/callback?recovery=1'), { auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
    } }), /No valid session/);
});

test('fabricated legacy cookie cannot authorize dashboard access', async () => {
    const response = await proxyFor({ data: { user: null }, error: null })(
        new NextRequest('https://allyx.invalid/dashboard/new?step=1', { headers: { cookie: 'auth_token=' + 'a'.repeat(32) } }));
    assert.equal(response.status, 307);
    const destination = new URL(response.headers.get('location'));
    assert.equal(destination.pathname, '/login');
    assert.equal(destination.searchParams.get('from'), '/dashboard/new?step=1');
    assert.equal(response.cookies.get('auth_token').value, '');
});

test('only a verified identity passes; refreshed cookies reach browser and server renderer', async () => {
    const response = await proxyFor({ data: { user: { id: 'verified-user' } }, error: null }, true)(
        new NextRequest('https://allyx.invalid/dashboard'));
    assert.equal(response.status, 200);
    assert.equal(response.cookies.get('sb-test-auth-token').value, 'refreshed');
    assert.match(response.headers.get('x-middleware-request-cookie'), /sb-test-auth-token=refreshed/);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('failed verification rejects access even if a user object is present', async () => {
    const response = await proxyFor({ data: { user: { id: 'untrusted' } }, error: { status: 401 } }, true)(
        new NextRequest('https://allyx.invalid/interview'));
    assert.equal(response.status, 307);
    assert.equal(response.cookies.get('sb-test-auth-token').value, 'refreshed');
});

test('temporary auth outages do not sign users out or redirect them into a login loop', async () => {
    const response = await proxyFor({ data: { user: null }, error: { status: 503 } })(
        new NextRequest('https://allyx.invalid/dashboard'));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('location'), null);
    assert.equal(response.headers.get('retry-after'), '10');
});
