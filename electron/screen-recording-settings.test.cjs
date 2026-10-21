const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainSource = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const preloadSource = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf8');
const interviewSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'interview', 'page.tsx'), 'utf8');
const scannerSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'scanner-frame', 'page.tsx'), 'utf8');

test('screen-capture recovery opens the macOS Screen Recording settings pane through a trusted IPC handler', () => {
    assert.match(mainSource, /handleTrusted\('open-screen-recording-settings'/);
    assert.match(mainSource, /x-apple\.systempreferences:com\.apple\.preference\.security\?Privacy_ScreenCapture/);
    assert.match(preloadSource, /openScreenRecordingSettings:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('open-screen-recording-settings'\)/);
});

test('desktop setup reads permissions once and requests microphone access only from the customer action', () => {
    assert.match(mainSource, /handleTrusted\('get-desktop-permissions'/);
    assert.match(mainSource, /handleTrusted\('request-microphone-access'/);
    assert.match(mainSource, /systemPreferences\.askForMediaAccess\('microphone'\)/);
    assert.match(preloadSource, /getDesktopPermissions:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('get-desktop-permissions'\)/);
    assert.match(preloadSource, /requestMicrophoneAccess:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('request-microphone-access'\)/);
    assert.match(interviewSource, /One-time desktop setup/);
    assert.match(interviewSource, /Future updates keep the same permission identity/);
});

test('a stale macOS permission status does not block a real desktop capture attempt', () => {
    assert.doesNotMatch(mainSource, /shouldAttemptScreenCapturePermission/);
    assert.match(mainSource, /actual capture first; its returned pixels are the only useful signal/);
    assert.match(mainSource, /async function getNativeDisplayCapture\(display\)/);
    assert.match(mainSource, /return getUsableScreenSource\(\{/);
});

test('native capture failure keeps its recovery actions and waits for renderer delivery', () => {
    assert.match(mainSource, /screenCaptureFailure\(\{/);
    assert.match(mainSource, /getScreenCapturePermissionStatus\(\)/);
    assert.match(mainSource, /const rendererAccepted = await deliverScannerCapture\(imageData\)/);
    assert.match(mainSource, /acknowledge-scanner-capture/);
    assert.match(mainSource, /constrainNativeCaptureImage\(capture\.source\.thumbnail\.crop\(crop\)\)\.toDataURL\(\)/);
    assert.match(mainSource, /handleTrusted\('capture-scanner-display'/);
    assert.match(mainSource, /screen\.getDisplayNearestPoint\(/);
    assert.match(mainSource, /constrainNativeCaptureImage\(capture\.source\.thumbnail\)\.toDataURL\(\)/);
    assert.match(preloadSource, /acknowledgeScannerCapture:\s*\(captureId\)\s*=>\s*ipcRenderer\.invoke\('acknowledge-scanner-capture', captureId\)/);
    assert.match(preloadSource, /deliverPickerCapture:\s*\(imageData\)\s*=>\s*ipcRenderer\.invoke\('deliver-picker-capture', imageData\)/);
    assert.match(preloadSource, /captureScannerDisplay:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('capture-scanner-display'\)/);
});

test('native capture and scanner movement stay in Electron native coordinates', () => {
    assert.match(mainSource, /const selectionBounds = scannerFrameWindow\.getBounds\(\)/);
    assert.match(mainSource, /screen\.getDisplayMatching\(selectionBounds\)/);
    assert.match(mainSource, /different coordinate scale[\s\S]*same DIP space/);
    assert.match(mainSource, /resizable:\s*true/);
    assert.doesNotMatch(mainSource, /update-scanner-bounds/);
    assert.match(preloadSource, /captureScannerArea:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('capture-scanner-area'\)/);
    assert.doesNotMatch(preloadSource, /updateScannerBounds/);
    assert.match(scannerSource, /captureScannerArea\(\)/);
    assert.match(scannerSource, /captureScannerDisplay\(\)/);
    assert.match(scannerSource, /-webkit-app-region:drag/);
    assert.doesNotMatch(scannerSource, /updateScannerBounds|window\.screenX|window\.screenY/);
});

test('the OCR receiver stays subscribed while the interview renderer re-renders', () => {
    assert.match(interviewSource, /const processCapturedImageRef = useRef/);
    assert.match(interviewSource, /processCapturedImageRef\.current = processCapturedImage/);
    assert.match(interviewSource, /await processCapturedImageRef\.current\(data\.imageData, \{ reserved: true \}\)/);
    assert.match(interviewSource, /if \(!supportsCoordinatedScannerCapture\(api\)\) \{\s*await processCapturedImageRef\.current\(data\.imageData\);/s);
    const reserveIndex = interviewSource.indexOf('const processing = await api.setScannerProcessing(true);');
    const acknowledgeIndex = interviewSource.indexOf('await api.acknowledgeScannerCapture(data.id);');
    assert.ok(reserveIndex >= 0 && acknowledgeIndex > reserveIndex, 'native processing is reserved before the capture ACK');
});

test('native source lookup is bounded and keeps scanner capture on its selected display', () => {
    assert.match(mainSource, /getScreenSourcesWithRetry/);
    assert.match(mainSource, /displayCount:\s*screen\.getAllDisplays\(\)\.length/);
    assert.match(mainSource, /const readSystemAudioSources = \(\) => getScreenSourcesWithRetry/);
    assert.match(mainSource, /const sourceResult = await readSystemAudioSources\(\)/);
    assert.match(mainSource, /sources\.length > 1\r?\n\s*\? 'Choose the display that contains your meeting/);
});

test('the macOS picker recovery never silently chooses a screen source', () => {
    assert.match(mainSource, /setDisplayMediaRequestHandler/);
    assert.match(mainSource, /useSystemPicker: true/);
    assert.match(mainSource, /callback\(null\)/);
    assert.match(mainSource, /validatePickerCaptureImage\(imageData\)/);
});
