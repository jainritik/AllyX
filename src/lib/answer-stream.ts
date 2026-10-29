/** Decode SSE across arbitrary network chunks, including a final line without a newline. */
export async function readAnswerStream(response: Response, onContent: (text: string) => void, onActivity: () => void = () => {}): Promise<string> {
    if (!response.body) throw new Error("The AI response stream was empty.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finishReason = "";
    let hasContent = false;
    const processLine = (line: string) => {
        if (!line.startsWith("data:")) return;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") return;
        let event;
        try { event = JSON.parse(payload); } catch { return; }
        if (typeof event.content === "string" && event.content) {
            hasContent = true;
            onContent(event.content);
        }
        if (typeof event.finishReason === "string") finishReason = event.finishReason;
    };
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (value?.length) onActivity();
            buffer += decoder.decode(value, { stream: !done });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            lines.forEach(processLine);
            if (done) break;
        }
        if (buffer.trim()) processLine(buffer);
        if (!hasContent) throw new Error("Empty response from AI.");
        // A transport ending without a finish marker is incomplete, not success.
        return finishReason || "length";
    } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
    }
}
