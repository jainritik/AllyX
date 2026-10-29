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
    assert.match(interviewSource, /Use the copy of AllyX in Applications when granting permission\. macOS can require a new approval after an unsigned update\./);
    assert.doesNotMatch(interviewSource, /Future updates keep the same permission identity/);
});

test('an explicit Capture action completes macOS consent setup before opening the scanner', () => {
    assert.match(mainSource, /const \{ resolveScreenCaptureSetup \} = require\('\.\/screen-capture-setup'\)/);
    assert.match(mainSource, /const \{ effectiveScreenCapturePermissionStatus \} = require\('\.\/screen-capture-permission'\)/);
    assert.match(mainSource, /const beforeProbe = getScreenCaptureSetup\(\{ probeOnGranted: true \}\);/);
    assert.match(mainSource, /const sourceAvailable = Boolean\(capture\?\.source && capture\?\.size\);/);
    assert.match(mainSource, /displayId: display\.id,/);
    assert.match(mainSource, /if \(setup\.state !== 'ready'\) \{[\s\S]*?setupState: setup\.state,/);

    const toggleStart = mainSource.indexOf("handleTrusted('toggle-scanner-frame'");
    const scannerOpen = mainSource.indexOf('return await createScannerFrame();', toggleStart);
    const setupProbe = mainSource.indexOf('const setup = await prepareScreenCaptureSetup();', toggleStart);
    assert.ok(toggleStart >= 0 && setupProbe > toggleStart && scannerOpen > setupProbe, 'setup probe must finish before scanner UI is created');

    assert.match(interviewSource, /const toggleScreenCapture = useCallback[\s\S]*?if \(result\.setupState\) \{[\s\S]*?setScreenCaptureSetupState\(result\.setupState\);[\s\S]*?setError\(null\);/);
    assert.match(interviewSource, /if \(window\.electronAPI\) \{\s*void toggleScreenCapture\(\);/);
    assert.match(interviewSource, /if \(isMacDesktop && !screenCaptureReady\) \{[\s\S]*?return \[\] as Array<\{ id: string; name: string \}>;/);
});

test('scanner startup preserves its real load failure instead of replacing it with a closed-window message', () => {
    const scannerStart = mainSource.indexOf('function createScannerFrame()');
    const scannerEnd = mainSource.indexOf('function broadcastScannerState', scannerStart);
    assert.ok(scannerStart >= 0 && scannerEnd > scannerStart, 'scanner startup must be present');
    const scannerSource = mainSource.slice(scannerStart, scannerEnd);

    const failStart = scannerSource.indexOf('const fail = (error) => {');
    const failEnd = scannerSource.indexOf('};', failStart) + 2;
    const failSource = scannerSource.slice(failStart, failEnd);
    assert.ok(failStart >= 0 && failEnd > failStart, 'scanner failure handler must be present');
    assert.ok(failSource.indexOf('settle({ active: false, error });') < failSource.indexOf('closeScannerFrame()'), 'failure must settle before closing the scanner window');
    assert.match(scannerSource, /if \(!settled\) \{\s*settle\(\{ active: false, error: 'Screen Capture was closed before it finished opening\.'/);
});

test('scanner startup rejects an authentication redirect instead of presenting it as a capture window', () => {
    const scannerStart = mainSource.indexOf('function createScannerFrame()');
    const scannerEnd = mainSource.indexOf('function broadcastScannerState', scannerStart);
    const scannerSource = mainSource.slice(scannerStart, scannerEnd);
    assert.match(scannerSource, /new URL\(frame\.webContents\.getURL\(\)\)\.pathname !== '\/scanner-frame'/);
    assert.match(scannerSource, /Your interview session changed before Screen Capture opened/);
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
    assert.match(mainSource, /const image = capture\.isExactRegion[\s\S]*?capture\.source\.thumbnail[\s\S]*?: capture\.source\.thumbnail\.crop\(calculateCaptureCrop\(display\.bounds, capture\.size, selectionBounds\)\);/);
    assert.match(mainSource, /const imageData = constrainNativeCaptureImage\(image\)\.toDataURL\(\)/);
    assert.match(mainSource, /handleTrusted\('capture-scanner-display'/);
    assert.match(mainSource, /screen\.getDisplayNearestPoint\(/);
    assert.match(mainSource, /constrainNativeCaptureImage\(capture\.source\.thumbnail\)\.toDataURL\(\)/);
    assert.match(mainSource, /captureMacOSMainDisplay\(\{ nativeImage \}\)/);
    assert.match(mainSource, /const electronCapture = await getNativeDisplayCapture\(display\);[\s\S]*?if \(electronCapture\.source && electronCapture\.size\)\s*\{[\s\S]*?captureMethod: 'electron'/);
    assert.match(mainSource, /if \(display\.id === primaryDisplay\.id\)[\s\S]*?captureMacOSMainDisplay\(\{ nativeImage \}\)/);
    assert.match(preloadSource, /acknowledgeScannerCapture:\s*\(captureId\)\s*=>\s*ipcRenderer\.invoke\('acknowledge-scanner-capture', captureId\)/);
    assert.doesNotMatch(preloadSource, /deliverPickerCapture/);
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
    assert.match(interviewSource, /await processCapturedImageRef\.current\(data\.imageData, \{ reserved: true, captureMode: data\.captureMode \}\)/);
    assert.match(interviewSource, /if \(!supportsCoordinatedScannerCapture\(api\)\) \{\s*await processCapturedImageRef\.current\(data\.imageData, \{ captureMode: data\.captureMode \}\);/s);
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

test('the macOS scanner does not fall back to Chromium’s unstable display-media picker', () => {
    assert.doesNotMatch(mainSource, /setDisplayMediaRequestHandler/);
    assert.doesNotMatch(mainSource, /validatePickerCaptureImage/);
    assert.doesNotMatch(scannerSource, /navigator\.mediaDevices\?\.getDisplayMedia/);
});
