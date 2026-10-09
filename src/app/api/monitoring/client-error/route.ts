import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { billingAdminClient } from "@/lib/razorpay-server";
import { sendProductionErrorAlert } from "@/lib/production-error-alert";

const RELEASE = "1.3.16";
const alertAttempts: number[] = [];

function canSendAlert() {
    const cutoff = Date.now() - 10 * 60 * 1000;
    while (alertAttempts[0] && alertAttempts[0] < cutoff) alertAttempts.shift();
    if (alertAttempts.length >= 5) return false;
    alertAttempts.push(Date.now());
    return true;
}

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
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ accepted: false }, { status: 403 });
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
        return NextResponse.json({ accepted: false }, { status: 415 });
    }
    if (Number(request.headers.get("content-length")) > 6000) {
        return NextResponse.json({ accepted: false }, { status: 413 });
    }
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
    const { data: event, error: eventError } = await admin.from("client_error_events")
        .select("occurrences")
        .eq("signature", signature)
        .maybeSingle();
    if (eventError) console.error("[Client monitoring alert lookup]", eventError.code);
    const occurrences = Number(event?.occurrences || 0);
    const shouldAlert = !eventError && occurrences > 0
        && (occurrences === 1 || occurrences === 10 || occurrences === 50 || occurrences % 100 === 0);
    if (shouldAlert && canSendAlert()) {
        await sendProductionErrorAlert({
            signature, name, message, stack, route, release: RELEASE, runtime, occurrences,
        }).catch(alertError => console.error("[Client monitoring alert]", alertError instanceof Error ? alertError.message : alertError));
    }
    return NextResponse.json({ accepted: true }, { headers: { "Cache-Control": "no-store" } });
}
