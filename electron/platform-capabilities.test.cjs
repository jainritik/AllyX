const test = require('node:test');
const assert = require('node:assert/strict');
const { getPlatformCapabilities } = require('./platform-capabilities');

test('Windows versions before capture exclusion do not receive support status', () => {
    for (const version of ['6.1.7601', '10.0.18363', '', '10.0.invalid']) {
        assert.equal(getPlatformCapabilities('win32', version).captureExclusion,
            'unsupported-or-unknown');
    }
});

test('Windows 2004 and 11 report API availability, never verified exclusion', () => {
    for (const version of ['10.0.19041', '10.0.26100']) {
        const result = getPlatformCapabilities('win32', version);
        assert.equal(result.captureExclusion, 'api-available-unverified');
        assert.equal(result.receiverVerified, false);
    }
});

test('Mac protection and external sharing detection are never inferred from OS version', () => {
    for (const version of ['23.0.0', '24.0.0', '25.0.0']) {
        const result = getPlatformCapabilities('darwin', version);
        assert.equal(result.captureExclusion, 'not-guaranteed');
        assert.equal(result.automaticExternalSharingDetection, 'unknown');
    }
});

test('unknown platforms use a conservative fallback', () => {
    for (const platform of ['linux', 'android', 'ios', 'browser', 'future-os']) {
        const result = getPlatformCapabilities(platform);
        assert.equal(result.captureExclusion, 'unsupported-or-unknown');
        assert.equal(result.recommendedFallback, 'hide-locally');
    }
});
