import { NextRequest } from "next/server";
import { authorizeApi, parseGenerationBody } from "@/lib/api-access";

// Streaming AI Generation using Groq
// This endpoint returns Server-Sent Events (SSE) for real-time word-by-word responses

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    try {
        const access = await authorizeApi(request);
        if (access.error) return access.error;
        if (Number(request.headers.get("content-length")) > 50000) return Response.json({ error: "Request too large" }, { status: 413 });
        const parsed = parseGenerationBody(await request.json());
        if (!parsed) return Response.json({ error: "Invalid prompt, messages, or model" }, { status: 400 });
        const { model, messages, systemPrompt } = parsed;

        const groqApiKey = process.env.GROQ_API_KEY;

        if (!groqApiKey) {
            return new Response(
                JSON.stringify({ error: "Server AI configuration missing" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }
        const quota = await authorizeApi(request, "generate");
        if (quota.error) return quota.error;

        // Build messages array with system prompt
        const finalMessages = systemPrompt
            ? [{ role: "system", content: systemPrompt }, ...messages]
            : messages;

        // Request streaming response from Groq
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${groqApiKey}`
            },
            body: JSON.stringify({
                model: model || "llama-3.1-8b-instant",
                messages: finalMessages,
                max_tokens: 4096,
                temperature: 0.7,
                stream: true // Enable streaming
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error("[Stream API] Groq Error:", errorData);
            return new Response(
                JSON.stringify({ error: "AI temporarily unavailable" }),
                { status: response.status, headers: { "Content-Type": "application/json" } }
            );
        }

        // Create a TransformStream to process the SSE data
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        let carry = "";
        const processLines = (lines: string[], controller: TransformStreamDefaultController<Uint8Array>) => {
                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6);
                        if (data === "[DONE]") {
                            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                            return;
                        }

                        try {
                            const parsed = JSON.parse(data);
                            const content = parsed.choices?.[0]?.delta?.content;
                            if (content) {
                                // Send each token as SSE
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                            }
                        } catch {
                            // Ignore malformed provider events, never partial chunks.
                        }
                    }
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
            }
        });

        // Pipe the response through our transform
        const stream = response.body?.pipeThrough(transformStream);

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive"
            }
        });

    } catch (error: unknown) {
        console.error("[Stream API] Error:", error);
        return new Response(
            JSON.stringify({ error: "Stream failed" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}
