const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const interviewSource = fs.readFileSync(path.join(projectRoot, 'src', 'app', 'interview', 'page.tsx'), 'utf8');
const overlaySource = fs.readFileSync(path.join(projectRoot, 'electron', 'overlay.html'), 'utf8');

function captureProcessingSource() {
    const start = interviewSource.indexOf('const processCapturedImage = useCallback');
    const end = interviewSource.indexOf('processCapturedImageRef.current = processCapturedImage;', start);
    assert.ok(start >= 0 && end > start, 'screen-capture OCR handler must be present');
    return interviewSource.slice(start, end);
}

test('screen capture keeps recognized text for review and does not spend an AI request automatically', () => {
    const source = captureProcessingSource();
    const successStart = source.indexOf('setManualQuestion(text);');
    const successEnd = source.indexOf('} catch (err)', successStart);
    assert.ok(successStart >= 0 && successEnd > successStart, 'recognized text success path must be present');
    const successPath = source.slice(successStart, successEnd);

    assert.match(successPath, /setManualQuestion\(text\);/);
    assert.match(successPath, /sendCapturedText\?\.\(text\)/);
    assert.match(successPath, /Text captured\. Review it, then press Ask\./);
    assert.doesNotMatch(successPath, /getAiAnswer\(/, 'capturing text must not automatically invoke AI');
});

test('screen capture reports live OCR progress and allows a full-display read enough time to finish', () => {
    const source = captureProcessingSource();
    assert.match(source, /Reading captured text… \$\{percent\}%/);
    assert.match(source, /Preparing the text reader…/);
    assert.match(source, /\), 45000,/);
    assert.match(source, /\), 60000,/);
});

test('the overlay exposes captured text in its editable Ask workflow', () => {
    assert.match(overlaySource, /api\.onOverlayCapturedText\(text=>\{manual\.value=text;/);
    assert.match(overlaySource, /Text captured\. Review it, then press Ask\./);
    assert.match(overlaySource, /askButton\.onclick=ask/);
    assert.doesNotMatch(overlaySource, /result\.success\)\{setStatus\('Generating answer…','progress'\);manual\.value=''/);
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
