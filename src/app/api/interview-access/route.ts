import { NextRequest, NextResponse } from "next/server";
import { apiClient } from "@/lib/api-access";

function validSessionId(value: unknown): value is string {
    return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

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
    const { data, error } = await auth.client.rpc("get_interview_access");
    if (error) return NextResponse.json({ error: "Interview access is not configured" }, { status: 503 });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
    const auth = await authenticatedClient(request);
    if (auth.error) return auth.error;
    const body = await request.json().catch(() => null);
    if (!validSessionId(body?.sessionId)) return NextResponse.json({ error: "Invalid interview session" }, { status: 400 });
    const source = ["auto", "trial", "credit"].includes(body?.source) ? body.source : "auto";
    const { data, error } = await auth.client.rpc("begin_interview_access_v2", {
        requested_session_id: body.sessionId,
        requested_source: source,
    });
    if (error) return NextResponse.json({ error: "Could not start the interview session" }, { status: 503 });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: NextRequest) {
    const auth = await authenticatedClient(request);
    if (auth.error) return auth.error;
    const body = await request.json().catch(() => null);
    if (!validSessionId(body?.sessionId)) return NextResponse.json({ error: "Invalid interview session" }, { status: 400 });
    const { data, error } = await auth.client.rpc("finish_interview_access", { requested_session_id: body.sessionId });
    if (error) return NextResponse.json({ error: "Could not close the interview session" }, { status: 503 });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
