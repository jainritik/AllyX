export type InterviewAccess = {
    allowed: boolean;
    source: "trial" | "credit" | "none";
    sessionId: string | null;
    expiresAt: string | null;
    remainingSeconds: number;
    creditsRemaining: number;
    trialAvailable?: boolean;
    hasPurchasedPack?: boolean;
    creditRefunded?: boolean;
    reason?: string;
};

async function requestAccess(method: "GET" | "POST" | "DELETE", sessionId?: string, source?: "auto" | "trial" | "credit"): Promise<InterviewAccess> {
    let lastError: unknown;
    const attempts = method === "DELETE" ? 3 : 2;
    for (let attempt = 0; attempt < attempts; attempt++) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 15_000);
        try {
            const response = await fetch("/api/interview-access", {
                method,
                headers: sessionId ? { "Content-Type": "application/json" } : undefined,
                body: sessionId ? JSON.stringify({ sessionId, source }) : undefined,
                cache: "no-store",
                signal: controller.signal,
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                const error = new Error(payload.error || "Could not verify interview access.");
                if (response.status < 500 || attempt === attempts - 1) throw error;
                lastError = error;
            } else {
                return payload as InterviewAccess;
            }
        } catch (error) {
            lastError = error;
            if (attempt === attempts - 1) break;
        } finally {
            window.clearTimeout(timeout);
        }
        await new Promise(resolve => window.setTimeout(resolve, 350 * (attempt + 1)));
    }
    if (lastError instanceof DOMException && lastError.name === "AbortError") {
        throw new Error("AllyX could not reach the session service. Your interview data is still safe.");
    }
    if (lastError instanceof TypeError) {
        throw new Error("AllyX could not reach the session service. Check your connection and try again.");
    }
    throw lastError instanceof Error ? lastError : new Error("Could not verify interview access.");
}

export const interviewAccess = {
    status: () => requestAccess("GET"),
    start: (sessionId: string, source: "auto" | "trial" | "credit" = "auto") => requestAccess("POST", sessionId, source),
    finish: (sessionId: string) => requestAccess("DELETE", sessionId),
    recoverPendingFinish: async () => {
        const sessionId = window.localStorage.getItem("allyx_pending_finish");
        if (!sessionId) return false;
        await requestAccess("DELETE", sessionId);
        window.localStorage.removeItem("allyx_pending_finish");
        return true;
    },
};
