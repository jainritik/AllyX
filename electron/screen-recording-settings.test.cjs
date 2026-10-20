const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainSource = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const preloadSource = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf8');
const interviewSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'interview', 'page.tsx'), 'utf8');

test('screen-capture recovery opens the macOS Screen Recording settings pane through a trusted IPC handler', () => {
    assert.match(mainSource, /handleTrusted\('open-screen-recording-settings'/);
    assert.match(mainSource, /x-apple\.systempreferences:com\.apple\.preference\.security\?Privacy_ScreenCapture/);
    assert.match(preloadSource, /openScreenRecordingSettings:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('open-screen-recording-settings'\)/);
});

test('a stale macOS permission status does not block a real desktop capture attempt', () => {
    assert.doesNotMatch(mainSource, /shouldAttemptScreenCapturePermission/);
    assert.match(mainSource, /actual capture first; its returned pixels are the only useful signal/);
    assert.match(mainSource, /const capture = await getUsableScreenSource/);
});

test('native capture failure keeps its recovery actions and waits for renderer delivery', () => {
    assert.match(mainSource, /screenCaptureFailure\(\{/);
    assert.match(mainSource, /getScreenCapturePermissionStatus\(\)/);
    assert.match(mainSource, /const rendererAccepted = await deliverScannerCapture\(imageData\)/);
    assert.match(mainSource, /acknowledge-scanner-capture/);
    assert.match(preloadSource, /acknowledgeScannerCapture:\s*\(captureId\)\s*=>\s*ipcRenderer\.invoke\('acknowledge-scanner-capture', captureId\)/);
});

test('the OCR receiver stays subscribed while the interview renderer re-renders', () => {
    assert.match(interviewSource, /const processCapturedImageRef = useRef/);
    assert.match(interviewSource, /processCapturedImageRef\.current = processCapturedImage/);
    assert.match(interviewSource, /await processCapturedImageRef\.current\(data\.imageData\)/);
});
