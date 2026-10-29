import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { apiClient } from "@/lib/api-access";

// Recovery for deployments where the browser UPDATE policy is missing.
// Never trust a supplied owner or upsert an arbitrary session ID.
export async function POST(request: NextRequest) {
    const client = apiClient(request);
    if (!client) return NextResponse.json({ error: "Save service unavailable" }, { status: 503 });
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
    const body = await request.json().catch(() => null);
    if (!body || typeof body.sessionId !== "string"
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.sessionId)
        || typeof body.title !== "string" || body.title.length > 500
        || typeof body.transcript !== "string" || body.transcript.length > 2_000_000
        || !body.analysis || typeof body.analysis !== "object" || Array.isArray(body.analysis)
        || JSON.stringify(body.analysis).length > 2_000_000) {
        return NextResponse.json({ error: "Invalid interview" }, { status: 400 });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
        // Verify visibility through RLS as well as authenticated ownership.
        const { data: existing, error } = await client.from("interviews")
            .select("id,user_id").eq("id", body.sessionId).eq("user_id", user.id)
            .abortSignal(controller.signal).maybeSingle();
        if (error) return NextResponse.json({ error: "Could not verify saved interview" }, { status: 503 });
        if (!existing || existing.user_id !== user.id) {
            return NextResponse.json({ error: "Interview not found" }, { status: 404 });
        }
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) return NextResponse.json({ error: "Save service unavailable" }, { status: 503 });
        const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data: saved, error: saveError } = await admin.from("interviews")
            .update({ title: body.title, transcript: body.transcript, analysis: body.analysis })
            .eq("id", body.sessionId).eq("user_id", user.id).select()
            .abortSignal(controller.signal).single();
        if (saveError || !saved) return NextResponse.json({ error: "Could not confirm saved interview" }, { status: 503 });
        return NextResponse.json(saved, { headers: { "Cache-Control": "no-store" } });
    } catch {
        return NextResponse.json({ error: "Save service unavailable" }, { status: 503 });
    } finally {
        clearTimeout(timeout);
    }
}
