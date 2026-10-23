const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
const scannerSource = fs.readFileSync(path.join(root, 'src', 'app', 'scanner-frame', 'page.tsx'), 'utf8');

test('macOS scanner recovery stays on the native screenshot route after a failed capture', () => {
    const recoveryStart = scannerSource.indexOf('{captureFailed && (');
    const recoveryEnd = scannerSource.indexOf('{!captureFailed &&', recoveryStart);
    assert.ok(recoveryStart >= 0 && recoveryEnd > recoveryStart, 'scanner recovery controls must be present');
    const recoveryControls = scannerSource.slice(recoveryStart, recoveryEnd);

    assert.match(mainSource, /Do not send customers back to Chromium's getDisplayMedia picker here\./);
    assert.doesNotMatch(mainSource, /result\.pickerFallbackAvailable = true/);
    assert.doesNotMatch(scannerSource, /getDisplayMedia/);
    assert.match(recoveryControls, /restartRequired/);
    assert.doesNotMatch(recoveryControls, /captureFailed && !settingsRequired && !restartRequired/);
});

test('macOS uses the native screenshot utility for normal full-screen and area scans', () => {
    assert.match(mainSource, /await captureMacOSRegion\(\{/);
    assert.match(mainSource, /region: display\.bounds,/);
    assert.match(scannerSource, /CAPTURE THIS DISPLAY/);
    assert.match(scannerSource, /Capture selected area instead/);
    assert.doesNotMatch(scannerSource, /useMacOSPicker/);
});
