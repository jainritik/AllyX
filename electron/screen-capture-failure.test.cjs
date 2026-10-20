const test = require('node:test');
const assert = require('node:assert/strict');
const { screenCaptureFailure } = require('./screen-capture-failure');

test('reports a missing macOS screen permission only after the capture attempt failed', () => {
    const result = screenCaptureFailure({
        platform: 'darwin',
        permissionStatus: 'denied',
        capture: { reason: 'no-sources', attempts: 4, sourceCount: 0 },
    });
    assert.equal(result.failureCode, 'permission-denied');
    assert.equal(result.settingsRequired, true);
    assert.equal(result.restartRequired, true);
});

test('does not blame a granted macOS permission when no thumbnail is returned', () => {
    const result = screenCaptureFailure({
        platform: 'darwin',
        permissionStatus: 'granted',
        capture: { reason: 'thumbnail-empty', attempts: 4, sourceCount: 1 },
    });
    assert.equal(result.failureCode, 'no-pixels');
    assert.equal(result.settingsRequired, undefined);
    assert.equal(result.restartRequired, true);
    assert.match(result.error, /Screen & System Audio Recording is enabled/);
});

test('keeps a changed display separate from a permission failure', () => {
    const result = screenCaptureFailure({
        platform: 'darwin',
        permissionStatus: 'granted',
        capture: { reason: 'display-not-found', attempts: 1, sourceCount: 2 },
    });
    assert.equal(result.failureCode, 'display-changed');
    assert.equal(result.settingsRequired, undefined);
    assert.equal(result.restartRequired, undefined);
});

test('returns a bounded-native-timeout recovery state', () => {
    const result = screenCaptureFailure({
        platform: 'darwin',
        permissionStatus: 'granted',
        capture: { reason: 'capture-timeout', attempts: 4, sourceCount: 0 },
    });
    assert.equal(result.failureCode, 'capture-timeout');
    assert.equal(result.restartRequired, true);
});
