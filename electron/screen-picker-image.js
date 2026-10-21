const MAX_PICKER_CAPTURE_DATA_URL_LENGTH = 12 * 1024 * 1024;
const PICKER_IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

function validatePickerCaptureImage(imageData) {
    if (typeof imageData !== 'string' || imageData.length === 0) {
        return { valid: false, error: 'The selected image was empty.' };
    }
    if (imageData.length > MAX_PICKER_CAPTURE_DATA_URL_LENGTH) {
        return { valid: false, error: 'The selected image is too large. Select a smaller text area and try again.' };
    }
    if (!PICKER_IMAGE_DATA_URL.test(imageData)) {
        return { valid: false, error: 'The selected image format was not supported.' };
    }
    return { valid: true };
}

module.exports = { MAX_PICKER_CAPTURE_DATA_URL_LENGTH, validatePickerCaptureImage };
