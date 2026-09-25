// Run with: electron electron/privacy-smoke.cjs
// Verifies real Electron APIs; does not establish receiver-side exclusion.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const os = require('node:os');
const { createCapturePrivacy } = require('./capture-privacy');
app.whenReady().then(async () => {
    const controller = createCapturePrivacy({ platform: process.platform, release: os.release(), getWindows: () => BrowserWindow.getAllWindows() });
    app.on('browser-window-created', (_, window) => controller.apply(window));
    const window = new BrowserWindow({ show: false, width: 440, height: 220 });
    await window.loadURL('data:text/html,<h1>AllyX privacy API test</h1>');
    assert.equal(window.isContentProtected(), true);
    window.show();
    assert.equal(window.isVisible(), true);
    controller.setRequested(false);
    assert.equal(window.isContentProtected(), false);
    assert.equal(window.isVisible(), true);
    controller.setRequested(true);
    assert.equal(window.isContentProtected(), true);
    assert.equal(window.isVisible(), true);
    console.log('PASS: real Electron protection toggle; window stays visible. Receiver exclusion UNVERIFIED.');
    app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
