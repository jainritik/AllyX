const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveScreenCaptureSetup } = require('./screen-capture-setup');

test('an explicit Capture action probes a granted status once before the scanner opens', () => {
    const beforeProbe = resolveScreenCaptureSetup({
        platform: 'darwin',
        permissionStatus: 'granted',
        probeOnGranted: true,
    });
    const afterEmptyProbe = resolveScreenCaptureSetup({
        platform: 'darwin',
        permissionStatus: 'granted',
        probeOnGranted: true,
        probeComplete: true,
    });
    const afterSourceProbe = resolveScreenCaptureSetup({
        platform: 'darwin',
        permissionStatus: 'granted',
        probeOnGranted: true,
        probeComplete: true,
        sourceAvailable: true,
    });

    assert.deepEqual(beforeProbe, {
        state: 'capture-probe',
        permissionStatus: 'granted',
        shouldProbe: true,
    });
    assert.deepEqual(afterEmptyProbe, {
        state: 'ready',
        permissionStatus: 'granted',
        shouldProbe: false,
    });
    assert.deepEqual(afterSourceProbe, {
        state: 'ready',
        permissionStatus: 'granted',
        shouldProbe: false,
    });
});

test('a native source beats a stale macOS permission status without opening Settings', () => {
    const result = resolveScreenCaptureSetup({
        platform: 'darwin',
        permissionStatus: 'not-determined',
        probeComplete: true,
        sourceAvailable: true,
    });

    assert.deepEqual(result, {
        state: 'ready',
        permissionStatus: 'not-determined',
        shouldProbe: false,
    });
});

for (const sourceAvailable of [true, false]) {
    test(`explicit Scan retries a stale denial and respects the pixel result: ${sourceAvailable}`, () => {
        const before = resolveScreenCaptureSetup({
            platform: 'darwin', permissionStatus: 'denied', probeOnGranted: true,
        });
        assert.equal(before.shouldProbe, true);
        const after = resolveScreenCaptureSetup({
            platform: 'darwin', permissionStatus: 'denied', probeOnGranted: true,
            probeComplete: true, sourceAvailable,
        });
        assert.equal(after.state, sourceAvailable ? 'ready' : 'settings-required');
        assert.equal(after.shouldProbe, false);
    });
}

test('managed restrictions cannot be overridden by cached pixels or explicit Scan', () => {
    const result = resolveScreenCaptureSetup({
        platform: 'darwin', permissionStatus: 'restricted', probeOnGranted: true,
        sourceAvailable: true,
    });
    assert.equal(result.state, 'settings-required');
    assert.equal(result.shouldProbe, false);
});

test('first consent still requires restart if the process cannot yet receive pixels', () => {
    const result = resolveScreenCaptureSetup({
        platform: 'darwin', permissionStatus: 'granted', probeOnGranted: true,
        probeComplete: true, grantedDuringProbe: true, sourceAvailable: false,
    });
    assert.equal(result.state, 'restart-required');
});
