import { NextRequest, NextResponse } from "next/server";
import { apiClient } from "@/lib/api-access";
import { BILLING_PLANS, isBillingPlanId } from "@/lib/billing-plans";
import { billingAdminClient, createRazorpayOrder, publicRazorpayKey } from "@/lib/razorpay-server";

export async function POST(request: NextRequest) {
    const client = apiClient(request);
    if (!client) return NextResponse.json({ error: "Authentication is not configured" }, { status: 503 });
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) return NextResponse.json({ error: "Sign in to purchase an interview pack." }, { status: 401 });
    const body = await request.json().catch(() => null);
    const planId: unknown = body?.planId;
    if (!isBillingPlanId(planId)) return NextResponse.json({ error: "Invalid interview pack" }, { status: 400 });

    const plan = BILLING_PLANS[planId];
    try {
        const receipt = `zedx_${Date.now()}_${auth.user.id.slice(0, 8)}`.slice(0, 40);
        const order = await createRazorpayOrder({
            amount: plan.amount,
            receipt,
            notes: { account_id: auth.user.id, plan_id: plan.id },
        });
        const { error: ledgerError } = await billingAdminClient().rpc("record_payment_order", {
            requested_order_id: order.id,
            expected_user_id: auth.user.id,
            requested_plan_id: plan.id,
        });
        if (ledgerError) throw new Error("Could not record the payment order");
        return NextResponse.json({
            keyId: publicRazorpayKey(), orderId: order.id, amount: plan.amount,
            currency: "INR", planName: plan.name, accountEmail: auth.user.email || "",
        }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        console.error("[Billing order]", error instanceof Error ? error.message : error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create payment order" }, { status: 503 });
    }
}
