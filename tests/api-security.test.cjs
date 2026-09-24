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
const request = (model = 'llama-3.1-8b-instant') => new NextRequest('https://zedx.invalid/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hello' }] }) });

test('anonymous callers never reach paid generation provider', async () => {
    let providerCalls = 0;
    for (const path of Object.values(paths)) {
        const route = load(path, { '@/lib/api-access': {
            ALLOWED_MODELS: ['llama-3.1-8b-instant'],
            GROQ_MODELS: ['llama-3.1-8b-instant'],
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
    assert.equal(parseGenerationBody({ model: 'llama-3.1-8b-instant', prompt: 'a'.repeat(12001) }), null);
    assert.equal(parseGenerationBody({ model: 'llama-3.1-8b-instant', prompt: 'hello' }).messages[0].content, 'hello');
    assert.equal(parseGenerationBody({ model: 'gpt-5.4-mini', prompt: 'hello' }).model, 'gpt-5.4-mini');
});

test('quota exhaustion and usage-ledger failures fail closed', async () => {
    const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const oldKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://zedx.invalid';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-public-key';
    try {
        for (const [rpcResult, expectedStatus] of [[{ data: false, error: null }, 429], [{ data: null, error: { code: 'PGRST202' } }, 503]]) {
            const api = load('src/lib/api-access.ts', { '@supabase/ssr': { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'test' } }, error: null }) }, rpc: async () => rpcResult }) } });
            const result = await api.authorizeApi(request(), 'generate');
            assert.equal(result.error.status, expectedStatus);
        }
    } finally {
        if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
        if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oldKey;
    }
});

test('streaming parser preserves SSE events split across bytes', async () => {
    const api = load('src/lib/api-access.ts');
    const encoder = new TextEncoder();
    const event = 'data: {"choices":[{"delta":{"content":"héllo"}}]}\n\n';
    const bytes = encoder.encode(event);
    const provider = new ReadableStream({ start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
    } });
    const route = load(paths.stream, { '@/lib/api-access': { authorizeApi: async () => ({ user: { id: 'test' } }), isOpenAiModel: api.isOpenAiModel, parseGenerationBody: api.parseGenerationBody } }, async () => new Response(provider, { status: 200 }));
    process.env.GROQ_API_KEY = 'mock-only';
    try {
        const response = await route.POST(request());
        assert.equal(response.status, 200);
        assert.match(await response.text(), /héllo/);
    } finally { delete process.env.GROQ_API_KEY; }
});

test('OpenAI model uses the OpenAI endpoint with direct-answer settings', async () => {
    const api = load('src/lib/api-access.ts');
    const encoder = new TextEncoder();
    const provider = new ReadableStream({ start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"answer"}}]}\n\n'));
        controller.close();
    } });
    let calledUrl = '';
    let calledBody;
    const route = load(paths.stream, { '@/lib/api-access': {
        authorizeApi: async () => ({ user: { id: 'test' } }),
        isOpenAiModel: api.isOpenAiModel,
        parseGenerationBody: api.parseGenerationBody,
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
