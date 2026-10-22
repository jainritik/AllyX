const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const mainSource = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const builderConfig = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
const interviewSource = fs.readFileSync(path.join(root, 'src/app/interview/page.tsx'), 'utf8');

test('macOS desktop audio stays on the Screen & System Audio permission path described in the app', () => {
    assert.match(mainSource, /appendSwitch\('disable-features', 'MacCatapLoopbackAudioForScreenShare'\)/);
    assert.match(builderConfig, /NSAudioCaptureUsageDescription:/);
});

test('continuous desktop speech uses an ordered, rate-safe caption pipeline', () => {
    assert.match(interviewSource, /await audioContext\.resume\(\)/);
    assert.match(interviewSource, /const MAX_RECORDING_TIME = 4000/);
    assert.match(interviewSource, /const MIN_SEGMENT_DURATION = 2500/);
    assert.match(interviewSource, /getByteTimeDomainData/);
    assert.match(interviewSource, /No audible signal detected yet\./);
    assert.match(interviewSource, /const drainTranscriptions = async/);
    assert.doesNotMatch(interviewSource, /MAX_PARALLEL_TRANSCRIPTIONS/);
    assert.match(interviewSource, /To transcribe the interviewer, select their display above and start interviewer audio\./);
});

test('a one-display desktop starts meeting audio with listening while multiple displays remain explicit', () => {
    assert.match(interviewSource, /availableSources\.length === 1 \? availableSources\[0\]\.id : ""/);
    assert.match(interviewSource, /if \(sourceId && !isScreenAudioActive && screenPermissionReady\) void startMeetingAudio\(sourceId\)/);
    assert.match(interviewSource, /const availableSources = meetingAudioSources;/);
    assert.match(interviewSource, /void loadMeetingAudioSources\(false\)\.then\(sources =>/);
});


test('desktop live captions preserve the confirmed question while an answer is generated', () => {
    assert.match(interviewSource, /const liveCaptionRef = useRef\(""\)/);
    assert.match(interviewSource, /recognitionRef\.current && !previewUnavailableRef\.current/);
    assert.match(interviewSource, /liveCaptionRef\.current = "";/);
    assert.match(interviewSource, /questionStateRef\.current\.append\(text\)/);
    assert.match(interviewSource, /sendTranscript\?\.\(currentQuestion/);
});

test('desktop microphone capture starts before optional display discovery and access is ready', () => {
    const microphoneStart = interviewSource.indexOf('const started = await startDesktopSTT();');
    const displayDiscovery = interviewSource.indexOf('void loadMeetingAudioSources(false).then(sources =>');
    assert.ok(microphoneStart >= 0 && displayDiscovery > microphoneStart);
    assert.match(interviewSource, /if \(isElectron && !accessReady\) \{/);
});

test('a natural VAD pause or an explicit Stop listening can finalise an answer', () => {
    assert.match(interviewSource, /stopAndQueue\(false\)/);
    assert.match(interviewSource, /stopAndQueue\(true\)/);
    assert.match(interviewSource, /segment\.finalizesQuestion/);
    assert.match(interviewSource, /await flush\(\{ finalizesQuestion: generateAnswer \}\)/);
    assert.match(interviewSource, /await flushAndStopDesktopSTT\(true\)/);
    assert.match(interviewSource, /pendingCapturedQuestionRef\.current = question;/);
    assert.doesNotMatch(interviewSource, /isElectron \? 550 : 1600/);
});


test('stopping invalidates stale work without dropping an intentional final flush', () => {
    assert.match(interviewSource, /const stopDesktopSTT = useCallback\(\(discardPendingTranscription = true\)/);
    assert.match(interviewSource, /if \(discardPendingTranscription\) invalidateTranscriptionPipeline\(\)/);
    assert.match(interviewSource, /stopDesktopSTT\(false\)/);
    assert.doesNotMatch(interviewSource, /mediaRecorderRef\.current\.onstop = null/);
});
