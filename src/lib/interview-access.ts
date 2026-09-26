export type InterviewAccess = {
    allowed: boolean;
    source: "trial" | "credit" | "none";
    sessionId: string | null;
    expiresAt: string | null;
    remainingSeconds: number;
    creditsRemaining: number;
    trialAvailable?: boolean;
    creditRefunded?: boolean;
    reason?: string;
};

async function requestAccess(method: "GET" | "POST" | "DELETE", sessionId?: string, source?: "auto" | "trial" | "credit"): Promise<InterviewAccess> {
    const response = await fetch("/api/interview-access", {
        method,
        headers: sessionId ? { "Content-Type": "application/json" } : undefined,
        body: sessionId ? JSON.stringify({ sessionId, source }) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not verify interview access.");
    return payload as InterviewAccess;
}

export const interviewAccess = {
    status: () => requestAccess("GET"),
    start: (sessionId: string, source: "auto" | "trial" | "credit" = "auto") => requestAccess("POST", sessionId, source),
    finish: (sessionId: string) => requestAccess("DELETE", sessionId),
};
