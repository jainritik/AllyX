import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function credentials() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) throw new Error("Razorpay is not configured");
    return { keyId, keySecret };
}

async function razorpayRequest(path: string, init?: RequestInit) {
    const { keyId, keySecret } = credentials();
    const response = await fetch(`https://api.razorpay.com/v1${path}`, {
        ...init,
        headers: {
            Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
            "Content-Type": "application/json",
            ...init?.headers,
        },
        cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.description || `Razorpay request failed (${response.status})`);
    return body;
}

export function publicRazorpayKey() {
    return credentials().keyId;
}

export function createRazorpayOrder(input: { amount: number; receipt: string; notes: Record<string, string> }) {
    return razorpayRequest("/orders", { method: "POST", body: JSON.stringify({ ...input, currency: "INR" }) });
}

export function fetchRazorpayPayment(paymentId: string) {
    return razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
}

function secureHexEqual(expected: string, supplied: string) {
    if (!/^[a-f0-9]+$/i.test(supplied) || expected.length !== supplied.length) return false;
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(supplied, "hex"));
}

export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string) {
    const { keySecret } = credentials();
    const expected = createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
    return secureHexEqual(expected, signature);
}

export function verifyWebhookSignature(rawBody: string, signature: string) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) throw new Error("Razorpay webhook is not configured");
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    return secureHexEqual(expected, signature);
}

export function billingAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) throw new Error("Billing database is not configured");
    return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
