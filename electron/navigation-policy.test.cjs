const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { allowAppNavigation } = require('./navigation-policy');

test('same-origin navigation works while foreign navigation and redirects are cancelled', () => {
    const webContents = new EventEmitter();
    webContents.setWindowOpenHandler = handler => { webContents.openHandler = handler; };
    const opened = [];
    allowAppNavigation({ webContents }, 'https://allyx.example', url => opened.push(url));
    for (const channel of ['will-frame-navigate', 'will-redirect']) {
        let cancelled = false;
        webContents.emit(channel, { url: 'https://allyx.example/dashboard', preventDefault: () => { cancelled = true; } });
        assert.equal(cancelled, false);
        webContents.emit(channel, { url: 'https://attacker.example/', preventDefault: () => { cancelled = true; } });
        assert.equal(cancelled, true);
    }
    assert.deepEqual(webContents.openHandler({ url: 'file:///tmp/unsafe' }), { action: 'deny' });
    assert.deepEqual(opened, []);
    webContents.openHandler({ url: 'https://docs.example/' });
    assert.deepEqual(opened, ['https://docs.example/']);
});

test('explicit OAuth origins can navigate in the main authentication window', () => {
    const webContents = new EventEmitter();
    webContents.setWindowOpenHandler = handler => { webContents.openHandler = handler; };
    allowAppNavigation({ webContents }, 'https://allyx.example', () => {}, [
        'https://accounts.google.com',
        'https://project.supabase.co',
    ]);
    for (const url of ['https://accounts.google.com/o/oauth2/v2/auth', 'https://project.supabase.co/auth/v1/authorize']) {
        let cancelled = false;
        webContents.emit('will-redirect', { url, preventDefault: () => { cancelled = true; } });
        assert.equal(cancelled, false);
    }
});
