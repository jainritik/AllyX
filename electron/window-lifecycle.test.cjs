const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldPreventWindowClose, shouldShowInterviewOverlay } = require('./window-lifecycle');

test('ordinary close hides the app while app quit permits native teardown', () => {
    assert.equal(shouldPreventWindowClose(false), true);
    assert.equal(shouldPreventWindowClose(true), false);
});

test('answer overlay only appears for a ready interview outside presentation safe mode', () => {
    assert.equal(shouldShowInterviewOverlay({ rendererReady: true, isInterviewPage: true, presentationSafeMode: false }), true);
    assert.equal(shouldShowInterviewOverlay({ rendererReady: false, isInterviewPage: true, presentationSafeMode: false }), false);
    assert.equal(shouldShowInterviewOverlay({ rendererReady: true, isInterviewPage: false, presentationSafeMode: false }), false);
    assert.equal(shouldShowInterviewOverlay({ rendererReady: true, isInterviewPage: true, presentationSafeMode: true }), false);
});
