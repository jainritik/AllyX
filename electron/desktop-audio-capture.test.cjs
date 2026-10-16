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

test('continuous desktop speech is segmented promptly, resumes the audio graph, and reveals missing signal state', () => {
    assert.match(interviewSource, /await audioContext\.resume\(\)/);
    assert.match(interviewSource, /const MAX_RECORDING_TIME = 4500/);
    assert.match(interviewSource, /getByteTimeDomainData/);
    assert.match(interviewSource, /No audible signal detected yet\./);
    assert.match(interviewSource, /To transcribe the interviewer, select their display above and start interviewer audio\./);
});

test('a one-display desktop starts meeting audio with listening while multiple displays remain explicit', () => {
    assert.match(interviewSource, /availableSources\.length === 1 \? availableSources\[0\]\.id : ""/);
    assert.match(interviewSource, /if \(sourceId && !isScreenAudioActive\) void startMeetingAudio\(sourceId\)/);
});


test('desktop live captions are provisional and are replaced by the mixed-audio Whisper transcript', () => {
    assert.match(interviewSource, /const liveCaptionRef = useRef\(""\)/);
    assert.match(interviewSource, /Start an immediate on-screen caption preview/);
    assert.match(interviewSource, /liveCaptionRef\.current = "";/);
    assert.match(interviewSource, /Whisper remains the accurate mixed-audio source/);
});
