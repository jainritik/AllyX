import { NextRequest, NextResponse } from "next/server";
import { apiClient } from "@/lib/api-access";
import { billingAdminClient } from "@/lib/razorpay-server";
import { sendPaymentConfirmationEmail } from "@/lib/payment-confirmation-email";

export async function POST(request: NextRequest, context: { params: Promise<{ orderId: string }> }) {
    const client = apiClient(request);
    const { data: auth } = client ? await client.auth.getUser() : { data: null };
    if (!auth?.user) return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
    const { orderId } = await context.params;
    if (!/^order_[A-Za-z0-9]+$/.test(orderId)) return NextResponse.json({ error: "Invalid order" }, { status: 400 });
    try {
        const admin = billingAdminClient();
        // Atomically reserve a resend, only for the owner of a paid order.
        // The existing outbox claims delivery and caps attempts at five.
        const { data, error } = await admin.from("payment_orders")
            .update({ confirmation_email_status: "pending", confirmation_email_sent_at: null })
            .eq("order_id", orderId).eq("user_id", auth.user.id).eq("status", "paid")
            .eq("confirmation_email_status", "sent")
            .lt("confirmation_email_attempts", 5)
            .lt("confirmation_email_last_attempt_at", new Date(Date.now() - 60_000).toISOString())
            .select("order_id").maybeSingle();
        if (error) throw error;
        if (!data) return NextResponse.json({ error: "A confirmation may already be pending, or the resend limit was reached. Wait a minute before retrying; contact support if needed." }, { status: 429 });
        const result = await sendPaymentConfirmationEmail(orderId);
        return NextResponse.json({ message: result.sent ? "Confirmation email sent. Check your inbox or spam folder." : "Confirmation email is being processed." }, { headers: { "Cache-Control": "no-store" } });
    } catch {
        return NextResponse.json({ error: "Email delivery is temporarily unavailable. Your payment and credits are safe; delivery will be retried." }, { status: 503 });
    }
}
