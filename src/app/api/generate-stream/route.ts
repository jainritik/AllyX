import { NextRequest } from "next/server";
import { GROQ_MODELS, authorizeApi, commitApiQuota, isOpenAiModel, parseGenerationBody, refundApiQuota } from "@/lib/api-access";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    try {
        const access = await authorizeApi(request);
        if (access.error) return access.error;
        if (Number(request.headers.get("content-length")) > 50000) return Response.json({ error: "Request too large" }, { status: 413 });
        const parsedBody = parseGenerationBody(await request.json());
        if (!parsedBody) return Response.json({ error: "Invalid prompt, messages, or model" }, { status: 400 });
        const { model, messages, systemPrompt } = parsedBody;
        const finalMessages = systemPrompt ? [{ role: "system", content: systemPrompt }, ...messages] : messages;

        const quota = await authorizeApi(request, "generate");
        if (quota.error) return quota.error;
        const reservationId = quota.reservationId;
        if (!reservationId) return Response.json({ error: "Usage reservation failed" }, { status: 503 });
        let shouldRefund = true;

        const callProvider = async (targetModel: string, openAi: boolean) => {
            const providerApiKey = openAi ? process.env.OPENAI_API_KEY : process.env.GROQ_API_KEY;
            if (!providerApiKey) return null;
            const body = openAi ? {
                model: targetModel, messages: finalMessages, max_completion_tokens: 4096,
                reasoning_effort: "none", stream: true,
            } : {
                model: targetModel, messages: finalMessages, max_tokens: 4096, temperature: 0.3,
                ...(targetModel === "openai/gpt-oss-120b" ? { reasoning_effort: "low" } : {}),
                stream: true,
            };
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 55000);
            try {
                return await fetch(openAi ? "https://api.openai.com/v1/chat/completions" : "https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${providerApiKey}` },
                    body: JSON.stringify(body),
                    signal: controller.signal,
                });
            } finally {
                clearTimeout(timeout);
            }
        };

        const requestedOpenAi = isOpenAiModel(model);
        const candidates = requestedOpenAi
            ? [model, "openai/gpt-oss-120b", "openai/gpt-oss-20b"]
            : [model, ...GROQ_MODELS.filter(candidate => candidate !== model)];
        let effectiveModel = model;
        let response: Response | null = null;
        let lastStatus = 503;
        for (const candidate of [...new Set(candidates)]) {
            effectiveModel = candidate;
            const candidateUsesOpenAi = isOpenAiModel(candidate);
            try {
                const candidateResponse = await callProvider(candidate, candidateUsesOpenAi);
                if (candidateResponse?.ok) {
                    response = candidateResponse;
                    break;
                }
                if (candidateResponse) {
                    lastStatus = candidateResponse.status;
                    console.warn(`[Stream API] ${candidate} returned ${candidateResponse.status}; trying fallback.`);
                    await candidateResponse.body?.cancel().catch(() => undefined);
                }
            } catch (error) {
                console.warn(`[Stream API] ${candidate} failed; trying fallback.`, error instanceof Error ? error.message : error);
            }
        }
        if (!response) {
            await refundApiQuota(request, reservationId);
            shouldRefund = false;
            return Response.json({ error: "AI temporarily unavailable" }, { status: lastStatus >= 400 && lastStatus < 600 ? lastStatus : 503 });
        }

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        let carry = "";
        let providerCompleted = false;
        let deliveredContent = false;
        let commitPromise: Promise<void> | null = null;
        const processLines = (lines: string[], controller: TransformStreamDefaultController<Uint8Array>) => {
            for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const data = line.slice(6);
                if (data === "[DONE]") {
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    continue;
                }
                try {
                    const providerEvent = JSON.parse(data);
                    const content = providerEvent.choices?.[0]?.delta?.content;
                    if (content) {
                        deliveredContent = true;
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                    }
                    const finishReason = providerEvent.choices?.[0]?.finish_reason;
                    if (finishReason) {
                        providerCompleted = true;
                        shouldRefund = false;
                        commitPromise ||= commitApiQuota(request, reservationId);
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ finishReason, model: effectiveModel })}\n\n`));
                    }
                } catch { /* Never forward partial or malformed provider events. */ }
            }
        };
        const transformStream = new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
                carry += decoder.decode(chunk, { stream: true });
                const lines = carry.split("\n");
                carry = lines.pop() || "";
                processLines(lines, controller);
            },
            async flush(controller) {
                carry += decoder.decode();
                if (carry.trim()) processLines([carry], controller);
                if (!providerCompleted && deliveredContent) {
                    providerCompleted = true;
                    shouldRefund = false;
                    commitPromise ||= commitApiQuota(request, reservationId);
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ finishReason: "length", model: effectiveModel })}\n\n`));
                }
                if (commitPromise) await commitPromise;
                if (!providerCompleted && shouldRefund) {
                    shouldRefund = false;
                    await refundApiQuota(request, reservationId);
                }
            },
        });

        return new Response(response.body?.pipeThrough(transformStream), {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
                "X-ALLYX-Model": effectiveModel,
            },
        });
    } catch (error: unknown) {
        console.error("[Stream API] Error:", error);
        return Response.json({ error: "Stream failed" }, { status: 500 });
    }
}
