const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedMainWindowMediaPermission } = require('./media-permission-policy');

test('trusted main window can use microphone, speech, and desktop capture', () => {
    for (const permission of ['media', 'audioCapture', 'speech', 'display-capture']) {
        assert.equal(isAllowedMainWindowMediaPermission({ isMainWindow: true, isTrustedOrigin: true, permission }), true);
    }
});

test('only the trusted scanner route can request a user-selected display capture', () => {
    assert.equal(isAllowedMainWindowMediaPermission({ isScannerWindow: true, isTrustedOrigin: true, permission: 'display-capture' }), true);
    assert.equal(isAllowedMainWindowMediaPermission({ isScannerWindow: true, isTrustedOrigin: true, permission: 'media' }), false);
});
test('untrusted origins, auxiliary windows, and unrelated permissions are rejected', () => {
    assert.equal(isAllowedMainWindowMediaPermission({ isMainWindow: true, isTrustedOrigin: false, permission: 'display-capture' }), false);
    assert.equal(isAllowedMainWindowMediaPermission({ isMainWindow: false, isTrustedOrigin: true, permission: 'display-capture' }), false);
    assert.equal(isAllowedMainWindowMediaPermission({ isMainWindow: true, isTrustedOrigin: true, permission: 'geolocation' }), false);
});
