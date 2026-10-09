const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedOAuthAuthorizationUrl, isDesktopOAuthCallback, toAppOAuthCallbackUrl } = require('./oauth-window-policy');

const provider = 'https://project.supabase.co';
const app = 'https://allyx.example';

test('only accepts the expected Supabase OAuth authorization route', () => {
    assert.equal(isAllowedOAuthAuthorizationUrl('https://project.supabase.co/auth/v1/authorize?provider=google', provider), true);
    assert.equal(isAllowedOAuthAuthorizationUrl('https://project.supabase.co/auth/v1/token', provider), false);
    assert.equal(isAllowedOAuthAuthorizationUrl('https://attacker.example/auth/v1/authorize', provider), false);
    assert.equal(isAllowedOAuthAuthorizationUrl('javascript:alert(1)', provider), false);
});

test('only accepts AllyX protocol OAuth callbacks that contain a provider result', () => {
    assert.equal(isDesktopOAuthCallback('allyx://auth/callback?code=abc'), true);
    assert.equal(isDesktopOAuthCallback('allyx://auth/callback?error=access_denied'), true);
    assert.equal(isDesktopOAuthCallback('https://allyx.example/auth/callback?code=abc'), false);
    assert.equal(isDesktopOAuthCallback('allyx://other/callback?code=abc'), false);
    assert.equal(isDesktopOAuthCallback('allyx://auth/callback'), false);
});

test('returns an approved desktop OAuth callback to the trusted renderer', () => {
    assert.equal(
        toAppOAuthCallbackUrl('allyx://auth/callback?code=abc&from=%2Fdashboard%2Fbilling', app),
        'https://allyx.example/auth/callback?code=abc&from=%2Fdashboard%2Fbilling',
    );
    assert.equal(toAppOAuthCallbackUrl('https://evil.example/auth/callback?code=abc', app), null);
});
