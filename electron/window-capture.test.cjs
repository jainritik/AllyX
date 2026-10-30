const test = require('node:test');
const assert = require('node:assert/strict');
const { externalWindows, windowSources, cropPage } = require('./window-capture');

test('window capture excludes displays and AllyX windows without guessing a source', async () => {
    const sources = [{ id: 'screen:0:0' }, { id: 'window:1:0' }, { id: 'window:2:0' }];
    assert.deepEqual(externalWindows(sources, ['window:1:0']), [{ id: 'window:2:0' }]);
    const result = await windowSources(async options => {
        assert.deepEqual(options.types, ['window']);
        assert.equal(options.thumbnailSize.width, 4096);
        return sources;
    }, ['window:1:0'], true);
    assert.deepEqual(result, [{ id: 'window:2:0' }]);
});

test('webpage crop removes browser bars using actual image pixels at different scales', () => {
    for (const scale of [1, 2]) {
        let crop;
        const image = { getSize: () => ({ width: 1200 * scale, height: 800 * scale }), isEmpty: () => false, crop: value => { crop = value; return 'cropped'; } };
        assert.equal(cropPage(image, 0.125), 'cropped');
        assert.deepEqual(crop, { x: 0, y: 100 * scale, width: 1200 * scale, height: 700 * scale });
        for (const top of [null, undefined, NaN, -1, 0, 0.9, 1, '0.1']) assert.throws(() => cropPage(image, top));
    }
});

test('native webpage handlers deliver only the chosen cropped preview and reject stale or desktop requests', async () => {
    const fs = require('node:fs'), vm = require('node:vm');
    const main = fs.readFileSync('electron/main.js', 'utf8');
    const handlers = {}, delivered = [];
    const image = { getSize: () => ({ width: 1600, height: 1000 }), isEmpty: () => false, toDataURL: () => 'preview', crop: rect => ({ toDataURL: () => JSON.stringify(rect) }) };
    const context = {
        handleTrusted: (name, handler) => { handlers[name] = handler; },
        BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, getMediaSourceId: () => 'window:allyx:0' }] },
        desktopCapturer: { getSources: async () => [{ id: 'window:browser:0', name: 'Browser', thumbnail: image }, { id: 'screen:0:0', thumbnail: image }] },
        windowSources, cropPage, constrainNativeCaptureImage: value => value,
        scannerFrameWindow: {}, isPresentationSafeMode: false, pendingWindowPreview: null,
        scannerCaptureSequence: 0, scannerCaptureInFlight: false,
        deliverScannerCapture: async (data, mode) => { delivered.push({ data, mode }); return true; },
        closeScannerFrame() {}, Date,
    };
    vm.runInNewContext(main.slice(main.indexOf('    // Legacy renderers'), main.indexOf("    handleTrusted('acknowledge-scanner-capture'")), context);
    assert.equal((await handlers['capture-scanner-display']()).success, false);
    assert.equal((await handlers['preview-scanner-window'](null, 'screen:0:0')).success, false);
    const preview = await handlers['preview-scanner-window'](null, 'window:browser:0');
    assert.equal(preview.success, true);
    assert.equal((await handlers['capture-scanner-page'](null, preview.id + 1, 0.1)).success, false);
    assert.equal((await handlers['capture-scanner-page'](null, preview.id, 0.1)).success, true);
    assert.deepEqual(delivered, [{ data: JSON.stringify({ x: 0, y: 100, width: 1600, height: 900 }), mode: 'area' }]);
    assert.equal((await handlers['capture-scanner-page'](null, preview.id, 0.1)).success, false);
});
