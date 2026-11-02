import { BILLING_PLANS } from "@/lib/billing-plans";
import type { SupabaseClient, User } from "@supabase/supabase-js";

// Server-only, temporary offer. Neither the amount nor the account can be supplied by a client.
export function configuredLiveValidationOffer(user: Pick<User, "id">, now = Date.now()) {
    const allowedUser = process.env.ALLYX_LIVE_PAYMENT_VALIDATION_USER_ID;
    const expires = Date.parse(process.env.ALLYX_LIVE_PAYMENT_VALIDATION_EXPIRES_AT || "");
    if (!allowedUser || user.id !== allowedUser || !Number.isFinite(expires) || expires <= now) return null;
    if (!process.env.RAZORPAY_KEY_ID?.startsWith("rzp_live_") || !process.env.RAZORPAY_KEY_SECRET) return null;
    return { ...BILLING_PLANS.starter, amount: 100, displayPrice: "₹1", expiresAt: new Date(expires).toISOString() };
}

export async function availableLiveValidationOffer(user: Pick<User, "id">, admin: SupabaseClient) {
    const offer = configuredLiveValidationOffer(user);
    if (!offer) return null;
    const { data, error } = await admin.from("payment_orders").select("order_id")
        .eq("user_id", user.id).eq("amount", 100).like("receipt_number", "allyx_livecheck_%")
        .in("status", ["authorized", "paid", "refund_pending", "partially_refunded", "refunded", "disputed"]).limit(1);
    if (error) throw new Error("Could not verify live payment validation eligibility");
    return data?.length ? null : offer;
}
