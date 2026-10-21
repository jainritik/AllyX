const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_PICKER_CAPTURE_DATA_URL_LENGTH, validatePickerCaptureImage } = require('./screen-picker-image');

test('accepts a bounded PNG captured by the explicit system picker', () => {
    assert.deepEqual(validatePickerCaptureImage('data:image/png;base64,aGVsbG8='), { valid: true });
});

test('rejects non-image, malformed, and oversized picker data', () => {
    assert.equal(validatePickerCaptureImage('data:text/plain;base64,aGVsbG8=').valid, false);
    assert.equal(validatePickerCaptureImage('data:image/png;base64,not base64').valid, false);
    assert.equal(validatePickerCaptureImage(`data:image/png;base64,${'a'.repeat(MAX_PICKER_CAPTURE_DATA_URL_LENGTH)}`).valid, false);
});
