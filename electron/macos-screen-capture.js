const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const MAX_CAPTURE_BYTES = 80 * 1024 * 1024;
const MAX_CAPTURE_EDGE = 20_000;

function captureError(message, code, cause) {
    const error = new Error(message);
    error.code = code;
    if (cause) error.cause = cause;
    return error;
}

function normaliseRegion(region) {
    const x = Math.round(Number(region?.x));
    const y = Math.round(Number(region?.y));
    const width = Math.round(Number(region?.width));
    const height = Math.round(Number(region?.height));
    if (![x, y, width, height].every(Number.isFinite) || width < 1 || height < 1) {
        throw captureError('The capture area is invalid.', 'INVALID_CAPTURE_REGION');
    }
    return { x, y, width, height };
}

function validateImage(image) {
    if (!image || typeof image.getSize !== 'function') {
        throw captureError('macOS did not return an image.', 'CAPTURE_EMPTY_IMAGE');
    }
    const size = image.getSize();
    const isEmpty = typeof image.isEmpty === 'function' && image.isEmpty();
    if (
        isEmpty
        || !Number.isFinite(size?.width)
        || !Number.isFinite(size?.height)
        || size.width < 1
        || size.height < 1
        || size.width > MAX_CAPTURE_EDGE
        || size.height > MAX_CAPTURE_EDGE
    ) {
        throw captureError('macOS returned an empty or unsupported image.', 'CAPTURE_EMPTY_IMAGE');
    }
    return { width: size.width, height: size.height };
}

async function captureMacOSImage({ args, nativeImage, fsModule = fs, execFileImpl = execFileAsync, tempDirectory = os.tmpdir() }) {
    if (!nativeImage || typeof nativeImage.createFromPath !== 'function') {
        throw new TypeError('nativeImage.createFromPath is required.');
    }
    const directory = await fsModule.mkdtemp(path.join(tempDirectory, 'allyx-screen-capture-'));
    const outputPath = path.join(directory, 'capture.png');
    try {
        try {
            await execFileImpl('/usr/sbin/screencapture', [...args, outputPath], {
                timeout: 12_000,
                maxBuffer: 64 * 1024,
                windowsHide: true,
            });
        } catch (error) {
            const code = error?.killed || error?.code === 'ETIMEDOUT'
                ? 'CAPTURE_TIMEOUT'
                : 'CAPTURE_COMMAND_FAILED';
            throw captureError('macOS could not capture this screen.', code, error);
        }

        let details;
        try {
            details = await fsModule.stat(outputPath);
        } catch (error) {
            throw captureError('macOS did not create a screen image.', 'CAPTURE_FILE_MISSING', error);
        }
        if (!Number.isFinite(details.size) || details.size < 64 || details.size > MAX_CAPTURE_BYTES) {
            throw captureError('macOS returned an invalid screen image.', 'CAPTURE_FILE_INVALID');
        }

        const image = nativeImage.createFromPath(outputPath);
        return { image, size: validateImage(image) };
    } finally {
        await fsModule.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
}

async function captureMacOSRegion({ region, ...options }) {
    const { x, y, width, height } = normaliseRegion(region);
    // macOS interprets -R in logical display coordinates and returns Retina
    // pixels when appropriate. The scanner already supplies native window
    // bounds in that coordinate space.
    return captureMacOSImage({
        ...options,
        args: ['-x', '-r', '-t', 'png', '-R', `${x},${y},${width},${height}`],
    });
}

async function captureMacOSMainDisplay(options) {
    return captureMacOSImage({
        ...options,
        // -D 1 is macOS's whole-primary-display equivalent of Cmd+Shift+3.
        args: ['-x', '-r', '-t', 'png', '-D', '1'],
    });
}

module.exports = {
    MAX_CAPTURE_BYTES,
    captureMacOSImage,
    captureMacOSMainDisplay,
    captureMacOSRegion,
    normaliseRegion,
};
