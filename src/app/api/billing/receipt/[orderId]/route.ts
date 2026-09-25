import { NextRequest, NextResponse } from "next/server";
import { apiClient } from "@/lib/api-access";

export async function GET(request: NextRequest, context: { params: Promise<{ orderId: string }> }) {
    const client = apiClient(request);
    if (!client) return NextResponse.json({ error: "Authentication is not configured" }, { status: 503 });
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
    const { orderId } = await context.params;
    if (!/^order_[A-Za-z0-9]+$/.test(orderId)) return NextResponse.json({ error: "Invalid receipt" }, { status: 400 });
    const { data, error } = await client.rpc("get_payment_receipt", { requested_order_id: orderId });
    if (error || !data) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
