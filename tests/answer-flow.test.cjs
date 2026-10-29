const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('src/app/interview/page.tsx', 'utf8');
function evaluate(code, context = {}) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
        { exports, console, TextDecoder, TextEncoder, AbortController, setTimeout, clearTimeout, ...context });
    return exports;
}
const { readAnswerStream } = evaluate(fs.readFileSync('src/lib/answer-stream.ts', 'utf8'));
const continuation = evaluate(fs.readFileSync('src/lib/answer-continuation.ts', 'utf8'));
const ref = current => ({ current });
function events(content, finish = 'stop') {
    return new Response(`data: ${JSON.stringify({ content })}\n\ndata: ${JSON.stringify({ finishReason: finish })}\n\n`);
}
function handler(fetch) {
    const state = { answer: '', pairs: [], statuses: [], truncated: false, renderCount: 0 };
    const context = {
        ...continuation, readAnswerStream, fetch, window: { electronAPI: { sendAnswer: value => state.answer = value, sendOverlayStatus: (...args) => state.statuses.push(args) } },
        accessReady: true, transcript: '', MAX_QUESTION_LENGTH: 12000, compactContext: (text, limit) => text.slice(0, limit),
        questionStateRef: ref({ current: () => '', consume() {} }), answerInFlightRef: ref(false), pendingCapturedQuestionRef: ref([]),
        activeAnswerSnapshotRef: ref(null), pendingQuestionRef: ref(''), retryQuestionRef: ref(''), answerAbortRef: ref(null), sessionIdRef: ref('session'),
        sessionEndingRef: ref(false), processPendingCapturedAnswerRef: ref(() => {}), aiResponse: '', allQAPairs: [],
        interviewContext: { jd: '', resume: '', type: 'Coding', lang: 'en-US', model: 'test-model' },
        setError: value => state.error = value, setLastTranscript() {}, setInterimTranscript() {}, setIsLoading() {},
        setAiResponse: value => { state.answer = value; state.renderCount++; }, setAnswerModel() {}, setAnswerTruncated: value => state.truncated = value,
        setAllQAPairs: update => state.pairs = update(state.pairs), setRetryQuestion() {},
    };
    const start = source.indexOf('const getAiAnswer = useCallback(') + 'const getAiAnswer = useCallback('.length;
    const end = source.indexOf('}, [accessReady, aiResponse', start) + 1;
    const { get } = evaluate(`exports.get = ${source.slice(start, end)};`, context);
    return { get, state, context };
}

test('SSE preserves split Unicode and a final event without a trailing newline', async () => {
    const bytes = new TextEncoder().encode('data: {"content":"héllo"}\r\n\r\ndata: {"finishReason":"stop"}');
    const response = new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } }));
    let output = '';
    assert.equal(await readAnswerStream(response, text => output += text), 'stop');
    assert.equal(output, 'héllo');
});

test('Ask streams all automatic continuation parts and saves exactly one complete Q&A pair', async () => {
    const bodies = [];
    const { get, state } = handler(async (_url, options) => {
        bodies.push(JSON.parse(options.body));
        return bodies.length === 1 ? events('Approach.\n```js\n', 'length') : events('return 42;\n```\nComplexity: O(1).');
    });
    await get('Solve the question');
    assert.equal(bodies.length, 2);
    assert.equal(bodies[1].messages[0].content, 'Solve the question');
    assert.equal(bodies[1].messages[1].content, 'Approach.\n```js\n');
    assert.equal(state.answer, 'Approach.\n```js\nreturn 42;\n```\nComplexity: O(1).');
    assert.equal(state.pairs.length, 1);
    assert.equal(state.pairs[0].answer, state.answer);
    assert.equal(state.truncated, false);
});

test('Ask recovers a broken stream without losing the already delivered answer', async () => {
    let calls = 0;
    const { get, state } = handler(async () => {
        if (++calls > 1) return events('second half.');
        let reads = 0;
        return new Response(new ReadableStream({ pull(controller) {
            if (++reads === 1) controller.enqueue(new TextEncoder().encode('data: {"content":"First half; "}\n\n'));
            else controller.error(new TypeError('connection reset'));
        } }));
    });
    await get('Explain');
    assert.equal(calls, 2);
    assert.equal(state.answer, 'First half; second half.');
    assert.equal(state.pairs.length, 1);
});

test('busy manual, capture and voice requests retain FIFO order instead of overwriting each other', async () => {
    const { get, context } = handler(async () => { throw Error('must not fetch while busy'); });
    context.answerInFlightRef.current = true;
    for (const question of ['pasted question', 'screen question', 'spoken question']) await get(question, false, false, true, true);
    assert.equal(context.pendingCapturedQuestionRef.current.join('|'), 'pasted question|screen question|spoken question');
});

test('oversized pasted questions are rejected visibly instead of submitting truncated requirements', async () => {
    let calls = 0;
    const { get, state } = handler(async () => { calls++; return events('answer'); });
    await get('x'.repeat(12001));
    assert.equal(calls, 0);
    assert.match(state.error, /no text has been submitted/);
});

test('audio queue waits for missing earlier chunks and then transcribes in order', async () => {
    const processed = [];
    const context = {
        transcriptionEpochRef: ref(1), isTranscriptionDrainActiveRef: ref(false),
        nextTranscriptionToProcessRef: ref(1), skippedTranscriptionSequencesRef: ref(new Set()),
        failedTranscriptionSequencesRef: ref(new Set()), activeTranscriptionTaskRef: ref(null),
        pendingTranscriptionsRef: ref([{ epoch: 1, sequence: 2 }]),
        processGroqAudio: async segment => { processed.push(segment.sequence); return 'speech'; }, commitTranscriptSegment() {},
    };
    const start = source.indexOf('const drainTranscriptions = async');
    const end = source.indexOf('    transcriptionDrainRef.current = drainTranscriptions;', start);
    const { drain } = evaluate(`${source.slice(start, end)}\nexports.drain = drainTranscriptions;`, context);
    await drain();
    assert.equal(processed.length, 0);
    assert.equal(context.isTranscriptionDrainActiveRef.current, false);
    context.pendingTranscriptionsRef.current.push({ epoch: 1, sequence: 1 });
    await drain();
    assert.deepEqual(processed, [1, 2]);
    assert.equal(context.pendingTranscriptionsRef.current.length, 0);
});

for (const { confidence, captureMode } of [{ confidence: 95, captureMode: "area" }, { confidence: 35, captureMode: "area" }, { confidence: 95, captureMode: "display" }]) {
    test(`captured image passes through OCR and queues an answer only when confidence is adequate (${confidence}, ${captureMode})`, async () => {
        let terminated = false;
        const { get, state, context } = handler(async () => events('Complete screen answer.'));
        let answerTask;
        context.contextReady = true;
        context.captureProcessingRef = ref(false);
        context.setIsScreenCapturing = () => {};
        context.showToast = () => {};
        context.setManualQuestion = value => state.manual = value;
        context.createWorker = async () => ({ setParameters: async () => {}, recognize: async () => ({ data: { text: 'Screen question', confidence } }), terminate: async () => { terminated = true; } });
        context.processPendingCapturedAnswerRef.current = () => { answerTask = get(context.pendingCapturedQuestionRef.current.shift()); };
        const start = source.indexOf('const processCapturedImage = useCallback(') + 'const processCapturedImage = useCallback('.length;
        const end = source.indexOf('}, [accessReady, contextReady, showToast]);', start) + 1;
        const { capture } = evaluate(`exports.capture = ${source.slice(start, end)};`, context);
        await capture('data:image/png;base64,mock-image', { captureMode });
        if (answerTask) await answerTask;
        assert.equal(state.manual, 'Screen question');
        assert.equal(terminated, true);
        assert.equal(context.captureProcessingRef.current, false);
        if (confidence === 95 && captureMode === "area") assert.equal(state.answer, 'Complete screen answer.');
        else {
            assert.equal(answerTask, undefined);
            assert.ok(state.statuses.some(([message]) => captureMode === 'display' ? message.includes('Remove unrelated desktop text') : message.includes('Review and correct')));
        }
    });
}

test('Stop & answer refuses to answer an incomplete audio transcript', async () => {
    let consumed = false;
    let message = '';
    const context = {
        vadTimerRef: ref(null), flushRecorderRef: ref(null), finalizePendingRolloverRef: ref(null), stopDesktopSTT() {},
        pendingTranscriptionsRef: ref([]), activeTranscriptionTaskRef: ref(null), isTranscriptionDrainActiveRef: ref(false),
        sessionEndingRef: ref(false), failedTranscriptionSequencesRef: ref(new Set([2])),
        questionStateRef: ref({ current: () => 'incomplete question', consume: () => { consumed = true; } }),
        setManualQuestion() {}, setError: value => message = value, window: { electronAPI: { sendOverlayStatus() {} } },
    };
    const start = source.indexOf('const flushAndStopDesktopSTT = useCallback(') + 'const flushAndStopDesktopSTT = useCallback('.length;
    const end = source.indexOf('}, [stopDesktopSTT]);', start) + 1;
    const { stop } = evaluate(`exports.stop = ${source.slice(start, end)};`, context);
    await stop(true);
    assert.equal(consumed, false);
    assert.match(message, /No answer was generated from the incomplete question/);
});

test('a burst of answer tokens is displayed in batches without dropping text', async () => {
    const payload = Array.from({ length: 1000 }, () => 'data: {"content":"x"}\n\n').join('') + 'data: {"finishReason":"stop"}\n\n';
    const { get, state } = handler(async () => new Response(payload));
    await get('Explain');
    assert.equal(state.answer, 'x'.repeat(1000));
    assert.ok(state.renderCount < 10, `expected batched UI updates, received ${state.renderCount}`);
});

test('transcription uploads overlap up to two requests without waiting for earlier slow clips', async () => {
    const { createTranscriptionPool } = evaluate(fs.readFileSync('src/lib/transcription-pool.ts', 'utf8'));
    const pool = createTranscriptionPool(2);
    const started = [], finish = [];
    const tasks = [0, 1, 2].map(id => pool.run(() => new Promise(resolve => { started.push(id); finish[id] = resolve; })));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(started, [0, 1]);
    finish[1]('second');
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(started, [0, 1, 2]);
    finish[2]('third'); finish[0]('first');
    assert.deepEqual(await Promise.all(tasks), ['first', 'second', 'third']);
});

test('prefetched transcription results are published in recording order even if later requests finish first', async () => {
    const processed = [];
    let finishFirst;
    const context = {
        transcriptionEpochRef: ref(1), isTranscriptionDrainActiveRef: ref(false),
        nextTranscriptionToProcessRef: ref(1), skippedTranscriptionSequencesRef: ref(new Set()),
        failedTranscriptionSequencesRef: ref(new Set()), activeTranscriptionTaskRef: ref(null),
        pendingTranscriptionsRef: ref([
            { epoch: 1, sequence: 1, transcription: new Promise(resolve => { finishFirst = resolve; }) },
            { epoch: 1, sequence: 2, transcription: Promise.resolve('second') },
        ]),
        processGroqAudio: async () => { throw Error('must reuse prefetched request'); },
        commitTranscriptSegment: (_segment, text) => processed.push(text),
    };
    const start = source.indexOf('const drainTranscriptions = async');
    const end = source.indexOf('    transcriptionDrainRef.current = drainTranscriptions;', start);
    const { drain } = evaluate(`${source.slice(start, end)}\nexports.drain = drainTranscriptions;`, context);
    const pending = drain();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(processed, []);
    finishFirst('first'); await pending;
    assert.deepEqual(processed, ['first', 'second']);
});

 test('a very long answer survives eight streamed parts and is saved without truncation', async () => {
    const parts = Array.from({ length: 8 }, (_, index) => `Part ${index}: ` + 'Detailed explanation. '.repeat(1500));
    let calls = 0;
    const { get, state } = handler(async () => {
        const part = parts[calls++];
        return events(part, calls === parts.length ? 'stop' : 'length');
    });
    await get('Give a detailed answer');
    assert.equal(calls, 8);
    assert.equal(state.answer, parts.join(''));
    assert.equal(state.pairs[0].answer, parts.join(''));
    assert.equal(state.truncated, false);
});
