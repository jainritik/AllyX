export type AnswerPair = { question: string; answer: string };
export type ActiveAnswerSnapshot = AnswerPair & { continuation: boolean };

// Snapshot before aborting: the stream's catch handler intentionally stops
// publishing state once End Interview begins.
export function includeActiveAnswer(pairs: AnswerPair[], active: ActiveAnswerSnapshot | null): AnswerPair[] {
    if (!active?.answer.trim()) return pairs;
    if (!active.continuation || !pairs.length) return [...pairs, { question: active.question, answer: active.answer }];
    return [...pairs.slice(0, -1), { ...pairs[pairs.length - 1], answer: `${pairs[pairs.length - 1].answer}\n\n${active.answer}` }];
}

export function readRecoverableInterview(accountId: string, contextSavedAt: number | undefined) {
    try {
        const draft = JSON.parse(localStorage.getItem('interview_draft') || 'null');
        if (!draft || draft.accountId !== accountId || !accountId
            || draft.contextSavedAt !== contextSavedAt
            || typeof draft.sessionId !== 'string'
            || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draft.sessionId)) return null;
        const hasPairs = Array.isArray(draft.qaPairs) && draft.qaPairs.some((pair: AnswerPair | null) =>
            pair && typeof pair.question === 'string' && typeof pair.answer === 'string' && pair.answer.trim());
        const hasText = [draft.fullTranscript, draft.transcript, draft.manualQuestion].some(value => typeof value === 'string' && value.trim());
        return hasPairs || hasText ? { sessionId: draft.sessionId as string } : null;
    } catch { return null; }
}
