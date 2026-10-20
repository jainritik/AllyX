const test = require('node:test');
const assert = require('node:assert/strict');
const { appendNovelTranscript, createLiveQuestionState } = require('../src/lib/live-question-state.js');

test('keeps a rolling transcript in order without duplicating a segment overlap', () => {
    let caption = appendNovelTranscript('', 'Can you explain how you designed');
    caption = appendNovelTranscript(caption, 'designed the retry mechanism?');

    assert.equal(caption, 'Can you explain how you designed the retry mechanism?');
});

test('keeps the displayed question available after taking an answer snapshot', () => {
    const question = createLiveQuestionState();
    question.append('How do you handle an incident');
    question.append('incident when a service is down?');

    const prompt = question.consume();
    assert.equal(prompt, 'How do you handle an incident when a service is down?');
    assert.equal(question.current(), '');
    assert.equal(prompt, 'How do you handle an incident when a service is down?');
});
