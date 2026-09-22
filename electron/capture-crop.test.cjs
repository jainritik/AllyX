const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateCaptureCrop } = require('./capture-crop');

test('capture crop maps global Retina coordinates into the native screenshot', () => {
    assert.deepEqual(
        calculateCaptureCrop(
            { x: 1440, y: -100, width: 1728, height: 1117 },
            { width: 3456, height: 2234 },
            { x: 1540, y: 100, width: 400, height: 300 },
        ),
        { x: 200, y: 400, width: 800, height: 600 },
    );
});

test('capture crop rejects a selection spanning displays', () => {
    assert.throws(() => calculateCaptureCrop(
        { x: 0, y: 0, width: 1440, height: 900 },
        { width: 2880, height: 1800 },
        { x: 1300, y: 100, width: 300, height: 200 },
    ), /within one display/);
});
