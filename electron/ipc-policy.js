const SCANNER_CHANNELS = new Set([
    'update-scanner-bounds',
    'capture-scanner-area',
    'open-screen-recording-settings',
    'toggle-scanner-frame',
    'relaunch-app',
]);

const OVERLAY_CHANNELS = new Set([
    'show-app',
    'hide-overlay',
    'resize-overlay',
    'set-ignore-mouse-events',
    'get-overlay-state',
    'submit-overlay-question',
    'continue-overlay-answer',
    'toggle-overlay-listening',
    'end-overlay-interview',
    'toggle-scanner-frame',
]);

function isAllowedAuxiliaryChannel(kind, channel) {
    if (kind === 'scanner') return SCANNER_CHANNELS.has(channel);
    if (kind === 'overlay') return OVERLAY_CHANNELS.has(channel);
    return false;
}

module.exports = { isAllowedAuxiliaryChannel };
