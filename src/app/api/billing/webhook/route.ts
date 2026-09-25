import { NextRequest, NextResponse } from "next/server";
import { billingAdminClient, verifyWebhookSignature } from "@/lib/razorpay-server";
import { createHash } from "node:crypto";

const paymentEvents = new Set(["payment.authorized", "payment.captured", "payment.failed"]);
const refundEvents = new Set(["refund.created", "refund.processed", "refund.failed"]);
type PaymentEntity = { id?: string; order_id?: string; amount?: number; currency?: string; error_description?: string; error_reason?: string };
type RefundEntity = { id?: string; payment_id?: string; amount?: number };
type DisputeEntity = { id?: string; payment_id?: string; reason_description?: string; reason_code?: string };
type WebhookEvent = { id?: unknown; event?: unknown; payload?: {
    payment?: { entity?: PaymentEntity };
    refund?: { entity?: RefundEntity };
    payment_dispute?: { entity?: DisputeEntity };
    dispute?: { entity?: DisputeEntity };
} };

function eventKey(event: Record<string, unknown>, rawBody: string) {
    return typeof event.id === "string" && event.id ? event.id : createHash("sha256").update(rawBody).digest("hex");
}

export async function POST(request: NextRequest) {
    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature") || "";
    try {
        if (!verifyWebhookSignature(rawBody, signature)) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
        const event = JSON.parse(rawBody) as WebhookEvent;
        const type = typeof event.event === "string" ? event.event : "";
        const key = eventKey(event, rawBody);
        const admin = billingAdminClient();

        if (paymentEvents.has(type)) {
            const payment = event.payload?.payment?.entity;
            if (!payment?.order_id || !payment?.id) return NextResponse.json({ error: "Invalid payment event" }, { status: 400 });
            if (type === "payment.captured") {
                const { error } = await admin.rpc("fulfill_payment_order", {
                    requested_order_id: payment.order_id,
                    requested_payment_id: payment.id,
                    expected_user_id: null,
                    captured_amount: payment.amount,
                    captured_currency: payment.currency,
                });
                if (error) throw error;
            }
            const { error } = await admin.rpc("record_payment_attempt_event", {
                event_key: key,
                event_type: type,
                requested_order_id: payment.order_id,
                requested_payment_id: payment.id,
                failure_reason: type === "payment.failed" ? String(payment.error_description || payment.error_reason || "Payment failed").slice(0, 500) : null,
            });
            if (error) throw error;
        } else if (refundEvents.has(type)) {
            const refund = event.payload?.refund?.entity;
            if (!refund?.id || !refund?.payment_id || !Number.isInteger(refund.amount)) return NextResponse.json({ error: "Invalid refund event" }, { status: 400 });
            const { error } = await admin.rpc("record_refund_event", {
                event_key: key,
                event_type: type,
                requested_refund_id: refund.id,
                requested_payment_id: refund.payment_id,
                refund_amount: refund.amount,
            });
            if (error) throw error;
        } else if (type === "payment.dispute.created") {
            const dispute = event.payload?.payment_dispute?.entity || event.payload?.dispute?.entity;
            if (!dispute?.id || !dispute?.payment_id) return NextResponse.json({ error: "Invalid dispute event" }, { status: 400 });
            const { error } = await admin.rpc("record_payment_dispute", {
                event_key: key,
                requested_dispute_id: dispute.id,
                requested_payment_id: dispute.payment_id,
                dispute_reason: String(dispute.reason_description || dispute.reason_code || "Payment dispute opened").slice(0, 500),
            });
            if (error) throw error;
        }
        return NextResponse.json({ received: true });
    } catch (error) {
        console.error("[Billing webhook]", error instanceof Error ? error.message : error);
        return NextResponse.json({ error: "Webhook processing failed" }, { status: 503 });
    }
}
