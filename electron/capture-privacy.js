const { getPlatformCapabilities } = require('./platform-capabilities');

// This controls an OS request. It cannot observe another application's recording.
function createCapturePrivacy({ platform, release, getWindows }) {
    let requested = true;
    const failures = new Map();
    const supported = platform === 'darwin' || platform === 'win32';

    function apply(window) {
        if (window.isDestroyed()) return;
        try {
            if (supported) window.setContentProtection(requested);
            failures.delete(window.id);
        } catch (error) {
            failures.set(window.id, error.message);
        }
    }

    function status() {
        const windows = getWindows().filter(window => !window.isDestroyed());
        return {
            ...getPlatformCapabilities(platform, release),
            requested,
            windows: windows.map(window => ({
                id: window.id,
                requestApplied: supported && !failures.has(window.id) &&
                    window.isContentProtected() === requested,
                error: failures.get(window.id) || null,
            })),
        };
    }

    function setRequested(value) {
        requested = Boolean(value);
        getWindows().forEach(apply);
        return status();
    }

    return { apply, status, setRequested };
}

module.exports = { createCapturePrivacy };
