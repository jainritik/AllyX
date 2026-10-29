// Bound automatic requests so a provider stuck reporting "length" cannot
// generate indefinitely. Ordinary answers finish well before this guard.
export const MAX_ANSWER_SEGMENTS = 8;

export function shouldContinueAnswer(finishReason: string, completedSegments: number) {
    return finishReason === "length" && completedSegments < MAX_ANSWER_SEGMENTS;
}

export function buildAnswerContinuationMessages(question: string, answer: string): Array<{ role: "user" | "assistant"; content: string }> {
    // Preserve the question and exact answer tail, within the API's per-message
    // and total prompt limits. Never summarize code before resuming it.
    return [
        { role: "user", content: question.slice(0, 12000) },
        { role: "assistant", content: answer.slice(-12000) },
        { role: "user", content: "Continue immediately from the exact point where your answer stopped. Do not repeat prior text or add a preamble. If it stopped inside code, finish that code before closing its code fence. Complete every remaining part of the original question, including explanation and complexity when relevant." },
    ];
}
