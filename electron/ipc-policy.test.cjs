const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedAuxiliaryChannel } = require('./ipc-policy');

test('scanner can capture, move, and close but cannot access unrelated controls', () => {
    for (const channel of ['update-scanner-bounds', 'capture-scanner-area', 'toggle-scanner-frame']) {
        assert.equal(isAllowedAuxiliaryChannel('scanner', channel), true);
    }
    assert.equal(isAllowedAuxiliaryChannel('scanner', 'submit-overlay-question'), false);
    assert.equal(isAllowedAuxiliaryChannel('scanner', 'quit-app'), false);
});

test('overlay has only its required window, question, and scanner controls', () => {
    for (const channel of ['show-app', 'hide-overlay', 'resize-overlay', 'set-ignore-mouse-events', 'get-overlay-state', 'submit-overlay-question', 'toggle-scanner-frame']) {
        assert.equal(isAllowedAuxiliaryChannel('overlay', channel), true);
    }
    assert.equal(isAllowedAuxiliaryChannel('overlay', 'capture-scanner-area'), false);
    assert.equal(isAllowedAuxiliaryChannel('overlay', 'quit-app'), false);
});
