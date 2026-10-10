const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainSource = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const preloadSource = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf8');

test('screen-capture recovery opens the macOS Screen Recording settings pane through a trusted IPC handler', () => {
    assert.match(mainSource, /handleTrusted\('open-screen-recording-settings'/);
    assert.match(mainSource, /x-apple\.systempreferences:com\.apple\.preference\.security\?Privacy_ScreenCapture/);
    assert.match(preloadSource, /openScreenRecordingSettings:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('open-screen-recording-settings'\)/);
});
