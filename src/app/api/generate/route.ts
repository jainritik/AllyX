import { NextRequest, NextResponse } from "next/server";
import { GROQ_MODELS, authorizeApi, commitApiQuota, isOpenAiModel, parseGenerationBody, refundApiQuota } from "@/lib/api-access";

// Groq Models Fallback Chain
const GROQ_FALLBACK_MODELS = [...GROQ_MODELS];

// Debug GET handler to verify endpoint reaches the server
export async function GET() {
    return NextResponse.json({ status: "ok", message: "AI Generate endpoint is active" });
}

export async function POST(request: NextRequest) {
    let quotaReserved = false;
    let reservationId = "";
    try {
        const access = await authorizeApi(request);
        if (access.error) return access.error;
        if (Number(request.headers.get("content-length")) > 50000) return NextResponse.json({ error: "Request too large" }, { status: 413 });
        const parsed = parseGenerationBody(await request.json());
        if (!parsed) return NextResponse.json({ error: "Invalid prompt, messages, or model" }, { status: 400 });
        const { model, messages, systemPrompt } = parsed;

        const isDev = process.env.NODE_ENV === 'development';

        const usesOpenAi = isOpenAiModel(model);
        const quota = await authorizeApi(request, "generate");
        if (quota.error) return quota.error;
        reservationId = quota.reservationId || "";
        if (!reservationId) return NextResponse.json({ error: { message: "Usage reservation failed" } }, { status: 503 });
        quotaReserved = true;
        if (isDev) console.log(`[API Generate] Using Groq with model: ${model || 'auto'}`);

        // A paid OpenAI selection falls back to the free Groq default if the
        // paid provider is unavailable or has reached its account limit.
        const modelsToTry = usesOpenAi
            ? [model, "openai/gpt-oss-120b"]
            : [model, ...GROQ_FALLBACK_MODELS.filter(m => m !== model)];
        const uniqueModels = [...new Set(modelsToTry)].slice(0, 2);

        let lastError: Error | null = null;

        for (const targetModel of uniqueModels) {
            try {
                const targetUsesOpenAi = isOpenAiModel(targetModel);
                const providerName = targetUsesOpenAi ? "OpenAI" : "Groq";
                const providerApiKey = targetUsesOpenAi ? process.env.OPENAI_API_KEY : process.env.GROQ_API_KEY;
                if (!providerApiKey) throw new Error(`${providerName} server configuration missing`);
                if (isDev) console.log(`[API Generate] Trying ${providerName} ${targetModel}...`);

                // Build messages array
                const groqMessages = messages;

                // Add system prompt if provided
                const finalMessages = systemPrompt
                    ? [{ role: "system", content: systemPrompt }, ...groqMessages]
                    : groqMessages;

                // Allow complete long-form answers while still bounding stalled provider calls.
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 60000);

                let response: Response;
                const requestBody = targetUsesOpenAi
                    ? {
                        model: targetModel,
                        messages: finalMessages,
                        max_completion_tokens: 4096,
                        reasoning_effort: "none",
                    }
                    : {
                        model: targetModel,
                        messages: finalMessages,
                        max_tokens: 4096,
                        temperature: 0.3,
                        ...(targetModel === "openai/gpt-oss-120b" ? { reasoning_effort: "low" } : {}),
                    };

                try { response = await fetch(targetUsesOpenAi
                    ? "https://api.openai.com/v1/chat/completions"
                    : "https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${providerApiKey}`
                    },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal
                }); } finally { clearTimeout(timeoutId); }

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error?.message || `HTTP ${response.status}`);
                }

                const content = data.choices?.[0]?.message?.content;
                if (!content) throw new Error("Empty response from AI");
                const finishReason = data.choices?.[0]?.finish_reason || null;
                if (isDev) console.log(`[API Generate] ${providerName} Success: ${targetModel}`);
                await commitApiQuota(request, reservationId);
                quotaReserved = false;
                return NextResponse.json({
                    content,
                    modelUsed: targetModel,
                    provider: targetUsesOpenAi ? "openai" : "groq",
                    finishReason,
                    truncated: finishReason === "length"
                });

            } catch (error: unknown) {
                const err = error as Error;
                console.warn(`[API Generate] ${isOpenAiModel(targetModel) ? "OpenAI" : "Groq"} ${targetModel} failed:`, err.message);
                lastError = err;

                // If rate limited or quota exceeded, try next model
                if (isOpenAiModel(targetModel) || err.message.includes("429") || err.message.includes("quota") || err.message.includes("503")) {
                    continue;
                }
                break;
            }
        }

        // All models failed
        await refundApiQuota(request, reservationId);
        quotaReserved = false;
        return NextResponse.json({
            error: {
                message: isDev
                    ? `AI temporarily unavailable. ${lastError?.message || "Please try again."}`
                    : "AI temporarily unavailable. Please try again later."
            }
        }, { status: 503 });

    } catch (error: unknown) {
        if (quotaReserved) await refundApiQuota(request, reservationId);
        const err = error as Error;
        console.error("[API Generate] Internal Error:", err);
        const isDevEnv = process.env.NODE_ENV === 'development';
        return NextResponse.json(
            { error: { message: isDevEnv ? err.message : "An error occurred. Please try again." } },
            { status: 500 }
        );
    }
}
