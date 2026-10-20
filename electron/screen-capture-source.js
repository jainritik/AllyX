// ScreenCaptureKit can briefly return an empty source immediately after focus,
// a display change, or closing System Settings. Keep retries bounded so a
// hung native request never leaves the capture frame stuck indefinitely.
const DEFAULT_CAPTURE_ATTEMPTS = 4;
const DEFAULT_RETRY_DELAYS_MS = [250, 500, 1000];
const DEFAULT_CAPTURE_TIMEOUT_MS = 3500;

function pause(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function createTimeoutError(timeoutMs) {
    const error = new Error(`Screen capture did not respond within ${timeoutMs}ms.`);
    error.code = 'CAPTURE_TIMEOUT';
    return error;
}

async function getSourcesWithTimeout(getSources, options, timeoutMs) {
    let timeoutId = null;
    try {
        return await Promise.race([
            Promise.resolve().then(() => getSources(options)),
            new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(createTimeoutError(timeoutMs)), timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

function getUsableDisplaySource(sources, displayId) {
    if (!Array.isArray(sources) || sources.length === 0) {
        return { source: null, size: null, reason: 'no-sources', sourceCount: 0 };
    }

    // A single source is safe when the operating system only exposes one
    // display. With more than one source, never guess: the scan must come
    // from the display containing the selection frame.
    const source = sources.find(item => String(item.display_id) === String(displayId))
        || (sources.length === 1 ? sources[0] : null);
    if (!source) return { source: null, size: null, reason: 'display-not-found', sourceCount: sources.length };

    const thumbnail = source.thumbnail;
    if (!thumbnail || typeof thumbnail.getSize !== 'function') {
        return { source: null, size: null, reason: 'thumbnail-empty', sourceCount: sources.length };
    }

    const size = thumbnail.getSize();
    const isEmpty = typeof thumbnail.isEmpty === 'function' && thumbnail.isEmpty();
    if (isEmpty || !Number.isFinite(size?.width) || !Number.isFinite(size?.height) || size.width < 1 || size.height < 1) {
        return { source: null, size: null, reason: 'thumbnail-empty', sourceCount: sources.length };
    }

    return { source, size, reason: null, sourceCount: sources.length };
}

async function getUsableScreenSource({
    getSources,
    options,
    displayId,
    attempts = DEFAULT_CAPTURE_ATTEMPTS,
    retryDelays = DEFAULT_RETRY_DELAYS_MS,
    timeoutMs = DEFAULT_CAPTURE_TIMEOUT_MS,
    delay = pause,
}) {
    let lastReason = 'no-sources';
    let lastError = null;
    let lastSourceCount = 0;
    const totalAttempts = Math.max(1, Math.floor(attempts));

    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
        try {
            const sources = await getSourcesWithTimeout(getSources, options, timeoutMs);
            const result = getUsableDisplaySource(sources, displayId);
            if (result.source) {
                return { ...result, attempts: attempt, error: null };
            }
            lastReason = result.reason;
            lastError = null;
            lastSourceCount = result.sourceCount;
        } catch (error) {
            lastReason = error && error.code === 'CAPTURE_TIMEOUT' ? 'capture-timeout' : 'capture-error';
            lastError = error instanceof Error ? error : new Error('Unable to read the screen.');
        }

        if (attempt < totalAttempts) {
            const configuredDelay = Array.isArray(retryDelays)
                ? retryDelays[Math.min(attempt - 1, retryDelays.length - 1)]
                : 0;
            await delay(Math.max(0, Number(configuredDelay) || 0));
        }
    }

    return {
        source: null,
        size: null,
        reason: lastReason,
        attempts: totalAttempts,
        error: lastError,
        sourceCount: lastSourceCount,
    };
}

module.exports = {
    DEFAULT_CAPTURE_ATTEMPTS,
    DEFAULT_CAPTURE_TIMEOUT_MS,
    getSourcesWithTimeout,
    getUsableDisplaySource,
    getUsableScreenSource,
};
