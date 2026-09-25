export const INTERVIEW_CONTEXT_KEY = "allyx_interview_context";
export const RESUME_HANDOFF_KEY = "allyx_resume_handoff";

export interface InterviewContext {
    accountId: string;
    jd: string;
    resume: string;
    type: string;
    lang: string;
    model: string;
    savedAt: number;
}

export function saveInterviewContext(context: Omit<InterviewContext, "savedAt">): InterviewContext {
    if (!context.accountId) throw new Error("Your account session is not ready. Reload and try again.");
    if (context.jd.trim().length <= 10 || context.resume.trim().length <= 10) {
        throw new Error("Add a job description and resume before starting.");
    }

    const saved = { ...context, savedAt: Date.now() };
    const serialized = JSON.stringify(saved);
    localStorage.setItem(INTERVIEW_CONTEXT_KEY, serialized);
    if (localStorage.getItem(INTERVIEW_CONTEXT_KEY) !== serialized) {
        throw new Error("Interview setup could not be saved.");
    }
    return saved;
}

export function readInterviewContext(accountId: string): InterviewContext | null {
    if (!accountId) return null;
    const value = JSON.parse(localStorage.getItem(INTERVIEW_CONTEXT_KEY) || "null") as Partial<InterviewContext> | null;
    if (!value || value.accountId !== accountId || typeof value.jd !== "string" || typeof value.resume !== "string" ||
        typeof value.type !== "string" || typeof value.lang !== "string" || typeof value.model !== "string") return null;
    if (value.jd.trim().length <= 10 || value.resume.trim().length <= 10) return null;
    return value as InterviewContext;
}

export function saveResumeHandoff(accountId: string, resume: string) {
    if (!accountId || !resume.trim()) throw new Error("Resume selection could not be saved.");
    sessionStorage.setItem(RESUME_HANDOFF_KEY, JSON.stringify({ accountId, resume }));
}

export function consumeResumeHandoff(accountId: string): string | null {
    const raw = sessionStorage.getItem(RESUME_HANDOFF_KEY);
    sessionStorage.removeItem(RESUME_HANDOFF_KEY);
    if (!raw || !accountId) return null;
    const value = JSON.parse(raw) as { accountId?: unknown; resume?: unknown };
    return value.accountId === accountId && typeof value.resume === "string" ? value.resume : null;
}
