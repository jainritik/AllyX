const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { bindOverlayShortcuts, bindings } = require('./overlay-shortcuts');

test('shortcuts work without focus, report conflicts, and release keys when the overlay hides', () => {
    const window = new EventEmitter(), active = new Map(), messages = [];
    let visible = true;
    window.isDestroyed = () => false;
    window.isVisible = () => visible;
    window.webContents = { send: (...args) => messages.push(args) };
    const conflict = bindings[0][0];
    bindOverlayShortcuts(window, {
        register: (key, callback) => { if (key === conflict) return false; active.set(key, callback); return true; },
        unregister: key => active.delete(key),
    });
    window.emit('show');
    assert.equal(active.size, 4);
    assert.deepEqual(messages[0], ['overlay-shortcut-status', [conflict]]);
    active.get(bindings[1][0])();
    assert.deepEqual(messages.at(-1), ['overlay-keyboard-action', 'down']);
    visible = false; window.emit('hide'); assert.equal(active.size, 0);
    visible = true; window.emit('show'); assert.equal(active.size, 4);
    window.emit('closed'); assert.equal(active.size, 0);
});

test('overlay keyboard actions scroll the answer without moving the pointer', () => {
    const fs = require('node:fs'), vm = require('node:vm');
    const source = fs.readFileSync('electron/overlay.html', 'utf8');
    const start = source.indexOf('    api.onOverlayKeyboardAction(');
    const end = source.indexOf('    api.onOverlayShortcutStatus', start);
    let handler, toggles = 0;
    const answer = { scrollTop: 200, clientHeight: 100, scrollHeight: 1000 };
    vm.runInNewContext(source.slice(start, end), { api: { onOverlayKeyboardAction: fn => { handler = fn; } }, answer, toggleCursor: () => toggles++ });
    handler('up'); assert.equal(answer.scrollTop, 120);
    handler('down'); assert.equal(answer.scrollTop, 200);
    handler('top'); assert.equal(answer.scrollTop, 0);
    handler('bottom'); assert.equal(answer.scrollTop, 1000);
    handler('toggle-cursor'); assert.equal(toggles, 1);
    assert.doesNotMatch(source, /cursor:\s*(wait|progress)/);
    assert.match(source, /body\.cursor-hidden \*\{cursor:none !important\}/);
    assert.match(source, /answer.scrollTop=previousScroll/);
});

test('overlay starts with a visible cursor and Escape restores it after hiding', () => {
    const fs = require('node:fs'), vm = require('node:vm');
    const source = fs.readFileSync('electron/overlay.html', 'utf8');
    assert.match(source, /<body>/);
    assert.match(source, /aria-label="Hide local cursor" aria-pressed="false"/);
    const classes = new Set(), attributes = {};
    let keydown, releases = 0;
    const button = { setAttribute: (key, value) => { attributes[key] = value; } };
    const context = {
        document: {
            querySelector: () => button,
            body: { classList: {
                contains: name => classes.has(name),
                toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
            } },
            addEventListener: (name, handler) => { if (name === 'keydown') keydown = handler; },
        },
        pointerLock: { release: () => releases++ },
    };
    vm.runInNewContext(source.slice(source.indexOf('    const cursorButton='), source.indexOf('    api.onOverlayKeyboardAction(')), context);
    button.onclick();
    assert.equal(classes.has('cursor-hidden'), true);
    assert.equal(attributes['aria-label'], 'Show local cursor');
    keydown({ key: 'Escape' });
    assert.equal(classes.has('cursor-hidden'), false);
    assert.equal(attributes['aria-label'], 'Hide local cursor');
    assert.equal(attributes['aria-pressed'], 'false');
    assert.equal(releases, 1);
});
