const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const mainSource = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const builderConfig = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
const interviewSource = fs.readFileSync(path.join(root, 'src/app/interview/page.tsx'), 'utf8');

test('macOS desktop audio uses the established Screen & System Audio capture path', () => {
    assert.match(mainSource, /appendSwitch\('disable-features', 'MacCatapLoopbackAudioForScreenShare'\)/);
    assert.match(builderConfig, /NSAudioCaptureUsageDescription:/);
});

test('continuous desktop speech is segmented promptly and reveals missing signal state', () => {
    assert.match(interviewSource, /const MAX_RECORDING_TIME = 8000/);
    assert.match(interviewSource, /getByteTimeDomainData/);
    assert.match(interviewSource, /No audible signal detected yet\./);
    assert.match(interviewSource, /To transcribe the interviewer, select their display above and start interviewer audio\./);
});
