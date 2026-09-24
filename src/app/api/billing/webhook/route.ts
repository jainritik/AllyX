import { NextRequest, NextResponse } from "next/server";
import { billingAdminClient, verifyWebhookSignature } from "@/lib/razorpay-server";

export async function POST(request: NextRequest) {
    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature") || "";
    try {
        if (!verifyWebhookSignature(rawBody, signature)) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
        const event = JSON.parse(rawBody);
        if (event.event !== "payment.captured") return NextResponse.json({ received: true });
        const payment = event.payload?.payment?.entity;
        if (!payment?.order_id || !payment?.id) return NextResponse.json({ error: "Invalid payment event" }, { status: 400 });
        const { error } = await billingAdminClient().rpc("fulfill_payment_order", {
            requested_order_id: payment.order_id,
            requested_payment_id: payment.id,
            expected_user_id: null,
            captured_amount: payment.amount,
            captured_currency: payment.currency,
        });
        if (error) throw error;
        return NextResponse.json({ received: true });
    } catch (error) {
        console.error("[Billing webhook]", error instanceof Error ? error.message : error);
        return NextResponse.json({ error: "Webhook processing failed" }, { status: 503 });
    }
}
