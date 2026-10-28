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
        state: 'capture-unavailable',
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
