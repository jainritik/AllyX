const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/app/interview/page.tsx'), 'utf8');
const start = source.indexOf('recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {');
const end = source.indexOf('recognitionRef.current.onerror =', start);
const handler = source.slice(start, end).trim().replace('(event: SpeechRecognitionEvent)', '(event)');
function preview() {
    let caption = '';
    let overlay = '';
    const context = {
        recognitionRef: { current: {} },
        liveStreamRef: { current: null },
        window: { electronAPI: { sendTranscript: value => { overlay = value; } } },
        questionStateRef: { current: { current: () => 'Confirmed words.' } },
        liveCaptionRef: { current: '' },
        MAX_TRANSCRIPT_LENGTH: 10000,
        isTranscriptionArtifact: value => value === '[music]',
        setInterimTranscript: value => { caption = value; },
    };
    vm.runInNewContext(handler, context);
    return {
        emit: entries => context.recognitionRef.current.onresult({
            resultIndex: 0,
            results: entries.map(([text, isFinal]) => Object.assign([{ transcript: text }], { isFinal })),
        }),
        caption: () => caption,
        overlay: () => overlay,
        context,
    };
}
test('desktop previews combine final and interim speech without submitting it as a question', () => {
    const p = preview();
    p.emit([['Hello', true], ['there', false], ['everyone', false]]);
    assert.equal(p.caption(), 'Hello there everyone');
    assert.equal(p.overlay(), 'Confirmed words. Hello there everyone');
    assert.equal(p.context.liveCaptionRef.current, '');
});
test('finished preview remains visible through empty recognition updates', () => {
    const p = preview();
    p.emit([['A finished phrase', true]]);
    p.emit([]);
    assert.equal(p.caption(), 'A finished phrase');
});
test('filtered preview artifacts do not erase visible speech', () => {
    const p = preview();
    p.emit([['Real speech', false]]);
    p.emit([['[music]', true]]);
    assert.equal(p.caption(), 'Real speech');
});
