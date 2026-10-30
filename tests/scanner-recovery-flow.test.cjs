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

test('macOS captures through AllyX first, with the native screenshot utility as recovery', () => {
    const areaStart = mainSource.indexOf('async function getScannerAreaCapture');

    const recoveryStart = mainSource.indexOf('function nativeScreenCaptureFailure');
    assert.ok(areaStart >= 0 && recoveryStart > areaStart);
    const areaCapture = mainSource.slice(areaStart, recoveryStart);

    assert.match(areaCapture, /const electronCapture = await getNativeDisplayCapture\(display\);/);
    assert.match(areaCapture, /captureMethod: 'electron'/);
    assert.match(areaCapture, /await captureMacOSRegion\(\{/);
    assert.match(scannerSource, /CAPTURE SELECTED AREA/);
    assert.match(scannerSource, /Capture webpage content/);
    assert.doesNotMatch(scannerSource, /captureScannerDisplay\(/);
    assert.match(mainSource, /cropPage\(preview.image, top\)/);
});
