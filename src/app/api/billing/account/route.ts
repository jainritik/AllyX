import { after, NextRequest, NextResponse } from "next/server";
import { apiClient } from "@/lib/api-access";
import { retryPaymentConfirmationEmailsForUser } from "@/lib/payment-confirmation-email";

import { configuredLiveValidationOffer, availableLiveValidationOffer } from "@/lib/live-payment-validation";

export async function GET(request: NextRequest) {
    const client = apiClient(request);
    if (!client) return NextResponse.json({ error: "Authentication is not configured" }, { status: 503 });
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
    const { data, error } = await client.rpc("get_billing_account");
    if (error) {
        console.error("[Billing account]", error.code);
        return NextResponse.json({ error: "Billing details are temporarily unavailable" }, { status: 503 });
    }
    after(() => retryPaymentConfirmationEmailsForUser(auth.user.id).catch(emailError => {
        console.error("[Billing email retry]", emailError instanceof Error ? emailError.message : emailError);
    }));
    let liveValidationOffer = null;
    if (configuredLiveValidationOffer(auth.user)) {
        try { liveValidationOffer = await availableLiveValidationOffer(auth.user); }
        catch (offerError) { console.error("[Live payment offer]", offerError instanceof Error ? offerError.message : "Unavailable"); }
    }
    return NextResponse.json({ ...data, liveValidationOffer }, { headers: { "Cache-Control": "no-store" } });
}
