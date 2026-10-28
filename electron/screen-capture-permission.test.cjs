const test = require('node:test');
const assert = require('node:assert/strict');
const { effectiveScreenCapturePermissionStatus } = require('./screen-capture-permission');

test('a confirmed screen thumbnail wins over a stale denied permission read', () => {
    assert.equal(effectiveScreenCapturePermissionStatus({
        reportedStatus: 'denied',
        captureVerifiedInProcess: true,
    }), 'granted');
});

test('an unverified app and device-management restriction keep their reported statuses', () => {
    assert.equal(effectiveScreenCapturePermissionStatus({
        reportedStatus: 'denied',
        captureVerifiedInProcess: false,
    }), 'denied');
    assert.equal(effectiveScreenCapturePermissionStatus({
        reportedStatus: 'restricted',
        captureVerifiedInProcess: true,
    }), 'restricted');
});
