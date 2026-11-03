const { getSourcesWithTimeout } = require('./screen-capture-source');

function externalWindows(sources, excludedIds) {
    return sources.filter(source => source.id.startsWith('window:') && !excludedIds.includes(source.id));
}

async function windowSources(getSources, excludedIds, preview = false) {
    // ScreenCaptureKit can return an empty enumeration without an error.
    // Retry once with pixels requested instead of treating that as proof that
    // the customer has no windows. Never substitute a whole display.
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const size = preview ? 4096 : (attempt === 0 ? 0 : 150);
        const sources = externalWindows(await getSourcesWithTimeout(getSources, {
            types: ['window'], thumbnailSize: { width: size, height: size },
        }, 8000), excludedIds);
        if (sources.length) return sources;
    }
    throw new Error('Window capture is unavailable. Bring your browser onscreen and retry, or use selected-area capture.');
}

function cropPage(image, top) {
    if (!Number.isFinite(top) || top <= 0 || top >= 0.9) throw new Error('Mark where the webpage begins below the browser bars.');
    const { width, height } = image.getSize();
    const y = Math.round(height * top);
    if (image.isEmpty() || width < 1 || height - y < 20) throw new Error('The window preview is empty or too small.');
    return image.crop({ x: 0, y, width, height: height - y });
}

module.exports = { externalWindows, windowSources, cropPage };
