const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveScreenCaptureSetup } = require('./screen-capture-setup');

test('never requests desktop capture from an app running on a mounted DMG', () => {
    const result = resolveScreenCaptureSetup({
        platform: 'darwin',
        permissionStatus: 'not-determined',
        isRunningFromMountedDmg: true,
    });

    assert.equal(result.state, 'install-required');
    assert.equal(result.shouldProbe, false);
});

test('uses one native consent probe when macOS has not decided yet', () => {
    const beforeProbe = resolveScreenCaptureSetup({
        platform: 'darwin',
        permissionStatus: 'not-determined',
    });
    const whileAwaitingConsent = resolveScreenCaptureSetup({
        platform: 'darwin',
        permissionStatus: 'not-determined',
        probeComplete: true,
    });

    assert.deepEqual(beforeProbe, {
        state: 'consent-probe',
        permissionStatus: 'not-determined',
        shouldProbe: true,
    });
    assert.deepEqual(whileAwaitingConsent, {
        state: 'awaiting-consent',
        permissionStatus: 'not-determined',
        shouldProbe: false,
    });
});

test('does not require a restart when first-use consent already returned pixels', () => {
    const result = resolveScreenCaptureSetup({
        platform: 'darwin',
        permissionStatus: 'granted',
        probeComplete: true,
        sourceAvailable: true,
        grantedDuringProbe: true,
    });

    assert.equal(result.state, 'ready');
    assert.equal(result.shouldProbe, false);
});

test('keeps granted and actual pixel availability ready without a second probe', () => {
    const granted = resolveScreenCaptureSetup({
        platform: 'darwin',
        permissionStatus: 'granted',
    });
    const pixelsWithStaleStatus = resolveScreenCaptureSetup({
        platform: 'darwin',
        permissionStatus: 'not-determined',
        probeComplete: true,
        sourceAvailable: true,
    });
    const pixelsWithPessimisticStatus = resolveScreenCaptureSetup({
        platform: 'darwin',
        permissionStatus: 'denied',
        probeComplete: true,
        sourceAvailable: true,
    });

    assert.equal(granted.state, 'ready');
    assert.equal(granted.shouldProbe, false);
    assert.equal(pixelsWithStaleStatus.state, 'ready');
    assert.equal(pixelsWithStaleStatus.shouldProbe, false);
    assert.equal(pixelsWithPessimisticStatus.state, 'ready');
    assert.equal(pixelsWithPessimisticStatus.shouldProbe, false);
});

test('keeps denied and restricted statuses on the explicit Settings recovery path', () => {
    for (const permissionStatus of ['denied', 'restricted']) {
        const result = resolveScreenCaptureSetup({ platform: 'darwin', permissionStatus });
        assert.equal(result.state, 'settings-required');
        assert.equal(result.shouldProbe, false);
    }
});
