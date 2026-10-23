const test = require('node:test');
const assert = require('node:assert/strict');
const {
    captureMacOSMainDisplay,
    captureMacOSRegion,
    normaliseRegion,
} = require('./macos-screen-capture');

function createHarness({ image = null, commandError = null, fileSize = 512 } = {}) {
    const calls = { commands: [], removed: [] };
    const usableImage = image || {
        getSize: () => ({ width: 1600, height: 900 }),
        isEmpty: () => false,
    };
    return {
        calls,
        nativeImage: { createFromPath: () => usableImage },
        fsModule: {
            mkdtemp: async () => '/tmp/allyx-capture-test',
            stat: async () => ({ size: fileSize }),
            rm: async (...args) => { calls.removed.push(args); },
        },
        execFileImpl: async (...args) => {
            calls.commands.push(args);
            if (commandError) throw commandError;
        },
    };
}

test('normalises macOS screen regions and retains virtual-display coordinates', () => {
    assert.deepEqual(normaliseRegion({ x: -12.4, y: 34.6, width: 400.2, height: 300.8 }), {
        x: -12,
        y: 35,
        width: 400,
        height: 301,
    });
    assert.throws(() => normaliseRegion({ x: 0, y: 0, width: 0, height: 40 }), /capture area/i);
});

test('captures a selected region with macOS logical coordinates and removes the temporary file', async () => {
    const harness = createHarness();
    const result = await captureMacOSRegion({
        region: { x: 20, y: 40, width: 400, height: 300 },
        nativeImage: harness.nativeImage,
        fsModule: harness.fsModule,
        execFileImpl: harness.execFileImpl,
        tempDirectory: '/tmp',
    });

    assert.deepEqual(result.size, { width: 1600, height: 900 });
    const [binary, args] = harness.calls.commands[0];
    assert.equal(binary, '/usr/sbin/screencapture');
    assert.deepEqual(args.slice(0, -1), ['-x', '-r', '-t', 'png', '-R', '20,40,400,300']);
    assert.equal(harness.calls.removed.length, 1);
    assert.equal(harness.calls.removed[0][0], '/tmp/allyx-capture-test');
});

test('captures the main display through macOS and always cleans up after command failures', async () => {
    const harness = createHarness({ commandError: new Error('TCC denied') });
    await assert.rejects(
        captureMacOSMainDisplay({
            nativeImage: harness.nativeImage,
            fsModule: harness.fsModule,
            execFileImpl: harness.execFileImpl,
            tempDirectory: '/tmp',
        }),
        error => error?.code === 'CAPTURE_COMMAND_FAILED',
    );
    const [, args] = harness.calls.commands[0];
    assert.deepEqual(args.slice(0, -1), ['-x', '-r', '-t', 'png', '-D', '1']);
    assert.equal(harness.calls.removed.length, 1);
});

test('reports a bounded timeout distinctly from a general command failure', async () => {
    const timeout = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT', killed: true });
    const harness = createHarness({ commandError: timeout });
    await assert.rejects(
        captureMacOSRegion({
            region: { x: 0, y: 0, width: 20, height: 20 },
            nativeImage: harness.nativeImage,
            fsModule: harness.fsModule,
            execFileImpl: harness.execFileImpl,
            tempDirectory: '/tmp',
        }),
        error => error?.code === 'CAPTURE_TIMEOUT',
    );
    assert.equal(harness.calls.removed.length, 1);
});

test('rejects an empty image before it can leave the temporary capture directory', async () => {
    const harness = createHarness({
        image: { getSize: () => ({ width: 0, height: 0 }), isEmpty: () => true },
    });
    await assert.rejects(
        captureMacOSMainDisplay({
            nativeImage: harness.nativeImage,
            fsModule: harness.fsModule,
            execFileImpl: harness.execFileImpl,
            tempDirectory: '/tmp',
        }),
        error => error?.code === 'CAPTURE_EMPTY_IMAGE',
    );
    assert.equal(harness.calls.removed.length, 1);
});
