import { NextRequest, NextResponse } from "next/server";
import { authorizeApi, commitApiQuota, refundApiQuota } from "@/lib/api-access";

export async function POST(request: NextRequest) {
    let quotaReserved = false;
    let reservationId = "";
    try {
        const access = await authorizeApi(request);
        if (access.error) return access.error;
        if (Number(request.headers.get("content-length")) > 4_200_000) return NextResponse.json({ error: "Audio is too large" }, { status: 413 });
        const formData = await request.formData();
        const file = formData.get("file");

        if (!(file instanceof File) || file.size === 0 || file.size > 4_000_000 || !file.type.startsWith("audio/")) {
            return NextResponse.json({ error: "A valid audio file under 4 MB is required" }, { status: 400 });
        }
        const model = formData.get("model")?.toString() || "whisper-large-v3-turbo";
        if (!["whisper-large-v3-turbo", "whisper-large-v3"].includes(model)) return NextResponse.json({ error: "Unsupported transcription model" }, { status: 400 });
        const language = formData.get("language")?.toString();
        if (language && !/^[a-z]{2}$/.test(language)) return NextResponse.json({ error: "Invalid language" }, { status: 400 });
        const userPrompt = formData.get("prompt")?.toString();
        if (userPrompt && userPrompt.length > 2000) return NextResponse.json({ error: "Prompt too long" }, { status: 400 });

        // Define API keys FIRST
        const API_KEYS = [
            process.env.GROQ_STT_KEY_1 || process.env.GROQ_API_KEY,
            process.env.GROQ_STT_KEY_2,
            process.env.GROQ_STT_KEY_3,
            process.env.GROQ_STT_KEY_4,
            process.env.GROQ_STT_KEY_5,
        ].filter(Boolean) as string[];

        // Use the received file directly as a Blob/File
        const audioFile = file;
        console.log(`[Transcribe API] Processing file: ${audioFile.name}, Type: ${audioFile.type}, Size: ${audioFile.size} bytes`);

        if (API_KEYS.length === 0) {
            console.error("[Transcribe API] No keys found! Check .env.local");
            return NextResponse.json({ error: "Server configuration error: No keys available" }, { status: 500 });
        }
        const quota = await authorizeApi(request, "transcribe");
        if (quota.error) return quota.error;
        reservationId = quota.reservationId || "";
        if (!reservationId) return NextResponse.json({ error: "Usage reservation failed" }, { status: 503 });
        quotaReserved = true;
        // Shuffle keys once to start randomly but consistently
        const shuffledKeys = [...API_KEYS].sort(() => Math.random() - 0.5);

        let lastError = null;
        const providerDeadline = Date.now() + 25000;

        // TRY MULTIPLE KEYS AUTOMATICALLY (Robustness)
        for (const apiKey of shuffledKeys) {
            try {
                const remainingMs = providerDeadline - Date.now();
                if (remainingMs <= 0) break;
                const maskedKey = apiKey.substring(0, 8) + '...';
                console.log(`[Transcribe API] Attempting with Key: ${maskedKey}`);

                const groqFormData = new FormData();
                // Use the file directly. Filename is important for Groq to detect format.
                groqFormData.append("file", audioFile, "audio.webm");
                groqFormData.append("model", model);
                groqFormData.append("temperature", "0");

                if (language) {
                    groqFormData.append("language", language);
                }

                if (userPrompt) {
                    groqFormData.append("prompt", userPrompt);
                }

                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), Math.min(20000, remainingMs));
                let response: Response;
                try {
                    response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${apiKey}`,
                        },
                        body: groqFormData,
                        signal: controller.signal,
                    });
                } finally {
                    clearTimeout(timeout);
                }

                if (response.ok) {
                    const data = await response.json();
                    const text = typeof data.text === "string" ? data.text.trim() : "";
                    if (!text) {
                        await refundApiQuota(request, reservationId);
                        quotaReserved = false;
                        return NextResponse.json({ text: "" });
                    }
                    await commitApiQuota(request, reservationId);
                    quotaReserved = false;
                    return NextResponse.json({ text });
                }

                // If not ok, capture error and try next key
                const errorBody = await response.text();
                lastError = { status: response.status, body: errorBody };
                console.warn(`[Transcribe API] Key ${maskedKey} failed (${response.status}). Body: ${errorBody.substring(0, 200)}`);

                // If it's a 413 (File too large) or 400 (Bad Request/Invalid File), don't retry.
                // Retrying a bad file with a different key won't fix it and just wastes limits.
                if (response.status === 413 || response.status === 400) {
                    console.warn(`[Transcribe API] Aborting retry for status ${response.status}`);
                    break;
                }

            } catch (err: unknown) {
                const error = err as Error;
                lastError = error;
                console.error(`[Transcribe API] Fetch failed for key. Trying next...`, error.message);
            }
        }

        // If we reach here, ALL keys failed
        await refundApiQuota(request, reservationId);
        quotaReserved = false;
        return NextResponse.json({
            error: "All Groq keys failed or rate limited.",
            details: process.env.NODE_ENV === "development" ? lastError : undefined
        }, { status: 503 });

    } catch (error: unknown) {
        if (quotaReserved) await refundApiQuota(request, reservationId);
        const err = error as Error;
        console.error("[Transcribe API] Internal Error:", err);
        const isDev = process.env.NODE_ENV === 'development';
        return NextResponse.json({
            error: isDev ? err.message : "An error occurred. Please try again."
        }, { status: 500 });
    }
}
