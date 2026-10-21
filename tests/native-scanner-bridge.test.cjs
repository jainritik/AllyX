const test = require('node:test');
const assert = require('node:assert/strict');

const { supportsCoordinatedScannerCapture } = require('../src/lib/native-scanner-bridge');

test('uses coordinated scanner delivery only when both native IPC methods exist', () => {
    assert.equal(supportsCoordinatedScannerCapture(null), false);
    assert.equal(supportsCoordinatedScannerCapture({}), false);
    assert.equal(supportsCoordinatedScannerCapture({ setScannerProcessing() {} }), false);
    assert.equal(supportsCoordinatedScannerCapture({ acknowledgeScannerCapture() {} }), false);
    assert.equal(supportsCoordinatedScannerCapture({
        setScannerProcessing() {},
        acknowledgeScannerCapture() {},
    }), true);
});
