const test = require('node:test');
const assert = require('node:assert/strict');
const { setupPointerLock } = require('./overlay-pointer-lock');
function fixture() {
    const target = () => ({ events: {}, addEventListener(name, fn) { this.events[name] = fn; } });
    const document = target(), window = target(), button = target(), status = {};
    const answer = { scrollTop: 0, scrollLeft: 0, clientHeight: 100, requestPointerLock: async () => {} };
    button.setAttribute = () => {};
    document.exitPointerLock = () => { document.pointerLockElement = null; document.events.pointerlockchange(); };
    const controller = setupPointerLock({ document, window, button, status, answer });
    const grant = () => { document.pointerLockElement = answer; document.events.pointerlockchange(); };
    return { document, window, button, status, answer, controller, grant };
}
test('explicit lock scrolls by wheel and Escape restores the pointer', async () => {
    const f = fixture();
    await f.button.events.click(); f.grant();
    assert.equal(f.button.textContent, 'Unlock pointer');
    let prevented = false;
    f.document.events.wheel({ deltaMode: 1, deltaY: 3, deltaX: 0, preventDefault() { prevented = true; } });
    assert.equal(f.answer.scrollTop, 60); assert.equal(prevented, true);
    f.document.events.keydown({ key: 'Escape' });
    assert.equal(f.document.pointerLockElement, null);
});
test('blur releases an active or late-granted pointer lock', async () => {
    for (const late of [false, true]) {
        const f = fixture(); await f.button.events.click();
        if (!late) f.grant();
        f.window.events.blur();
        if (late) f.grant();
        assert.equal(f.document.pointerLockElement, null);
    }
});
test('denial restores controls and reports the failure', async () => {
    const f = fixture(); f.answer.requestPointerLock = async () => { throw Error('denied'); };
    await f.button.events.click();
    assert.equal(f.button.disabled, false); assert.match(f.status.textContent, /unavailable/);
});
