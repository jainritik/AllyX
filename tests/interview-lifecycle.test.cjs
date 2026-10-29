const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function evaluate(source, context = {}) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
        { exports, console, setTimeout, clearTimeout, ...context });
    return exports;
}
const recovery = evaluate(fs.readFileSync('src/lib/interview-recovery.ts', 'utf8'));
const ref = current => ({ current });

test('End Interview saves streamed content before cancellation and preserves earlier answers', async () => {
    for (const continuation of [false, true]) {
        const previous = [{ question: 'original', answer: 'first part' }];
        let saved, route, failStop = false, saveError;
        const context = {
            ...recovery, isSavingRef: ref(false), sessionEndingRef: ref(false),
            activeAnswerSnapshotRef: ref({ question: 'next', answer: 'visible partial answer', continuation }),
            allQAPairs: previous, setAllQAPairs() {},
            answerAbortRef: ref({ abort() { context.activeAnswerSnapshotRef.current = null; } }),
            setIsSaving() {}, setError(value) { saveError = value; }, isAiSpeakingRef: ref(false), setIsRecording() {}, setIsCameraOn() {}, setIsCameraVisible() {},
            recognitionRef: ref(null), isRecognitionActiveRef: ref(false), flushAndStopDesktopSTT: async () => { if (failStop) throw Error("recorder failed"); }, stopScreenAudio() {},
            window: {}, pendingQuestionRef: ref('next'), fullTranscriptRef: ref(''), interimTranscript: '',
            interviewContext: { type: 'Technical', jd: '', lang: 'en-US', model: 'model' }, interviewStartTime: new Date(),
            historySavedRef: ref(false), interviewService: { saveInterview: async (...args) => { saved = args; } },
            answerModel: 'model', sessionIdRef: ref('session'), showToast() {}, interviewAccess: { finish: async () => {} },
            sessionStorage: { removeItem() {} }, localStorage: { removeItem() {}, setItem() {} },
            router: { push(value) { route = value; } }, interviewSaveErrorMessage: () => 'save failed',
        };
        const source = fs.readFileSync('src/app/interview/page.tsx', 'utf8');
        const a = source.indexOf('const handleEndInterview = async');
        const b = source.indexOf('    endInterviewActionRef.current', a);
        const { end } = evaluate(source.slice(a, b) + '\nexports.end = handleEndInterview;', context);
        await end();
        assert.equal(saved[2].ai_responses.length, continuation ? 1 : 2);
        assert.match(saved[1], /visible partial answer/);
        assert.match(saved[1], /first part/);
        assert.equal(route, '/dashboard');
        assert.equal(context.isSavingRef.current, false);
        context.historySavedRef.current = false;
        failStop = true;
        await end();
        assert.equal(context.isSavingRef.current, false);
        assert.equal(context.sessionEndingRef.current, false);
        assert.equal(saveError, 'save failed');
    }
});

test('draft recovery rejects foreign accounts, stale setup, malformed storage and empty drafts', () => {
    const id = 'ebe69b52-fe94-4a0e-a3c0-ecc74088b711';
    const draft = { accountId: 'owner', contextSavedAt: 1, sessionId: id, qaPairs: [{ question: 'q', answer: 'a' }] };
    let raw = JSON.stringify(draft);
    const { readRecoverableInterview: read } = evaluate(fs.readFileSync('src/lib/interview-recovery.ts', 'utf8'), { localStorage: { getItem: () => raw } });
    assert.equal(read('owner', 1).sessionId, id);
    assert.equal(read('different-user', 1), null);
    assert.equal(read('owner', 2), null);
    raw = 'corrupt json'; assert.equal(read('owner', 1), null);
    raw = JSON.stringify({ ...draft, qaPairs: [null, {}] }); assert.equal(read('owner', 1), null);
    raw = JSON.stringify({ ...draft, qaPairs: [], manualQuestion: 'unsaved question' }); assert.equal(read('owner', 1).sessionId, id);
});

test('heartbeat waits for a slow check and ignores its result after disposal', async () => {
    const scheduled = [];
    let resolve, calls = 0, results = 0;
    const { startSessionHeartbeat } = evaluate(fs.readFileSync('src/lib/session-heartbeat.ts', 'utf8'), {
        setTimeout: callback => { scheduled.push(callback); return scheduled.length; }, clearTimeout() {},
    });
    const stop = startSessionHeartbeat(() => { calls++; return new Promise(r => { resolve = r; }); }, () => { results++; }, () => {});
    assert.equal(calls, 1);
    assert.equal(scheduled.length, 0, 'no second request while the first is pending');
    resolve({ allowed: true });
    await new Promise(r => setImmediate(r));
    assert.equal(results, 1);
    assert.equal(scheduled.length, 1);
    scheduled.shift()();
    assert.equal(calls, 2);
    stop(); resolve({ allowed: false });
    await new Promise(r => setImmediate(r));
    assert.equal(results, 1, 'late denial cannot close a newer session');
    assert.equal(scheduled.length, 0);
});

test('sign-out clears interview identity and pending cleanup as well as private text', async () => {
    const removed = [];
    const { signOutAndClear } = evaluate(fs.readFileSync('src/lib/auth.ts', 'utf8'), {
        document: {}, localStorage: { removeItem: key => removed.push(key) }, sessionStorage: { removeItem: key => removed.push(key) },
        require: name => {
            if (name === 'zustand') return { create: () => ({ setState() {} }) };
            if (name === './supabase') return { supabase: { auth: { signOut: async () => ({ error: null }) } } };
            if (name === './auth-navigation') return {};
            throw Error(name);
        },
    });
    await signOutAndClear();
    for (const key of ['interview_draft', 'allyx_access_session', 'allyx_pending_finish', 'allyx_resume_handoff']) assert.ok(removed.includes(key), key);
});
