export type InterviewAccess = {
    allowed: boolean;
    source: "trial" | "credit" | "none";
    sessionId: string | null;
    expiresAt: string | null;
    remainingSeconds: number;
    creditsRemaining: number;
    creditRefunded?: boolean;
    reason?: string;
};

async function requestAccess(method: "GET" | "POST" | "DELETE", sessionId?: string): Promise<InterviewAccess> {
    const response = await fetch("/api/interview-access", {
        method,
        headers: sessionId ? { "Content-Type": "application/json" } : undefined,
        body: sessionId ? JSON.stringify({ sessionId }) : undefined,
        cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not verify interview access.");
    return payload as InterviewAccess;
}

export const interviewAccess = {
    status: () => requestAccess("GET"),
    start: (sessionId: string) => requestAccess("POST", sessionId),
    finish: (sessionId: string) => requestAccess("DELETE", sessionId),
};
