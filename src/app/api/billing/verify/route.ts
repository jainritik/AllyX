import { NextRequest, NextResponse } from "next/server";
import { apiClient } from "@/lib/api-access";
import { billingAdminClient, fetchRazorpayPayment, verifyCheckoutSignature } from "@/lib/razorpay-server";
import { sendPaymentConfirmationEmail } from "@/lib/payment-confirmation-email";

const safeId = (value: unknown, prefix: string) => typeof value === "string" && value.startsWith(prefix) && value.length <= 80;

export async function POST(request: NextRequest) {
    const client = apiClient(request);
    if (!client) return NextResponse.json({ error: "Authentication is not configured" }, { status: 503 });
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
    const body = await request.json().catch(() => null);
    if (!safeId(body?.razorpay_order_id, "order_") || !safeId(body?.razorpay_payment_id, "pay_") || typeof body?.razorpay_signature !== "string") {
        return NextResponse.json({ error: "Invalid payment confirmation" }, { status: 400 });
    }
    try {
        if (!verifyCheckoutSignature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature)) {
            return NextResponse.json({ error: "Payment signature verification failed" }, { status: 400 });
        }
        const payment = await fetchRazorpayPayment(body.razorpay_payment_id);
        if (payment.order_id !== body.razorpay_order_id || payment.status !== "captured") {
            return NextResponse.json({ error: "Payment has not been captured yet" }, { status: 409 });
        }
        const admin = billingAdminClient();
        const { data, error } = await admin.rpc("fulfill_payment_order", {
            requested_order_id: body.razorpay_order_id,
            requested_payment_id: body.razorpay_payment_id,
            expected_user_id: auth.user.id,
            captured_amount: payment.amount,
            captured_currency: payment.currency,
        });
        if (error) throw error;
        await sendPaymentConfirmationEmail(body.razorpay_order_id).catch(emailError => {
            console.error("[Billing email]", emailError instanceof Error ? emailError.message : emailError);
        });
        return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        console.error("[Billing verify]", error instanceof Error ? error.message : error);
        return NextResponse.json({ error: "Payment confirmation is temporarily unavailable" }, { status: 503 });
    }
}
