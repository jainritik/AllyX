import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { apiClient } from "@/lib/api-access";
import { billingAdminClient } from "@/lib/razorpay-server";

const RELEASE = "1.3.5";

function clean(value: unknown, limit: number) {
    if (typeof value !== "string") return "";
    return value
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
        .replace(/(?:bearer\s+)?(?:eyJ|gsk_|sk-|sb_)[A-Za-z0-9._-]+/gi, "[secret]")
        .replace(/https?:\/\/[^\s)]+/gi, "[url]")
        .slice(0, limit)
        .trim();
}

export async function POST(request: NextRequest) {
    const client = apiClient(request);
    if (!client) return NextResponse.json({ accepted: false }, { status: 503 });
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return NextResponse.json({ accepted: false }, { status: 401 });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const name = clean(body?.name || "Error", 80) || "Error";
    const message = clean(body?.message, 300);
    const stack = clean(body?.stack, 2000) || null;
    const rawRoute = typeof body?.route === "string" ? body.route.split(/[?#]/, 1)[0] : "/unknown";
    const route = rawRoute.startsWith("/") ? rawRoute.slice(0, 300) : "/unknown";
    const runtime = body?.runtime === "desktop" ? "desktop" : "browser";
    if (!message) return NextResponse.json({ accepted: false }, { status: 400 });
    const signature = createHash("sha256").update(`${name}\n${message}\n${stack || ""}\n${route}\n${runtime}`).digest("hex");
    const admin = billingAdminClient();
    const { error: insertError } = await admin.rpc("record_client_error", {
        requested_signature: signature,
        requested_name: name,
        requested_message: message,
        requested_stack: stack,
        requested_route: route,
        requested_release: RELEASE,
        requested_runtime: runtime,
    });
    if (insertError) {
        console.error("[Client monitoring]", insertError.code);
        return NextResponse.json({ accepted: false }, { status: 503 });
    }
    return NextResponse.json({ accepted: true }, { headers: { "Cache-Control": "no-store" } });
}
