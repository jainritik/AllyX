const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { createHmac } = require('node:crypto');

function load(file, mocks = {}, globals = {}) {
    const exports = {};
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(source, {
        exports, require: name => mocks[name] || require(name), process, console, fetch,
        Request, Response, Headers, Buffer, AbortController, setTimeout, clearTimeout, ...globals,
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
    const emails = [];
    const route = load('src/app/api/billing/webhook/route.ts', {
        '@/lib/razorpay-server': {
            verifyWebhookSignature: () => true,
            billingAdminClient: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return { error: null }; } }),
        },
        '@/lib/payment-confirmation-email': { sendPaymentConfirmationEmail: async orderId => emails.push(orderId) },
    });
    const captured = new Request('https://allyx.invalid/api/billing/webhook', {
        method: 'POST', headers: { 'x-razorpay-signature': 'valid' },
        body: JSON.stringify({ id: 'evt_capture', event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 100000, currency: 'INR' } } } }),
    });
    assert.equal((await route.POST(captured)).status, 200);
    assert.deepEqual(calls.map(call => call.name), ['fulfill_payment_order', 'record_payment_attempt_event']);
    assert.equal(calls[1].args.event_key, 'evt_capture');
    assert.deepEqual(emails, ['order_1']);

    calls.length = 0;
    const refunded = new Request('https://allyx.invalid/api/billing/webhook', {
        method: 'POST', headers: { 'x-razorpay-signature': 'valid' },
        body: JSON.stringify({ id: 'evt_refund', event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_1', amount: 100000 } } } }),
    });
    assert.equal((await route.POST(refunded)).status, 200);
    assert.deepEqual(calls.map(call => call.name), ['record_refund_event']);
    assert.equal(calls[0].args.event_type, 'refund.processed');

    calls.length = 0;
    const disputed = new Request('https://allyx.invalid/api/billing/webhook', {
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
    assert.match(migration, /ceil\(\(purchase\.credits::numeric \* processed_total::numeric\) \/ purchase\.amount::numeric\)/);
    assert.match(migration, /credit_debt = credit_debt \+ debt/);
});

test('payment confirmation email uses an atomic retryable outbox', () => {
    const migration = fs.readFileSync('supabase_payment_email_migration.sql', 'utf8');
    assert.match(migration, /confirmation_email_sent_at is null/);
    assert.match(migration, /confirmation_email_attempts < 5/);
    assert.match(migration, /confirmation_email_status in \('pending', 'failed'\)/);
    assert.match(migration, /grant execute on function public\.claim_payment_confirmation_email\(text\) to service_role/);
    const sender = fs.readFileSync('src/lib/payment-confirmation-email.ts', 'utf8');
    assert.match(sender, /Payment confirmed/);
    assert.match(sender, /Credits available/);
    assert.match(sender, /dashboard\/billing\/receipt/);
    assert.match(sender, /retryPaymentConfirmationEmailsForUser/);
    assert.match(sender, /confirmation_email_attempts", 5/);
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
    const response = await route.POST(new Request('https://allyx.invalid/api/billing/support', {
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
    const contact = fs.readFileSync('src/lib/support-contact.ts', 'utf8');
    assert.match(contact, /kitirjain@gmail\.com/);
    assert.match(contact, /wa\.me\/918377038800/);
});

 test('stalled payment response bodies time out and abort the provider request', async () => {
    const oldId = process.env.RAZORPAY_KEY_ID, oldSecret = process.env.RAZORPAY_KEY_SECRET;
    process.env.RAZORPAY_KEY_ID = 'rzp_test_mock'; process.env.RAZORPAY_KEY_SECRET = 'mock';
    try {
        let signal;
        const billing = load('src/lib/razorpay-server.ts', {}, {
            setTimeout: callback => setTimeout(callback, 5),
            fetch: async (_url, options) => { signal = options.signal; return { ok: true, json: () => new Promise(() => {}) }; },
        });
        await assert.rejects(billing.createRazorpayOrder({ amount: 100, receipt: 'test', notes: {} }), /timed out/);
        assert.equal(signal.aborted, true);
    } finally {
        if (oldId === undefined) delete process.env.RAZORPAY_KEY_ID; else process.env.RAZORPAY_KEY_ID = oldId;
        if (oldSecret === undefined) delete process.env.RAZORPAY_KEY_SECRET; else process.env.RAZORPAY_KEY_SECRET = oldSecret;
    }
});

test('permanent testing price requires the configured account and live credentials', () => {
    const names = ['ALLYX_LIVE_PAYMENT_VALIDATION_USER_ID', 'ALLYX_LIVE_PAYMENT_VALIDATION_EXPIRES_AT', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'];
    const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
    try {
        process.env.ALLYX_LIVE_PAYMENT_VALIDATION_USER_ID = 'owner';
        process.env.ALLYX_LIVE_PAYMENT_VALIDATION_EXPIRES_AT = '2030-01-02T00:00:00Z';
        process.env.RAZORPAY_KEY_ID = 'rzp_live_mock'; process.env.RAZORPAY_KEY_SECRET = 'mock';
        const plans = load('src/lib/billing-plans.ts');
        const { configuredLiveValidationOffer: offer } = load('src/lib/live-payment-validation.ts', { '@/lib/billing-plans': plans });
        const now = Date.parse('2030-01-01T00:00:00Z');
        assert.equal(offer({ id: 'owner' }, now).amount, 100);
        assert.equal(offer({ id: 'owner' }, now).credits, 2);
        assert.equal(offer({ id: 'other-account' }, now), null);
        assert.equal(offer({ id: 'owner' }, Date.parse('2040-01-03')).amount, 100);
        assert.equal(offer({ id: 'owner' }, now).expiresAt, null);
        process.env.RAZORPAY_KEY_ID = 'rzp_test_mock';
        assert.equal(offer({ id: 'owner' }, now), null);
        delete process.env.ALLYX_LIVE_PAYMENT_VALIDATION_USER_ID;
        assert.equal(offer({ id: 'owner' }, now), null);
    } finally { for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } }
});

test('a foreign account cannot create the restricted ₹1 order, even with a forged amount', async () => {
    const { NextRequest } = require('next/server');
    let providerCalls = 0, writes = 0;
    const route = load('src/app/api/billing/order/route.ts', {
        '@/lib/api-access': { apiClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'foreign' } } }) } }) },
        '@/lib/billing-plans': load('src/lib/billing-plans.ts'),
        '@/lib/live-payment-validation': { availableLiveValidationOffer: async () => null },
        '@/lib/razorpay-server': {
            billingAdminClient: () => ({ rpc: async () => { writes++; } }),
            createRazorpayOrder: async () => { providerCalls++; }, publicRazorpayKey: () => 'rzp_live_mock',
        },
    });
    const result = await route.POST(new NextRequest('https://allyx.invalid/api/billing/order', { method: 'POST', body: JSON.stringify({ planId: 'starter', offer: 'live_validation', amount: 1 }) }));
    assert.equal(result.status, 403); assert.equal(providerCalls, 0); assert.equal(writes, 0);
});

test('authorized ₹1 checkout records the same amount and credits used by fulfillment', async () => {
    const { NextRequest } = require('next/server');
    const plans = load('src/lib/billing-plans.ts');
    let created, recorded;
    const route = load('src/app/api/billing/order/route.ts', {
        '@/lib/api-access': { apiClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'owner', email: 'test@example.invalid' } } }) } }) },
        '@/lib/billing-plans': plans,
        '@/lib/live-payment-validation': { availableLiveValidationOffer: async () => ({ ...plans.BILLING_PLANS.starter, amount: 100 }) },
        '@/lib/razorpay-server': {
            billingAdminClient: () => ({ from: name => { assert.equal(name, 'payment_orders'); return { insert: async row => { recorded = row; return { error: null }; } }; } }),
            createRazorpayOrder: async input => { created = input; return { id: 'order_valid', amount: 100, currency: 'INR' }; },
            publicRazorpayKey: () => 'rzp_live_mock',
        },
    });
    const result = await route.POST(new NextRequest('https://allyx.invalid/api/billing/order', { method: 'POST', body: JSON.stringify({ planId: 'starter', offer: 'live_validation', amount: 999, credits: 999 }) }));
    assert.equal(result.status, 200); assert.equal(created.amount, 100);
    assert.equal(recorded.amount, 100); assert.equal(recorded.credits, 2); assert.equal(recorded.user_id, 'owner');
    assert.equal(recorded.plan_id, 'starter'); assert.match(recorded.receipt_number, /^allyx_livecheck_/);
});

test('webhook-first checkout confirmation reports the purchase, not zero duplicate credits', () => {
    const { paymentConfirmationMessage } = load('src/lib/payment-confirmation-message.ts');
    const duplicate = paymentConfirmationMessage({ alreadyProcessed: true, creditsAdded: 0, creditsRemaining: 9974 }, 2);
    assert.match(duplicate, /Payment confirmed for 2 interview credits/);
    assert.match(duplicate, /Available balance: 9974/);
    assert.doesNotMatch(duplicate, /0 interview credits added successfully/);
    assert.match(paymentConfirmationMessage({ creditsAdded: 2, creditsRemaining: 9974 }, 2), /2 interview credits added successfully/);
    assert.match(paymentConfirmationMessage({ creditsAdded: 0, debtRepaid: 2, creditsRemaining: 0 }, 2), /2 credits settled an outstanding credit adjustment/);
    assert.match(paymentConfirmationMessage({}, 2), /Refresh Billing & Credits/);
});

test('receipt email resend is authenticated and claims only the owned paid order with a cooldown', async () => {
    let sent = 0;
    const filters = [];
    const query = {};
    for (const name of ['update', 'eq', 'lt', 'select']) query[name] = (...args) => { filters.push([name, ...args]); return query; };
    query.maybeSingle = async () => ({ data: { order_id: 'order_123' }, error: null });
    const route = load('src/app/api/billing/receipt/[orderId]/email/route.ts', {
        '@/lib/api-access': { apiClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) } }) },
        '@/lib/razorpay-server': { billingAdminClient: () => ({ from: () => query }) },
        '@/lib/payment-confirmation-email': { sendPaymentConfirmationEmail: async () => { sent++; return { sent: true }; } },
    });
    const result = await route.POST(new Request('https://allyx.invalid'), { params: Promise.resolve({ orderId: 'order_123' }) });
    assert.equal(result.status, 200);
    assert.equal(sent, 1);
    for (const expected of [['eq', 'user_id', 'owner'], ['eq', 'status', 'paid'], ['eq', 'confirmation_email_status', 'sent'], ['lt', 'confirmation_email_attempts', 5]]) {
        assert.ok(filters.some(item => JSON.stringify(item) === JSON.stringify(expected)));
    }
    assert.ok(filters.some(item => item[0] === 'lt' && item[1] === 'confirmation_email_last_attempt_at'));
    query.maybeSingle = async () => ({ data: null, error: null });
    assert.equal((await route.POST(new Request('https://allyx.invalid'), { params: Promise.resolve({ orderId: 'order_123' }) })).status, 429);
    assert.equal(sent, 1);
    const anonymous = load('src/app/api/billing/receipt/[orderId]/email/route.ts', {
        '@/lib/api-access': { apiClient: () => null },
        '@/lib/razorpay-server': {}, '@/lib/payment-confirmation-email': {},
    });
    assert.equal((await anonymous.POST(new Request('https://allyx.invalid'), { params: Promise.resolve({ orderId: 'order_123' }) })).status, 401);
});

test('confirmation email includes the actual discounted amount, credits, balance and receipt', async () => {
    const previous = Object.fromEntries(['BREVO_SMTP_USER', 'BREVO_SMTP_PASS', 'ALLYX_EMAIL_FROM'].map(key => [key, process.env[key]]));
    Object.assign(process.env, { BREVO_SMTP_USER: 'test', BREVO_SMTP_PASS: 'test', ALLYX_EMAIL_FROM: 'receipts@example.com' });
    let mail;
    const calls = [];
    try {
        const sender = load('src/lib/payment-confirmation-email.ts', {
            nodemailer: { default: { createTransport: () => ({ sendMail: async value => { mail = value; } }) } },
            '@/lib/support-contact': { supportContact: { email: 'support@example.com' } },
            '@/lib/razorpay-server': { billingAdminClient: () => ({
                rpc: async (name, args) => {
                    calls.push([name, args]);
                    return { data: name === 'claim_payment_confirmation_email' ? {
                        userId: 'owner', orderId: 'order_123', paymentId: 'pay_123', planId: 'starter',
                        amount: 100, currency: 'INR', credits: 2, creditsRemaining: 12, receiptNumber: 'receipt<123>',
                    } : null, error: null };
                },
                auth: { admin: { getUserById: async () => ({ data: { user: { email: 'customer@example.com' } }, error: null }) } },
            }) },
        });
        assert.equal((await sender.sendPaymentConfirmationEmail('order_123')).sent, true);
        assert.equal(mail.to, 'customer@example.com');
        assert.match(mail.subject, /₹1\.00.*2 interview credits/);
        assert.match(mail.text, /Credits added: 2/);
        assert.match(mail.text, /Credits now available: 12/);
        assert.match(mail.text, /Order ID: order_123/);
        assert.match(mail.text, /receipt\/order_123/);
        assert.match(mail.html, /receipt&lt;123&gt;/);
        assert.equal(calls.at(-1)[1].delivered, true);
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    }
});
