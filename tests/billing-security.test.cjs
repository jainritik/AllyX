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
