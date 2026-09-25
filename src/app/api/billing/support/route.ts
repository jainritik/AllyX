import { NextRequest, NextResponse } from "next/server";
import { apiClient } from "@/lib/api-access";

async function authenticatedClient(request: NextRequest) {
    const client = apiClient(request);
    if (!client) return { error: NextResponse.json({ error: "Authentication is not configured" }, { status: 503 }) };
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return { error: NextResponse.json({ error: "Please sign in again" }, { status: 401 }) };
    return { client };
}

export async function GET(request: NextRequest) {
    const auth = await authenticatedClient(request);
    if (auth.error) return auth.error;
    const { data, error } = await auth.client.rpc("get_billing_support_requests");
    if (error) return NextResponse.json({ error: "Support requests are temporarily unavailable" }, { status: 503 });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
    const auth = await authenticatedClient(request);
    if (auth.error) return auth.error;
    const body = await request.json().catch(() => null);
    const category = typeof body?.category === "string" ? body.category : "";
    const orderId = typeof body?.orderId === "string" && body.orderId ? body.orderId : null;
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!['payment', 'refund', 'credits', 'technical', 'other'].includes(category) || message.length < 10 || message.length > 2000) {
        return NextResponse.json({ error: "Choose a category and enter 10–2,000 characters" }, { status: 400 });
    }
    const { data, error } = await auth.client.rpc("create_billing_support_request", {
        requested_category: category, requested_order_id: orderId, requested_message: message,
    });
    if (error) {
        const publicMessage = error.message.includes("Select a payment order") ? "Select the payment this request is about."
            : error.message.includes("limit reached") ? "You have reached the support request limit. Please try again tomorrow."
                : error.message.includes("not found") ? "That payment could not be found in your account."
                    : "Could not submit the request. Please try again.";
        return NextResponse.json({ error: publicMessage }, { status: 400 });
    }
    return NextResponse.json({ id: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
