const DEFAULT_CAPTURE_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 300;

function pause(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getUsableDisplaySource(sources, displayId) {
    if (!Array.isArray(sources) || sources.length === 0) {
        return { source: null, size: null, reason: 'no-sources' };
    }

    // A single source is safe when the operating system only exposes one
    // display. With more than one source, never guess: the scan must come
    // from the display containing the selection frame.
    const source = sources.find(item => String(item.display_id) === String(displayId))
        || (sources.length === 1 ? sources[0] : null);
    if (!source) return { source: null, size: null, reason: 'display-not-found' };

    const thumbnail = source.thumbnail;
    if (!thumbnail || typeof thumbnail.getSize !== 'function') {
        return { source: null, size: null, reason: 'thumbnail-empty' };
    }

    const size = thumbnail.getSize();
    const isEmpty = typeof thumbnail.isEmpty === 'function' && thumbnail.isEmpty();
    if (isEmpty || !Number.isFinite(size?.width) || !Number.isFinite(size?.height) || size.width < 1 || size.height < 1) {
        return { source: null, size: null, reason: 'thumbnail-empty' };
    }

    return { source, size, reason: null };
}

async function getUsableScreenSource({ getSources, options, displayId, attempts = DEFAULT_CAPTURE_ATTEMPTS, delay = pause }) {
    let lastReason = 'no-sources';
    let lastError = null;
    const totalAttempts = Math.max(1, Math.floor(attempts));

    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
        try {
            const sources = await getSources(options);
            const result = getUsableDisplaySource(sources, displayId);
            if (result.source) {
                return { ...result, attempts: attempt, error: null };
            }
            lastReason = result.reason;
            lastError = null;
        } catch (error) {
            lastReason = 'capture-error';
            lastError = error instanceof Error ? error : new Error('Unable to read the screen.');
        }

        if (attempt < totalAttempts) await delay(DEFAULT_RETRY_DELAY_MS * attempt);
    }

    return { source: null, size: null, reason: lastReason, attempts: totalAttempts, error: lastError };
}

module.exports = { DEFAULT_CAPTURE_ATTEMPTS, getUsableDisplaySource, getUsableScreenSource };
