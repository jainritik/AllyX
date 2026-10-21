/**
 * Newer desktop builds coordinate the native scanner and renderer so a
 * capture cannot be accepted twice while OCR is running. Older supported
 * desktop builds do not expose these two IPC methods, but they can still
 * deliver a valid image to the renderer.
 */
function supportsCoordinatedScannerCapture(api) {
    return Boolean(
        api
        && typeof api.setScannerProcessing === 'function'
        && typeof api.acknowledgeScannerCapture === 'function',
    );
}

module.exports = { supportsCoordinatedScannerCapture };
