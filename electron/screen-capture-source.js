// ScreenCaptureKit can briefly return an empty source immediately after focus,
// a display change, or closing System Settings. Keep retries bounded so a
// hung native request never leaves the capture frame stuck indefinitely.
const DEFAULT_CAPTURE_ATTEMPTS = 4;
const DEFAULT_RETRY_DELAYS_MS = [250, 500, 1000];
const DEFAULT_CAPTURE_TIMEOUT_MS = 3500;
// Audio-source enumeration should recover from the same short-lived macOS
// ScreenCaptureKit gaps as image capture, but it must not hold the Start
// Listening control indefinitely. These values bound one renderer request to
// roughly four seconds including the retry delay.
const DEFAULT_SOURCE_LIST_ATTEMPTS = 2;
const DEFAULT_SOURCE_LIST_RETRY_DELAYS_MS = [200];
const DEFAULT_SOURCE_LIST_TIMEOUT_MS = 2000;

function pause(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function createTimeoutError(timeoutMs) {
    const error = new Error(`Screen capture did not respond within ${timeoutMs}ms.`);
    error.code = 'CAPTURE_TIMEOUT';
    return error;
}

async function getSourcesWithTimeout(getSources, options, timeoutMs) {
    const effectiveTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0
        ? Math.floor(timeoutMs)
        : DEFAULT_CAPTURE_TIMEOUT_MS;
    let timeoutId = null;
    try {
        return await Promise.race([
            Promise.resolve().then(() => getSources(options)),
            new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(createTimeoutError(effectiveTimeoutMs)), effectiveTimeoutMs);
            }),
        ]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

function hasIdentifier(value) {
    return (typeof value === 'string' || typeof value === 'number') && String(value).trim().length > 0;
}

function normaliseDisplayId(displayId) {
    return hasIdentifier(displayId) ? String(displayId) : null;
}

function normaliseDisplayCount(displayCount) {
    return Number.isInteger(displayCount) && displayCount > 0 ? displayCount : null;
}

function captureSourceDiagnostics(sources, displayId, displayCount) {
    const sourceList = Array.isArray(sources) ? sources : [];
    const sourceDisplayIdCount = sourceList.filter(source => hasIdentifier(source?.display_id)).length;
    return {
        sourceCount: sourceList.length,
        displayId: normaliseDisplayId(displayId),
        displayCount: normaliseDisplayCount(displayCount),
        sourceDisplayIdCount,
    };
}

function noUsableThumbnail(diagnostics, thumbnailState) {
    return {
        source: null,
        size: null,
        reason: 'thumbnail-empty',
        thumbnailState,
        ...diagnostics,
    };
}

function getUsableDisplaySource(sources, displayId, { displayCount } = {}) {
    const diagnostics = captureSourceDiagnostics(sources, displayId, displayCount);
    if (!Array.isArray(sources) || sources.length === 0) {
        return { source: null, size: null, reason: 'no-sources', ...diagnostics };
    }

    const requestedDisplayId = diagnostics.displayId;
    let source = requestedDisplayId
        ? sources.find(item => normaliseDisplayId(item?.display_id) === requestedDisplayId)
        : null;
    let usedSingleDisplayFallback = false;

    // A source without a display_id can only be used when Electron and macOS
    // both report exactly one display. Never guess a display on a multi-screen
    // setup: capture must stay on the display that contains the selection.
    if (!source && diagnostics.displayCount === 1 && sources.length === 1) {
        source = sources[0];
        usedSingleDisplayFallback = true;
    }

    if (!source) {
        return {
            source: null,
            size: null,
            reason: !requestedDisplayId || diagnostics.sourceDisplayIdCount === 0
                ? 'display-id-missing'
                : 'display-not-found',
            ...diagnostics,
        };
    }

    const thumbnail = source.thumbnail;
    if (!thumbnail || typeof thumbnail.getSize !== 'function') {
        return noUsableThumbnail(diagnostics, 'missing');
    }

    let size;
    let isEmpty = false;
    try {
        size = thumbnail.getSize();
        isEmpty = typeof thumbnail.isEmpty === 'function' && thumbnail.isEmpty();
    } catch {
        return noUsableThumbnail(diagnostics, 'unreadable');
    }
    if (isEmpty || !Number.isFinite(size?.width) || !Number.isFinite(size?.height) || size.width < 1 || size.height < 1) {
        return noUsableThumbnail(diagnostics, isEmpty ? 'empty' : 'invalid-size');
    }

    return {
        source,
        size,
        reason: null,
        usedSingleDisplayFallback,
        ...diagnostics,
    };
}

function getSelectableScreenSources(sources) {
    const sourceList = Array.isArray(sources) ? sources : [];
    const selectableSources = sourceList.filter(source => hasIdentifier(source?.id));
    return {
        sources: selectableSources,
        reason: selectableSources.length > 0
            ? null
            : (sourceList.length === 0 ? 'no-sources' : 'source-id-missing'),
        sourceCount: sourceList.length,
        selectableSourceCount: selectableSources.length,
        missingSourceIdCount: sourceList.length - selectableSources.length,
    };
}

async function getScreenSourcesWithRetry({
    getSources,
    options,
    attempts = DEFAULT_SOURCE_LIST_ATTEMPTS,
    retryDelays = DEFAULT_SOURCE_LIST_RETRY_DELAYS_MS,
    timeoutMs = DEFAULT_SOURCE_LIST_TIMEOUT_MS,
    delay = pause,
}) {
    let lastResult = getSelectableScreenSources([]);
    let lastError = null;
    const totalAttempts = Math.max(1, Math.floor(attempts));

    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
        try {
            const sources = await getSourcesWithTimeout(getSources, options, timeoutMs);
            const result = getSelectableScreenSources(sources);
            if (result.sources.length > 0) {
                return { ...result, attempts: attempt, error: null };
            }
            lastResult = result;
            lastError = null;
        } catch (error) {
            lastResult = {
                ...lastResult,
                reason: error?.code === 'CAPTURE_TIMEOUT' ? 'capture-timeout' : 'capture-error',
            };
            lastError = error instanceof Error ? error : new Error('Unable to list available displays.');
        }

        if (attempt < totalAttempts) {
            const configuredDelay = Array.isArray(retryDelays)
                ? retryDelays[Math.min(attempt - 1, retryDelays.length - 1)]
                : 0;
            await delay(Math.max(0, Number(configuredDelay) || 0));
        }
    }

    return { ...lastResult, sources: [], attempts: totalAttempts, error: lastError };
}

async function getUsableScreenSource({
    getSources,
    options,
    displayId,
    displayCount,
    attempts = DEFAULT_CAPTURE_ATTEMPTS,
    retryDelays = DEFAULT_RETRY_DELAYS_MS,
    timeoutMs = DEFAULT_CAPTURE_TIMEOUT_MS,
    delay = pause,
}) {
    let lastReason = 'no-sources';
    let lastError = null;
    let lastResult = getUsableDisplaySource([], displayId, { displayCount });
    const totalAttempts = Math.max(1, Math.floor(attempts));

    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
        try {
            const sources = await getSourcesWithTimeout(getSources, options, timeoutMs);
            const result = getUsableDisplaySource(sources, displayId, { displayCount });
            if (result.source) {
                return { ...result, attempts: attempt, error: null };
            }
            lastReason = result.reason;
            lastError = null;
            lastResult = result;
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
        ...lastResult,
        source: null,
        size: null,
        reason: lastReason,
        attempts: totalAttempts,
        error: lastError,
    };
}

module.exports = {
    DEFAULT_CAPTURE_ATTEMPTS,
    DEFAULT_CAPTURE_TIMEOUT_MS,
    DEFAULT_SOURCE_LIST_ATTEMPTS,
    DEFAULT_SOURCE_LIST_TIMEOUT_MS,
    getSourcesWithTimeout,
    getSelectableScreenSources,
    getScreenSourcesWithRetry,
    getUsableDisplaySource,
    getUsableScreenSource,
};
