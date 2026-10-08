const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedOAuthAuthorizationUrl, isCompletedOAuthNavigation } = require('./oauth-window-policy');

const provider = 'https://project.supabase.co';
const app = 'https://allyx.example';

test('only accepts the expected Supabase OAuth authorization route', () => {
    assert.equal(isAllowedOAuthAuthorizationUrl('https://project.supabase.co/auth/v1/authorize?provider=google', provider), true);
    assert.equal(isAllowedOAuthAuthorizationUrl('https://project.supabase.co/auth/v1/token', provider), false);
    assert.equal(isAllowedOAuthAuthorizationUrl('https://attacker.example/auth/v1/authorize', provider), false);
    assert.equal(isAllowedOAuthAuthorizationUrl('javascript:alert(1)', provider), false);
});

test('only treats authenticated AllyX destinations as a completed OAuth flow', () => {
    assert.equal(isCompletedOAuthNavigation('https://allyx.example/dashboard', app), true);
    assert.equal(isCompletedOAuthNavigation('https://allyx.example/interview?desktop=true', app), true);
    assert.equal(isCompletedOAuthNavigation('https://allyx.example/auth/callback', app), false);
    assert.equal(isCompletedOAuthNavigation('https://allyx.example/login', app), false);
    assert.equal(isCompletedOAuthNavigation('https://attacker.example/dashboard', app), false);
});
