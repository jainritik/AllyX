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
    const displayStart = mainSource.indexOf('async function getScannerDisplayCapture');
    const recoveryStart = mainSource.indexOf('function nativeScreenCaptureFailure');
    assert.ok(areaStart >= 0 && displayStart > areaStart && recoveryStart > displayStart);
    const areaCapture = mainSource.slice(areaStart, displayStart);
    const displayCapture = mainSource.slice(displayStart, recoveryStart);

    assert.match(areaCapture, /const electronCapture = await getNativeDisplayCapture\(display\);/);
    assert.match(displayCapture, /const electronCapture = await getNativeDisplayCapture\(display\);/);
    assert.match(areaCapture, /captureMethod: 'electron'/);
    assert.match(displayCapture, /captureMethod: 'electron'/);
    assert.match(areaCapture, /await captureMacOSRegion\(\{/);
    assert.match(displayCapture, /captureMacOSMainDisplay\(\{ nativeImage \}\)/);
    assert.match(scannerSource, /CAPTURE SELECTED AREA/);
    assert.match(scannerSource, /Capture entire display instead/);
    assert.doesNotMatch(scannerSource, /useMacOSPicker/);
});
