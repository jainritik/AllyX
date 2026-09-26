const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest } = require('next/server');

function load(file, mocks = {}, fetchMock = global.fetch) {
    const exports = {};
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(source, { exports, require: name => mocks[name] || require(name), process, console, fetch: fetchMock, Request, Response, Headers, FormData, File, TransformStream, TextEncoder, TextDecoder, AbortController, setTimeout, clearTimeout });
    return exports;
}

const paths = { generate: 'src/app/api/generate/route.ts', stream: 'src/app/api/generate-stream/route.ts' };
const request = (model = 'openai/gpt-oss-120b') => new NextRequest('https://allyx.invalid/api/generate', { method: 'POST', headers: { 'content-type': 'application/json', 'x-allyx-session-id': '11111111-1111-4111-8111-111111111111' }, body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hello' }] }) });

test('anonymous callers never reach paid generation provider', async () => {
    let providerCalls = 0;
    for (const path of Object.values(paths)) {
        const route = load(path, { '@/lib/api-access': {
            ALLOWED_MODELS: ['openai/gpt-oss-120b'],
            GROQ_MODELS: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
            isOpenAiModel: () => false,
            authorizeApi: async () => ({ error: Response.json({ error: 'Please sign in again' }, { status: 401 }) }),
        } }, async () => { providerCalls++; return new Response(''); });
        const response = await route.POST(request());
        assert.equal(response.status, 401);
    }
    assert.equal(providerCalls, 0);
});

test('generation rejects unsupported models and oversized prompts', () => {
    const { parseGenerationBody } = load('src/lib/api-access.ts');
    assert.equal(parseGenerationBody({ model: 'attacker/model', prompt: 'hello' }), null);
    for (const retired of ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'qwen/qwen3-32b']) {
        assert.equal(parseGenerationBody({ model: retired, prompt: 'hello' }), null);
    }
    assert.equal(parseGenerationBody({ model: 'openai/gpt-oss-120b', prompt: 'a'.repeat(12001) }), null);
    assert.equal(parseGenerationBody({ model: 'openai/gpt-oss-120b', prompt: 'hello' }).messages[0].content, 'hello');
    assert.equal(parseGenerationBody({ model: 'openai/gpt-oss-20b', prompt: 'hello' }).model, 'openai/gpt-oss-20b');
    assert.equal(parseGenerationBody({ model: 'qwen/qwen3.8-27b', prompt: 'hello' }).model, 'qwen/qwen3.8-27b');
    assert.equal(parseGenerationBody({ model: 'gpt-5.4-mini', prompt: 'hello' }).model, 'gpt-5.4-mini');
});

test('quota exhaustion and usage-ledger failures fail closed', async () => {
    const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const oldKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://allyx.invalid';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-public-key';
    try {
        for (const [rpcResult, expectedStatus] of [[{ data: false, error: null }, 429], [{ data: null, error: { code: 'PGRST202' } }, 503]]) {
            const api = load('src/lib/api-access.ts', { '@supabase/ssr': { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'test' } }, error: null }) }, rpc: async name => name === 'check_interview_access' ? { data: { allowed: true }, error: null } : rpcResult }) } });
            const result = await api.authorizeApi(request(), 'generate');
            assert.equal(result.error.status, expectedStatus);
        }
    } finally {
        if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
        if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oldKey;
    }
});

test('AI requests require an active server-verified interview session', async () => {
    const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const oldKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://allyx.invalid';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-public-key';
    try {
        const api = load('src/lib/api-access.ts', { '@supabase/ssr': { createServerClient: () => ({
            auth: { getUser: async () => ({ data: { user: { id: 'test' } }, error: null }) },
            rpc: async name => name === 'check_interview_access'
                ? { data: { allowed: false, reason: 'Your 10-minute free trial has ended.' }, error: null }
                : { data: 'should-not-reserve', error: null },
        }) } });
        const result = await api.authorizeApi(request(), 'generate');
        assert.equal(result.error.status, 402);
        assert.match(await result.error.text(), /trial has ended/);
    } finally {
        if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
        if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oldKey;
    }
});

test('successful provider usage commits quota and marks the active interview as meaningful', async () => {
    const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const oldKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://allyx.invalid';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-public-key';
    const calls = [];
    try {
        const api = load('src/lib/api-access.ts', { '@supabase/ssr': { createServerClient: () => ({
            rpc: async (name, args) => { calls.push({ name, args }); return { error: null }; },
        }) } });
        await api.commitApiQuota(request(), '22222222-2222-4222-8222-222222222222');
        assert.deepEqual(calls.map(call => call.name), ['commit_api_quota', 'mark_interview_meaningful_use']);
        assert.equal(calls[1].args.requested_session_id, '11111111-1111-4111-8111-111111111111');
    } finally {
        if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
        if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oldKey;
    }
});

test('streaming parser preserves SSE events split across bytes', async () => {
    const api = load('src/lib/api-access.ts');
    const encoder = new TextEncoder();
    const event = 'data: {"choices":[{"delta":{"content":"héllo"},"finish_reason":"stop"}]}\n\n';
    const bytes = encoder.encode(event);
    const provider = new ReadableStream({ start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
    } });
    const route = load(paths.stream, { '@/lib/api-access': { authorizeApi: async (_request, kind) => ({ user: { id: 'test' }, reservationId: kind ? 'r1' : undefined }), refundApiQuota: async () => {}, commitApiQuota: async () => {}, isOpenAiModel: api.isOpenAiModel, parseGenerationBody: api.parseGenerationBody, GROQ_MODELS: api.GROQ_MODELS } }, async () => new Response(provider, { status: 200 }));
    process.env.GROQ_API_KEY = 'mock-only';
    try {
        const response = await route.POST(request());
        assert.equal(response.status, 200);
        assert.match(await response.text(), /héllo/);
    } finally { delete process.env.GROQ_API_KEY; }
});

test('streaming content without a provider finish event is committed and offered for continuation', async () => {
    const api = load('src/lib/api-access.ts');
    const encoder = new TextEncoder();
    let commits = 0;
    let refunds = 0;
    const provider = new ReadableStream({ start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"partial answer"}}]}\n\n'));
        controller.close();
    } });
    const route = load(paths.stream, { '@/lib/api-access': {
        authorizeApi: async (_request, kind) => ({ user: { id: 'test' }, reservationId: kind ? 'r1' : undefined }),
        refundApiQuota: async () => { refunds++; },
        commitApiQuota: async () => { commits++; },
        isOpenAiModel: api.isOpenAiModel,
        parseGenerationBody: api.parseGenerationBody,
        GROQ_MODELS: api.GROQ_MODELS,
    } }, async () => new Response(provider, { status: 200 }));
    process.env.GROQ_API_KEY = 'mock-only';
    try {
        const response = await route.POST(request());
        const body = await response.text();
        assert.match(body, /partial answer/);
        assert.match(body, /"finishReason":"length"/);
        assert.equal(commits, 1);
        assert.equal(refunds, 0);
    } finally { delete process.env.GROQ_API_KEY; }
});

test('blank transcription results refund quota and never mark an interview as used', async () => {
    let commits = 0;
    let refunds = 0;
    const route = load('src/app/api/transcribe/route.ts', { '@/lib/api-access': {
        authorizeApi: async (_request, kind) => ({ user: { id: 'test' }, reservationId: kind ? 'r1' : undefined }),
        commitApiQuota: async () => { commits++; },
        refundApiQuota: async () => { refunds++; },
    } }, async () => Response.json({ text: '   ' }));
    const form = new FormData();
    form.append('file', new File([new Uint8Array([1, 2, 3])], 'audio.webm', { type: 'audio/webm' }));
    const transcribeRequest = new NextRequest('https://allyx.invalid/api/transcribe', {
        method: 'POST',
        headers: { 'x-allyx-session-id': '11111111-1111-4111-8111-111111111111' },
        body: form,
    });
    process.env.GROQ_API_KEY = 'mock-only';
    try {
        const response = await route.POST(transcribeRequest);
        assert.deepEqual(await response.json(), { text: '' });
        assert.equal(commits, 0);
        assert.equal(refunds, 1);
    } finally { delete process.env.GROQ_API_KEY; }
});

test('OpenAI model uses the OpenAI endpoint with direct-answer settings', async () => {
    const api = load('src/lib/api-access.ts');
    const encoder = new TextEncoder();
    const provider = new ReadableStream({ start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"answer"},"finish_reason":"stop"}]}\n\n'));
        controller.close();
    } });
    let calledUrl = '';
    let calledBody;
    const route = load(paths.stream, { '@/lib/api-access': {
        authorizeApi: async (_request, kind) => ({ user: { id: 'test' }, reservationId: kind ? 'r1' : undefined }),
        refundApiQuota: async () => {},
        commitApiQuota: async () => {},
        isOpenAiModel: api.isOpenAiModel,
        parseGenerationBody: api.parseGenerationBody,
        GROQ_MODELS: api.GROQ_MODELS,
    } }, async (url, init) => {
        calledUrl = url;
        calledBody = JSON.parse(init.body);
        return new Response(provider, { status: 200 });
    });
    process.env.OPENAI_API_KEY = 'mock-only';
    try {
        const response = await route.POST(request('gpt-5.4-mini'));
        assert.equal(response.status, 200);
        assert.equal(calledUrl, 'https://api.openai.com/v1/chat/completions');
        assert.equal(calledBody.reasoning_effort, 'none');
        assert.equal(calledBody.max_completion_tokens, 4096);
    } finally { delete process.env.OPENAI_API_KEY; }
});

test('paid OpenAI failure falls back to free Groq and reports the effective model', async () => {
    const api = load('src/lib/api-access.ts');
    const encoder = new TextEncoder();
    const calls = [];
    const route = load(paths.stream, { '@/lib/api-access': {
        authorizeApi: async (_request, kind) => ({ user: { id: 'test' }, reservationId: kind ? 'r1' : undefined }),
        refundApiQuota: async () => {},
        commitApiQuota: async () => {},
        isOpenAiModel: api.isOpenAiModel,
        parseGenerationBody: api.parseGenerationBody,
        GROQ_MODELS: api.GROQ_MODELS,
    } }, async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) });
        if (url.includes('openai.com')) return new Response('quota exceeded', { status: 429 });
        return new Response(new ReadableStream({ start(controller) {
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"fallback answer"},"finish_reason":"stop"}]}\n\n'));
            controller.close();
        } }), { status: 200 });
    });
    process.env.OPENAI_API_KEY = 'mock-paid';
    process.env.GROQ_API_KEY = 'mock-free';
    try {
        const response = await route.POST(request('gpt-5.4-mini'));
        assert.equal(response.status, 200);
        assert.equal(calls.length, 2);
        assert.equal(calls[1].body.model, 'openai/gpt-oss-120b');
        assert.equal(response.headers.get('X-ALLYX-Model'), 'openai/gpt-oss-120b');
        assert.match(await response.text(), /fallback answer/);
    } finally {
        delete process.env.OPENAI_API_KEY;
        delete process.env.GROQ_API_KEY;
    }
});

test('failed provider requests reserve then refund generation quota', async () => {
    const api = load('src/lib/api-access.ts');
    const authorizationKinds = [];
    let refunds = 0;
    const route = load(paths.stream, { '@/lib/api-access': {
        authorizeApi: async (_request, kind) => {
            authorizationKinds.push(kind || 'identity');
            return { user: { id: 'test' }, reservationId: kind ? 'r1' : undefined };
        },
        refundApiQuota: async () => { refunds++; },
        commitApiQuota: async () => {},
        isOpenAiModel: api.isOpenAiModel,
        parseGenerationBody: api.parseGenerationBody,
        GROQ_MODELS: api.GROQ_MODELS,
    } }, async () => new Response('provider failure', { status: 503 }));
    process.env.GROQ_API_KEY = 'mock-free';
    try {
        const response = await route.POST(request());
        assert.equal(response.status, 503);
        assert.deepEqual(authorizationKinds, ['identity', 'generate']);
        assert.equal(refunds, 1);
    } finally { delete process.env.GROQ_API_KEY; }
});
