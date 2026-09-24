import { NextRequest } from "next/server";
import { authorizeApi, isOpenAiModel, parseGenerationBody } from "@/lib/api-access";

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
        let effectiveModel = model;
        let response = await callProvider(model, requestedOpenAi);
        if (requestedOpenAi && (!response || !response.ok)) {
            if (response) console.warn(`[Stream API] OpenAI ${response.status}; falling back to Groq.`);
            effectiveModel = "openai/gpt-oss-120b";
            response = await callProvider(effectiveModel, false);
        }
        if (!response) return Response.json({ error: "AI server configuration missing" }, { status: 500 });
        if (!response.ok) {
            console.error("[Stream API] Provider Error:", await response.text());
            return Response.json({ error: "AI temporarily unavailable" }, { status: response.status });
        }

        const quota = await authorizeApi(request, "generate");
        if (quota.error) {
            await response.body?.cancel();
            return quota.error;
        }

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        let carry = "";
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
                    if (content) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                    const finishReason = providerEvent.choices?.[0]?.finish_reason;
                    if (finishReason) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ finishReason, model: effectiveModel })}\n\n`));
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
            flush(controller) {
                carry += decoder.decode();
                if (carry.trim()) processLines([carry], controller);
            },
        });

        return new Response(response.body?.pipeThrough(transformStream), {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
                "X-ZEDX-Model": effectiveModel,
            },
        });
    } catch (error: unknown) {
        console.error("[Stream API] Error:", error);
        return Response.json({ error: "Stream failed" }, { status: 500 });
    }
}
