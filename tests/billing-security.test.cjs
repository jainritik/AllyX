const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { createHmac } = require('node:crypto');

function load(file, mocks = {}) {
    const exports = {};
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(source, {
        exports, require: name => mocks[name] || require(name), process, console, fetch,
        Request, Response, Headers, Buffer,
    });
    return exports;
}

test('billing plans use fixed server-side INR amounts and credits', () => {
    const { BILLING_PLANS, isBillingPlanId } = load('src/lib/billing-plans.ts');
    assert.deepEqual(JSON.parse(JSON.stringify(BILLING_PLANS)), {
        starter: { id: 'starter', name: '2 Interviews', amount: 100000, displayPrice: '₹1,000', credits: 2 },
        growth: { id: 'growth', name: '5 Interviews', amount: 200000, displayPrice: '₹2,000', credits: 5 },
        pro: { id: 'pro', name: '10 Interviews', amount: 350000, displayPrice: '₹3,500', credits: 10 },
    });
    assert.equal(isBillingPlanId('growth'), true);
    assert.equal(isBillingPlanId('attacker-price'), false);
});

test('checkout and webhook signatures reject tampered payment data', () => {
    const previousSecret = process.env.RAZORPAY_KEY_SECRET;
    const previousWebhook = process.env.RAZORPAY_WEBHOOK_SECRET;
    process.env.RAZORPAY_KEY_ID = 'rzp_test_public';
    process.env.RAZORPAY_KEY_SECRET = 'checkout-secret';
    process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook-secret';
    try {
        const billing = load('src/lib/razorpay-server.ts', { '@supabase/supabase-js': { createClient: () => ({}) } });
        const signature = createHmac('sha256', 'checkout-secret').update('order_123|pay_456').digest('hex');
        assert.equal(billing.verifyCheckoutSignature('order_123', 'pay_456', signature), true);
        assert.equal(billing.verifyCheckoutSignature('order_123', 'pay_tampered', signature), false);
        const body = '{"event":"payment.captured"}';
        const webhookSignature = createHmac('sha256', 'webhook-secret').update(body).digest('hex');
        assert.equal(billing.verifyWebhookSignature(body, webhookSignature), true);
        assert.equal(billing.verifyWebhookSignature(`${body} `, webhookSignature), false);
    } finally {
        if (previousSecret === undefined) delete process.env.RAZORPAY_KEY_SECRET; else process.env.RAZORPAY_KEY_SECRET = previousSecret;
        if (previousWebhook === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET; else process.env.RAZORPAY_WEBHOOK_SECRET = previousWebhook;
        delete process.env.RAZORPAY_KEY_ID;
    }
});

test('billing webhook routes captured payments and refunds through idempotent server RPCs', async () => {
    const calls = [];
    const route = load('src/app/api/billing/webhook/route.ts', {
        '@/lib/razorpay-server': {
            verifyWebhookSignature: () => true,
            billingAdminClient: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return { error: null }; } }),
        },
    });
    const captured = new Request('https://zedx.invalid/api/billing/webhook', {
        method: 'POST', headers: { 'x-razorpay-signature': 'valid' },
        body: JSON.stringify({ id: 'evt_capture', event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 100000, currency: 'INR' } } } }),
    });
    assert.equal((await route.POST(captured)).status, 200);
    assert.deepEqual(calls.map(call => call.name), ['fulfill_payment_order', 'record_payment_attempt_event']);
    assert.equal(calls[1].args.event_key, 'evt_capture');

    calls.length = 0;
    const refunded = new Request('https://zedx.invalid/api/billing/webhook', {
        method: 'POST', headers: { 'x-razorpay-signature': 'valid' },
        body: JSON.stringify({ id: 'evt_refund', event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_1', amount: 100000 } } } }),
    });
    assert.equal((await route.POST(refunded)).status, 200);
    assert.deepEqual(calls.map(call => call.name), ['record_refund_event']);
    assert.equal(calls[0].args.event_type, 'refund.processed');

    calls.length = 0;
    const disputed = new Request('https://zedx.invalid/api/billing/webhook', {
        method: 'POST', headers: { 'x-razorpay-signature': 'valid' },
        body: JSON.stringify({ id: 'evt_dispute', event: 'payment.dispute.lost', payload: { payment_dispute: { entity: { id: 'disp_1', payment_id: 'pay_1', reason_code: 'chargeback' } } } }),
    });
    assert.equal((await route.POST(disputed)).status, 200);
    assert.deepEqual(calls.map(call => call.name), ['record_payment_dispute']);
    assert.equal(calls[0].args.event_type, 'payment.dispute.lost');
});

test('refund ledger keeps processed refunds final when webhook events arrive out of order', () => {
    const migration = fs.readFileSync('supabase_payment_lifecycle_migration.sql', 'utf8');
    assert.match(migration, /when public\.payment_refunds\.status = 'processed' or excluded\.status = 'processed' then 'processed'/);
});

test('closing Razorpay Checkout releases the purchase button', () => {
    const component = fs.readFileSync('src/components/purchase-button.tsx', 'utf8');
    assert.match(component, /modal:\s*\{\s*ondismiss:/);
    assert.match(component, /Checkout closed\. Any completed payment will appear automatically\./);
});

test('billing support requires authentication and keeps writes behind RPCs', async () => {
    const route = load('src/app/api/billing/support/route.ts', {
        '@/lib/api-access': { apiClient: () => null },
    });
    const response = await route.POST(new Request('https://zedx.invalid/api/billing/support', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ category: 'refund', message: 'Please refund this order.' }),
    }));
    assert.equal(response.status, 503);
    const migration = fs.readFileSync('supabase_billing_support_migration.sql', 'utf8');
    assert.match(migration, /revoke all on public\.billing_support_requests from anon, authenticated/);
    assert.match(migration, /where order_id = requested_order_id and user_id = auth\.uid\(\)/);
    assert.match(migration, /recent_count >= 5/);
});

test('public policy pages do not expose the previous project owner email', () => {
    const policies = fs.readFileSync('src/app/terms/page.tsx', 'utf8') + fs.readFileSync('src/app/privacy/page.tsx', 'utf8');
    assert.doesNotMatch(policies, /ziademadbts/i);
    assert.match(policies, /seven calendar days/i);
    assert.match(policies, /Razorpay/);
});
