function calculateCaptureCrop(displayBounds, imageSize, selectionBounds) {
    const values = [displayBounds.x, displayBounds.y, displayBounds.width, displayBounds.height, imageSize.width, imageSize.height, selectionBounds.x, selectionBounds.y, selectionBounds.width, selectionBounds.height];
    if (!values.every(Number.isFinite) || displayBounds.width <= 0 || displayBounds.height <= 0 || imageSize.width <= 0 || imageSize.height <= 0 || selectionBounds.width <= 0 || selectionBounds.height <= 0) {
        throw new Error('Invalid capture geometry.');
    }
    const relativeX = selectionBounds.x - displayBounds.x;
    const relativeY = selectionBounds.y - displayBounds.y;
    if (relativeX < 0 || relativeY < 0 || relativeX + selectionBounds.width > displayBounds.width || relativeY + selectionBounds.height > displayBounds.height) {
        throw new Error('Select an area within one display.');
    }
    const scaleX = imageSize.width / displayBounds.width;
    const scaleY = imageSize.height / displayBounds.height;
    const x = Math.max(0, Math.round(relativeX * scaleX));
    const y = Math.max(0, Math.round(relativeY * scaleY));
    return {
        x,
        y,
        width: Math.max(1, Math.min(imageSize.width - x, Math.round(selectionBounds.width * scaleX))),
        height: Math.max(1, Math.min(imageSize.height - y, Math.round(selectionBounds.height * scaleY))),
    };
}

module.exports = { calculateCaptureCrop };
