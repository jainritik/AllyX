const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, globals = {}, mocks = {}) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, { exports, require: name => mocks[name] || require(name), AbortController, DOMException, setTimeout, clearTimeout, ...globals });
    return exports;
}

test('session access stops on permanent HTTP failures and retries server failures', async () => {
    for (const status of [400, 401, 403, 500]) {
        let calls = 0;
        const { interviewAccess } = load('src/lib/interview-access.ts', {
            window: { setTimeout: callback => { queueMicrotask(callback); return 1; }, clearTimeout() {} },
            fetch: async () => { calls++; return Response.json({ error: 'service rejected request' }, { status }); },
        });
        await assert.rejects(interviewAccess.finish('session'), /service rejected request/);
        assert.equal(calls, status === 500 ? 3 : 1);
    }
});

test('save errors distinguish permissions, schema, auth and timeout without leaking database detail', () => {
    const { interviewSaveErrorMessage: format } = load('src/lib/interview-save-error.ts');
    assert.match(format({ message: 'User not authenticated' }), /sign-in/);
    assert.match(format({ cause: { code: '42501', message: 'private schema detail' } }), /database denied permission/);
    assert.doesNotMatch(format({ cause: { code: '42501', message: 'private schema detail' } }), /private schema detail/);
    assert.match(format({ cause: { code: '42P01' } }), /configuration update/);
    assert.match(format({ cause: { name: 'AbortError' } }), /timed out/);
    assert.match(format({ cause: { message: 'Failed to fetch' } }), /connection/);
});

test('duplicate interview save recovery has its own abort signal and clears both timers', async () => {
    const timers = new Set();
    const signals = [];
    let singleCalls = 0;
    const query = {
        insert() { return this; }, update() { return this; }, eq() { return this; }, select() { return this; },
        abortSignal(signal) { signals.push(signal); return this; },
        single: async () => ++singleCalls === 1
            ? { error: { code: '23505' }, data: null }
            : { error: null, data: { id: 'session', transcript: 'saved' } },
    };
    const supabase = { auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) }, from: () => query };
    const { interviewService } = load('src/lib/interview-service.ts', {
        setTimeout: fn => { const id = { fn }; timers.add(id); return id; },
        clearTimeout: id => timers.delete(id),
    }, { '@/lib/supabase': { supabase } });
    assert.equal((await interviewService.saveInterview('title', 'text', {}, 'session')).id, 'session');
    assert.equal(signals.length, 2);
    assert.notEqual(signals[0], signals[1]);
    assert.equal(timers.size, 0);
});

test('repeated SCAN requests share one opening operation instead of closing the frame', async () => {
    const source = fs.readFileSync('electron/main.js', 'utf8');
    const start = source.indexOf("    handleTrusted('toggle-scanner-frame', async () => {");
    const end = source.indexOf("    handleTrusted('open-screen-recording-settings'", start);
    let handler;
    let finishProbe, finishOpen;
    let opens = 0, closes = 0;
    const context = {
        handleTrusted: (_name, fn) => { handler = fn; },
        isPresentationSafeMode: false, scannerCaptureInFlight: false, scannerOcrInFlight: false,
        scannerOpenPromise: null, isScannerFrameOpen: false, scannerFrameWindow: null,
        prepareScreenCaptureSetup: () => new Promise(resolve => { finishProbe = resolve; }),
        createScannerFrame: () => { opens++; context.scannerFrameWindow = { isDestroyed: () => false }; return new Promise(resolve => { finishOpen = resolve; }); },
        closeScannerFrame: () => { closes++; },
    };
    vm.runInNewContext(source.slice(start, end), context);
    const first = handler();
    const second = handler();
    finishProbe({ state: 'ready' });
    await new Promise(resolve => setImmediate(resolve));
    const third = handler();
    finishOpen({ active: true });
    for (const result of await Promise.all([first, second, third])) assert.equal(result.active, true);
    assert.equal(opens, 1);
    assert.equal(closes, 0);
    assert.equal(context.scannerOpenPromise, null);
});

test('duplicate save with invisible UPDATE recovers the owned record through the server', async () => {
    let calls = 0, recoveries = 0;
    const query = { insert() { return this; }, update() { return this; }, eq() { return this; }, select() { return this; }, abortSignal() { return this; },
        single: async () => ({ data: null, error: { code: ++calls === 1 ? '23505' : 'PGRST116' } }) };
    const supabase = { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) }, from: () => query };
    const { interviewService } = load('src/lib/interview-service.ts', {
        fetch: async (url, options) => {
            recoveries++;
            assert.equal(url, '/api/interviews/recover');
            assert.equal(JSON.parse(options.body).transcript, 'latest text');
            return Response.json({ id: 'session', user_id: 'owner', transcript: 'latest text' });
        },
    }, { '@/lib/supabase': { supabase } });
    assert.equal((await interviewService.saveInterview('title', 'latest text', {}, 'session')).transcript, 'latest text');
    assert.equal(recoveries, 1);
});

test('recovery verifies sign-in and ownership and never updates another account', async () => {
    const sessionId = '49956092-ff99-4178-8af3-346215691e44';
    for (const mode of ['anonymous', 'missing', 'foreign', 'owned', 'failure']) {
        let writes = 0;
        const filters = [];
        const saved = { id: sessionId, user_id: 'owner', transcript: 'latest text' };
        const client = {
            auth: { getUser: async () => ({ data: { user: mode === 'anonymous' ? null : { id: 'owner' } } }) },
            from: () => ({ select() { return this; }, eq() { return this; }, abortSignal() { return this; },
                maybeSingle: async () => ({ data: mode === 'missing' ? null : { id: sessionId, user_id: mode === 'foreign' ? 'other' : 'owner' } }) }),
        };
        const admin = { from: () => ({ update(payload) { writes++; assert.equal(payload.transcript, 'latest text'); assert.equal(payload.user_id, undefined); return this; },
            eq(key, value) { filters.push([key, value]); return this; }, select() { return this; }, abortSignal() { return this; },
            single: async () => mode === 'failure' ? { error: { code: 'failure' } } : { data: saved } }) };
        const { POST } = load('src/app/api/interviews/recover/route.ts', {
            process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test' } },
        }, { '@/lib/api-access': { apiClient: () => client }, '@supabase/supabase-js': { createClient: () => admin } });
        const response = await POST(new Request('https://allyx.invalid/api/interviews/recover', { method: 'POST', body: JSON.stringify({ sessionId, title: 'title', transcript: 'latest text', analysis: {}, user_id: 'attacker' }) }));
        assert.equal(response.status, { anonymous: 401, missing: 404, foreign: 404, owned: 200, failure: 503 }[mode]);
        assert.equal(writes, ['owned', 'failure'].includes(mode) ? 1 : 0);
        if (writes) assert.deepEqual(filters, [['id', sessionId], ['user_id', 'owner']]);
        if (mode === 'owned') assert.equal((await response.json()).transcript, 'latest text');
    }
});

test('heartbeat checks cannot reserve a credit or activate a different session', async () => {
    const requests = [];
    let activeSession = 'session';
    const { interviewAccess } = load('src/lib/interview-access.ts', {
        window: { setTimeout, clearTimeout },
        fetch: async (url, options) => {
            requests.push(options.method);
            return Response.json({ allowed: true, sessionId: activeSession, creditsRemaining: 2 });
        },
    });
    assert.equal((await interviewAccess.check('session')).allowed, true);
    activeSession = 'another-session';
    assert.equal((await interviewAccess.check('session')).allowed, false);
    assert.deepEqual(requests, ['GET', 'GET']);
});
