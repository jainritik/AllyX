import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

// Sized for a full one-hour private-demo session plus retries.
const limits = { generate: 300, transcribe: 1200 } as const;
export type UsageKind = keyof typeof limits;

export function apiClient(request: NextRequest) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createServerClient(url, key, {
        cookies: {
            getAll: () => request.cookies.getAll(),
            setAll: () => {},
        },
    });
}

export async function authorizeApi(request: NextRequest, kind?: UsageKind) {
    const client = apiClient(request);
    if (!client) return { error: NextResponse.json({ error: "Authentication is not configured" }, { status: 503 }) };
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
        return { error: NextResponse.json({ error: "Please sign in again" }, { status: 401 }) };
    }
    if (kind) {
        const sessionId = request.headers.get("x-allyx-session-id");
        if (!sessionId) {
            return { error: NextResponse.json({ error: "Start an interview session before using AI features." }, { status: 403 }) };
        }
        const { data: access, error: accessError } = await client.rpc("check_interview_access", {
            requested_session_id: sessionId,
        });
        if (accessError) {
            console.error("[Interview access] Unable to verify entitlement:", accessError.code);
            return { error: NextResponse.json({ error: "Interview access verification is unavailable" }, { status: 503 }) };
        }
        const entitlement = access as { allowed?: boolean; reason?: string } | null;
        if (!entitlement?.allowed) {
            return { error: NextResponse.json({ error: entitlement?.reason || "Your free trial has ended. Choose an interview pack to continue." }, { status: 402 }) };
        }
        const { data: reservationId, error: quotaError } = await client.rpc("reserve_api_quota", {
            requested_kind: kind,
            daily_limit: limits[kind],
        });
        // A missing migration must fail closed, never grant unlimited access.
        if (quotaError) {
            console.error("[API quota] Unable to check usage:", quotaError.code);
            return { error: NextResponse.json({ error: "Usage accounting is unavailable" }, { status: 503 }) };
        }
        if (!reservationId) return { error: NextResponse.json({ error: "Daily usage limit reached. Try again tomorrow." }, { status: 429 }) };
        return { user: data.user, reservationId: String(reservationId) };
    }
    return { user: data.user };
}

export async function refundApiQuota(request: NextRequest, reservationId: string) {
    const client = apiClient(request);
    if (!client) return;
    const { error } = await client.rpc("refund_api_quota", { reservation_id: reservationId });
    if (error) console.error("[API quota] Unable to refund failed request:", error.code);
}

export async function commitApiQuota(request: NextRequest, reservationId: string) {
    const client = apiClient(request);
    if (!client) return;
    const { error } = await client.rpc("commit_api_quota", { reservation_id: reservationId });
    if (error) console.error("[API quota] Unable to commit request:", error.code);
    const sessionId = request.headers.get("x-allyx-session-id");
    if (!sessionId) return;
    const { error: usageError } = await client.rpc("mark_interview_meaningful_use", {
        requested_session_id: sessionId,
    });
    if (usageError) console.error("[Interview access] Unable to record meaningful use:", usageError.code);
}

export const OPENAI_MODELS = ["gpt-5.4-mini"] as const;
export const GROQ_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"] as const;
export const ALLOWED_MODELS = [...GROQ_MODELS, ...OPENAI_MODELS] as const;

export function isOpenAiModel(model: string) {
    return (OPENAI_MODELS as readonly string[]).includes(model);
}

export function parseGenerationBody(body: unknown) {
    if (!body || typeof body !== "object") return null;
    const input = body as Record<string, unknown>;
    const model = input.model === undefined ? "openai/gpt-oss-120b" : input.model;
    if (typeof model !== "string" || !ALLOWED_MODELS.includes(model as typeof ALLOWED_MODELS[number])) return null;
    const systemPrompt = input.systemPrompt ?? "";
    if (typeof systemPrompt !== "string" || systemPrompt.length > 12000) return null;
    const messages = input.messages ?? [{ role: "user", content: input.prompt }];
    if (!Array.isArray(messages) || messages.length < 1 || messages.length > 25) return null;
    if (!messages.every(m => m && typeof m === "object" && ["user", "assistant", "system"].includes(m.role) && typeof m.content === "string" && m.content.length <= 12000)) return null;
    const total = messages.reduce((sum, m) => sum + m.content.length, systemPrompt.length);
    if (total > 40000) return null;
    return { model, messages, systemPrompt };
}
