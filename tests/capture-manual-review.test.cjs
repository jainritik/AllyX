const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const interviewSource = fs.readFileSync(path.join(projectRoot, 'src', 'app', 'interview', 'page.tsx'), 'utf8');
const overlaySource = fs.readFileSync(path.join(projectRoot, 'electron', 'overlay.html'), 'utf8');
const scannerSource = fs.readFileSync(path.join(projectRoot, 'src', 'app', 'scanner-frame', 'page.tsx'), 'utf8');

function captureProcessingSource() {
    const start = interviewSource.indexOf('const processCapturedImage = useCallback');
    const end = interviewSource.indexOf('processCapturedImageRef.current = processCapturedImage;', start);
    assert.ok(start >= 0 && end > start, 'screen-capture OCR handler must be present');
    return interviewSource.slice(start, end);
}

test('a successful screen capture preserves recognized text and immediately queues an answer', () => {
    const source = captureProcessingSource();
    const successStart = source.indexOf('setManualQuestion(text);');
    const successEnd = source.indexOf('} catch (err)', successStart);
    assert.ok(successStart >= 0 && successEnd > successStart, 'recognized text success path must be present');
    const successPath = source.slice(successStart, successEnd);

    assert.match(successPath, /setManualQuestion\(text\);/);
    assert.match(successPath, /sendCapturedText\?\.\(text\)/);
    assert.match(successPath, /pendingCapturedQuestionRef\.current\.push\(text\);/);
    assert.match(successPath, /Text captured\. Generating answer…/);
    assert.match(successPath, /processPendingCapturedAnswerRef\.current\(\);/);
    assert.match(successPath, /Finish interview setup before generating an answer\./);
});

test('screen capture reports live OCR progress and allows a full-display read enough time to finish', () => {
    const source = captureProcessingSource();
    assert.match(source, /Reading captured text… \$\{percent\}%/);
    assert.match(source, /Preparing the text reader…/);
    assert.match(source, /\), 45000,/);
    assert.match(source, /\), 60000,/);
});

test('the overlay shows captured text without prematurely claiming an answer is generating', () => {
    assert.match(overlaySource, /api\.onOverlayCapturedText\(text=>\{manual\.value=text;/);
    assert.match(overlaySource, /setStatus\('Text captured\.','progress'\)/);
    assert.match(overlaySource, /askButton\.onclick=ask/);
    assert.doesNotMatch(overlaySource, /Review it, then press Ask/);
});

test('the overlay explains a pending screen-capture setup instead of calling it a closed scanner', () => {
    assert.match(overlaySource, /const message=result\.error\|\|result\.message\|\|\(result\.active\?'Position the frame and press Capture\.'\:'Scanner closed\.'\);/);
    assert.match(overlaySource, /result\.setupState\?'progress':'success'/);
});

test('the scanner stays busy until macOS capture IPC completes', () => {
    assert.match(scannerSource, /finally \{\s*\/\/ A source lookup can legitimately take several seconds[\s\S]*?setIsScanning\(false\);\s*\}/);
    assert.doesNotMatch(scannerSource, /setTimeout\(\(\) => setIsScanning\(false\), 2000\)/);
});

test('the bundled local OCR worker, core, and English language data are available to the interview renderer', () => {
    const assets = [
        ['tesseract/worker.min.js', 100_000],
        ['tesseract-core/tesseract-core.wasm.js', 4_000_000],
        ['tessdata/eng.traineddata.gz', 1_000_000],
    ];
    for (const [relativePath, minimumBytes] of assets) {
        const assetPath = path.join(projectRoot, 'public', relativePath);
        assert.ok(fs.existsSync(assetPath), `${relativePath} must be packaged`);
        assert.ok(fs.statSync(assetPath).size >= minimumBytes, `${relativePath} must not be truncated`);
    }
});
