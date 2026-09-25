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

export async function loadInterviewContext(accountId: string): Promise<InterviewContext | null> {
    if (!accountId) return null;
    const { data, error } = await supabase
        .from("interview_setups")
        .select("job_context,resume_content,interview_type,language,model,updated_at")
        .eq("user_id", accountId)
        .maybeSingle();
    if (error) throw error;
    if (!data) return readInterviewContext(accountId);
    const context: InterviewContext = {
        accountId,
        jd: data.job_context,
        resume: data.resume_content,
        type: data.interview_type,
        lang: data.language,
        model: data.model,
        savedAt: new Date(data.updated_at).getTime(),
    };
    saveInterviewContext(context);
    return context;
}

export async function persistInterviewContext(context: Omit<InterviewContext, "savedAt">): Promise<InterviewContext> {
    const local = saveInterviewContext(context);
    const { data, error } = await supabase
        .from("interview_setups")
        .upsert({
            user_id: context.accountId,
            job_context: context.jd.trim(),
            resume_content: context.resume.trim(),
            interview_type: context.type,
            language: context.lang,
            model: context.model,
            updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" })
        .select("updated_at")
        .single();
    if (error) throw error;
    return { ...local, savedAt: new Date(data.updated_at).getTime() };
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
import { supabase } from "@/lib/supabase";
