const test = require('node:test');
const assert = require('node:assert/strict');
const { createCapturePrivacy } = require('./capture-privacy');

function fakeWindow(id) {
    let protection = false;
    return { id, isDestroyed: () => false,
        setContentProtection(value) { protection = value; },
        isContentProtected: () => protection };
}

test('privacy starts enabled and covers windows added after a toggle', () => {
    const windows = [fakeWindow(1)];
    const controller = createCapturePrivacy({ platform: 'win32', release: '10.0.26100', getWindows: () => windows });
    controller.apply(windows[0]);
    assert.equal(windows[0].isContentProtected(), true);
    controller.setRequested(false);
    windows.push(fakeWindow(2));
    controller.apply(windows[1]);
    assert.equal(windows[1].isContentProtected(), false);
    controller.setRequested(true);
    assert.ok(windows.every(window => window.isContentProtected()));
    assert.equal(controller.status().receiverVerified, false);
    assert.equal(controller.status().receiverVerificationStatus, 'not-tested');
    assert.ok(controller.status().uncoveredSurfaces.includes('system-dialogs'));
});

test('a native failure is reported without preventing other windows from updating', () => {
    const windows = [fakeWindow(1), fakeWindow(2)];
    windows[0].setContentProtection = () => { throw new Error('OS rejected request'); };
    const controller = createCapturePrivacy({ platform: 'darwin', release: '25.0.0', getWindows: () => windows });
    const state = controller.setRequested(true);
    assert.equal(state.windows[0].requestApplied, false);
    assert.equal(state.windows[0].error, 'OS rejected request');
    assert.equal(state.windows[1].requestApplied, true);
    assert.equal(state.captureExclusion, 'not-guaranteed');
});

test('privacy never hides or pauses the local window', () => {
    const window = fakeWindow(1);
    window.hide = () => assert.fail('privacy must keep the window visible');
    const controller = createCapturePrivacy({ platform: 'darwin', release: '25.0.0', getWindows: () => [window] });
    controller.setRequested(true);
    controller.setRequested(false);
});
