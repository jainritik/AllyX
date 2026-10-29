const MAX_NATIVE_CAPTURE_EDGE = 4096;

function getConstrainedCaptureSize(size, maxEdge = MAX_NATIVE_CAPTURE_EDGE) {
    const width = Number(size?.width);
    const height = Number(size?.height);
    const safeMaxEdge = Number(maxEdge);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || !Number.isFinite(safeMaxEdge) || safeMaxEdge < 1) {
        throw new Error('Invalid captured image size.');
    }

    const longestEdge = Math.max(width, height);
    if (longestEdge <= safeMaxEdge) {
        return { width: Math.round(width), height: Math.round(height), resized: false };
    }

    const scale = safeMaxEdge / longestEdge;
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
        resized: true,
    };
}

function constrainNativeCaptureImage(image, maxEdge = MAX_NATIVE_CAPTURE_EDGE) {
    if (!image || typeof image.getSize !== 'function') throw new Error('Captured image was unavailable.');
    const target = getConstrainedCaptureSize(image.getSize(), maxEdge);
    if (!target.resized) return image;
    return image.resize({ width: target.width, height: target.height, quality: 'best' });
}

module.exports = { MAX_NATIVE_CAPTURE_EDGE, getConstrainedCaptureSize, constrainNativeCaptureImage };
