const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldPreventWindowClose } = require('./window-lifecycle');

test('ordinary close hides the app while app quit permits native teardown', () => {
    assert.equal(shouldPreventWindowClose(false), true);
    assert.equal(shouldPreventWindowClose(true), false);
});
