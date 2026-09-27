const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedMainWindowMediaPermission, shouldAttemptScreenCapturePermission } = require('./media-permission-policy');

test('trusted main window can use microphone, speech, and desktop capture', () => {
    for (const permission of ['media', 'audioCapture', 'speech', 'display-capture']) {
        assert.equal(isAllowedMainWindowMediaPermission({ isMainWindow: true, isTrustedOrigin: true, permission }), true);
    }
});

test('untrusted origins, auxiliary windows, and unrelated permissions are rejected', () => {
    assert.equal(isAllowedMainWindowMediaPermission({ isMainWindow: true, isTrustedOrigin: false, permission: 'display-capture' }), false);
    assert.equal(isAllowedMainWindowMediaPermission({ isMainWindow: false, isTrustedOrigin: true, permission: 'display-capture' }), false);
    assert.equal(isAllowedMainWindowMediaPermission({ isMainWindow: true, isTrustedOrigin: true, permission: 'geolocation' }), false);
});

test('a stale denied screen permission gets one bootstrap request per launch', () => {
    assert.equal(shouldAttemptScreenCapturePermission('denied', false), true);
    assert.equal(shouldAttemptScreenCapturePermission('denied', true), false);
    assert.equal(shouldAttemptScreenCapturePermission('restricted', false), false);
    assert.equal(shouldAttemptScreenCapturePermission('granted', true), true);
});
