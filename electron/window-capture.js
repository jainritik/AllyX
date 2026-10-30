const { getSourcesWithTimeout } = require('./screen-capture-source');

function externalWindows(sources, excludedIds) {
    return sources.filter(source => source.id.startsWith('window:') && !excludedIds.includes(source.id));
}

async function windowSources(getSources, excludedIds, preview = false) {
    return externalWindows(await getSourcesWithTimeout(getSources, {
        types: ['window'], thumbnailSize: preview ? { width: 4096, height: 4096 } : { width: 0, height: 0 },
    }, 8000), excludedIds);
}

function cropPage(image, top) {
    if (!Number.isFinite(top) || top <= 0 || top >= 0.9) throw new Error('Mark where the webpage begins below the browser bars.');
    const { width, height } = image.getSize();
    const y = Math.round(height * top);
    if (image.isEmpty() || width < 1 || height - y < 20) throw new Error('The window preview is empty or too small.');
    return image.crop({ x: 0, y, width, height: height - y });
}

module.exports = { externalWindows, windowSources, cropPage };
