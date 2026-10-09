const test = require('node:test');
const assert = require('node:assert/strict');
const { getUsableDisplaySource, getUsableScreenSource } = require('./screen-capture-source');

function source(displayId, width = 1600, height = 1000) {
    return {
        display_id: String(displayId),
        thumbnail: {
            getSize: () => ({ width, height }),
            isEmpty: () => width === 0 || height === 0,
        },
    };
}

test('uses the thumbnail for the display containing the scanner frame', () => {
    const expected = source(2);
    const result = getUsableDisplaySource([source(1), expected], 2);
    assert.equal(result.source, expected);
    assert.deepEqual(result.size, { width: 1600, height: 1000 });
});

test('does not capture a different display when the selected display is unavailable', () => {
    const result = getUsableDisplaySource([source(1), source(3)], 2);
    assert.equal(result.source, null);
    assert.equal(result.reason, 'display-not-found');
});

test('retries a transient native capture failure before returning an error', async () => {
    let calls = 0;
    const result = await getUsableScreenSource({
        displayId: 1,
        options: {},
        getSources: async () => {
            calls += 1;
            if (calls === 1) throw new Error('Screen capture failed.');
            return [source(1)];
        },
        delay: async () => {},
    });
    assert.equal(calls, 2);
    assert.equal(result.source.display_id, '1');
    assert.equal(result.attempts, 2);
});

test('retries an empty thumbnail, then succeeds once macOS supplies pixels', async () => {
    let calls = 0;
    const result = await getUsableScreenSource({
        displayId: 1,
        options: {},
        getSources: async () => {
            calls += 1;
            return [calls === 1 ? source(1, 0, 0) : source(1)];
        },
        delay: async () => {},
    });
    assert.equal(calls, 2);
    assert.equal(result.reason, null);
});

test('returns a normalized result after all native capture attempts fail', async () => {
    const result = await getUsableScreenSource({
        displayId: 1,
        options: {},
        attempts: 2,
        getSources: async () => { throw new Error('Screen capture failed.'); },
        delay: async () => {},
    });
    assert.equal(result.source, null);
    assert.equal(result.reason, 'capture-error');
    assert.equal(result.attempts, 2);
});
