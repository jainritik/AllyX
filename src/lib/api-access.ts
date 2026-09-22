import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

// Sized for a full one-hour private-demo session plus retries.
const limits = { generate: 300, transcribe: 1200 } as const;
export type UsageKind = keyof typeof limits;

export async function authorizeApi(request: NextRequest, kind?: UsageKind) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return { error: NextResponse.json({ error: "Authentication is not configured" }, { status: 503 }) };

    const client = createServerClient(url, key, {
        cookies: {
            getAll: () => request.cookies.getAll(),
            // API calls do not refresh browser cookies. Expired sessions must be
            // refreshed by the normal Supabase browser client before retrying.
            setAll: () => {},
        },
    });
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
        return { error: NextResponse.json({ error: "Please sign in again" }, { status: 401 }) };
    }
    if (kind) {
        const { data: allowed, error: quotaError } = await client.rpc("consume_api_quota", {
            request_kind: kind,
            daily_limit: limits[kind],
        });
        // A missing migration must fail closed, never grant unlimited access.
        if (quotaError) {
            console.error("[API quota] Unable to check usage:", quotaError.code);
            return { error: NextResponse.json({ error: "Usage accounting is unavailable" }, { status: 503 }) };
        }
        if (!allowed) return { error: NextResponse.json({ error: "Daily usage limit reached. Try again tomorrow." }, { status: 429 }) };
    }
    return { user: data.user };
}

export const ALLOWED_MODELS = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "qwen/qwen3-32b", "openai/gpt-oss-120b"] as const;

export function parseGenerationBody(body: unknown) {
    if (!body || typeof body !== "object") return null;
    const input = body as Record<string, unknown>;
    const model = input.model === undefined ? ALLOWED_MODELS[0] : input.model;
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
