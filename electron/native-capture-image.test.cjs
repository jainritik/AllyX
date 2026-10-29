const assert = require('node:assert/strict');
const test = require('node:test');
const { MAX_NATIVE_CAPTURE_EDGE, constrainNativeCaptureImage, getConstrainedCaptureSize } = require('./native-capture-image');

test('keeps a small native capture at its original resolution', () => {
    assert.deepEqual(getConstrainedCaptureSize({ width: 1200, height: 800 }), { width: 1200, height: 800, resized: false });
});

test('downscales oversized Retina native captures before IPC and OCR', () => {
    assert.deepEqual(getConstrainedCaptureSize({ width: 4800, height: 2700 }), { width: MAX_NATIVE_CAPTURE_EDGE, height: 2304, resized: true });
    const calls = [];
    const image = {
        getSize: () => ({ width: 4800, height: 2700 }),
        resize: options => { calls.push(options); return 'resized-image'; },
    };
    assert.equal(constrainNativeCaptureImage(image), 'resized-image');
    assert.deepEqual(calls, [{ width: MAX_NATIVE_CAPTURE_EDGE, height: 2304, quality: 'best' }]);
});


test('preserves full native resolution for the reported 2860-pixel OCR screenshot', () => {
    assert.deepEqual(getConstrainedCaptureSize({ width: 2860, height: 1514 }), { width: 2860, height: 1514, resized: false });
});
