const test = require('node:test');
const assert = require('node:assert/strict');
const {
    getSelectableScreenSources,
    getScreenSourcesWithRetry,
    getUsableDisplaySource,
    getUsableScreenSource,
} = require('./screen-capture-source');

function source(displayId, width = 1600, height = 1000) {
    return {
        display_id: String(displayId),
        thumbnail: {
            getSize: () => ({ width, height }),
            isEmpty: () => width === 0 || height === 0,
        },
    };
}

function sourceWithoutDisplayId(width = 1600, height = 1000) {
    const value = source(1, width, height);
    delete value.display_id;
    return value;
}

test('uses the thumbnail for the display containing the scanner frame', () => {
    const expected = source(2);
    const result = getUsableDisplaySource([source(1), expected], 2);
    assert.equal(result.source, expected);
    assert.deepEqual(result.size, { width: 1600, height: 1000 });
});

test('does not capture a different display when the selected display is unavailable', () => {
    const result = getUsableDisplaySource([source(1), source(3)], 2, { displayCount: 2 });
    assert.equal(result.source, null);
    assert.equal(result.reason, 'display-not-found');
    assert.equal(result.displayId, '2');
    assert.equal(result.sourceDisplayIdCount, 2);
});

test('reports a missing native display id instead of guessing on multiple displays', () => {
    const result = getUsableDisplaySource([sourceWithoutDisplayId()], 2, { displayCount: 2 });
    assert.equal(result.source, null);
    assert.equal(result.reason, 'display-id-missing');
    assert.equal(result.sourceCount, 1);
    assert.equal(result.sourceDisplayIdCount, 0);
});

test('only falls back to a sole source when the operating system reports one display', () => {
    const expected = sourceWithoutDisplayId();
    const result = getUsableDisplaySource([expected], null, { displayCount: 1 });
    assert.equal(result.source, expected);
    assert.equal(result.usedSingleDisplayFallback, true);
});

test('retains thumbnail diagnostics when macOS returns an empty image', () => {
    const result = getUsableDisplaySource([source(1, 0, 0)], 1, { displayCount: 1 });
    assert.equal(result.source, null);
    assert.equal(result.reason, 'thumbnail-empty');
    assert.equal(result.thumbnailState, 'empty');
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

test('bounds a native capture call that never resolves', async () => {
    const startedAt = Date.now();
    const result = await getUsableScreenSource({
        displayId: 1,
        options: {},
        attempts: 1,
        timeoutMs: 10,
        getSources: async () => new Promise(() => {}),
    });
    assert.equal(result.reason, 'capture-timeout');
    assert.equal(result.attempts, 1);
    assert.ok(Date.now() - startedAt < 500);
});

test('filters source entries without a stable native source id for meeting audio', () => {
    const result = getSelectableScreenSources([
        { id: '', name: 'Display 1' },
        { name: 'Display 2' },
    ]);
    assert.deepEqual(result.sources, []);
    assert.equal(result.reason, 'source-id-missing');
    assert.equal(result.sourceCount, 2);
    assert.equal(result.missingSourceIdCount, 2);
});

test('retries a transient empty meeting-audio source list before returning displays', async () => {
    let calls = 0;
    const result = await getScreenSourcesWithRetry({
        options: {},
        getSources: async () => {
            calls += 1;
            return calls === 1 ? [] : [{ id: 'screen:1:0', name: 'Display 1' }];
        },
        delay: async () => {},
    });
    assert.equal(calls, 2);
    assert.equal(result.reason, null);
    assert.equal(result.sources[0].id, 'screen:1:0');
    assert.equal(result.attempts, 2);
});

test('bounds a stalled meeting-audio source listing', async () => {
    const result = await getScreenSourcesWithRetry({
        options: {},
        attempts: 1,
        timeoutMs: 10,
        getSources: async () => new Promise(() => {}),
    });
    assert.equal(result.sources.length, 0);
    assert.equal(result.reason, 'capture-timeout');
    assert.equal(result.attempts, 1);
    assert.equal(result.error.code, 'CAPTURE_TIMEOUT');
});
