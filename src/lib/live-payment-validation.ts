import { BILLING_PLANS } from "@/lib/billing-plans";
import type { User } from "@supabase/supabase-js";

// Server-only, permanent testing-account price. Neither the amount nor the account can be supplied by a client.
export function configuredLiveValidationOffer(user: Pick<User, "id">) {
    const allowedUser = process.env.ALLYX_LIVE_PAYMENT_VALIDATION_USER_ID;
    if (!allowedUser || user.id !== allowedUser) return null;
    if (!process.env.RAZORPAY_KEY_ID?.startsWith("rzp_live_") || !process.env.RAZORPAY_KEY_SECRET) return null;
    return { ...BILLING_PLANS.starter, amount: 100, displayPrice: "₹1", expiresAt: null };
}

// Successful previous payments do not consume testing-account eligibility.
export const availableLiveValidationOffer = configuredLiveValidationOffer;
