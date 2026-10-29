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

class SessionRequestError extends Error {
    constructor(message: string, readonly retryable: boolean, readonly status: number) {
        super(message);
    }
}

export function isSessionAuthenticationError(error: unknown): boolean {
    return error instanceof SessionRequestError && [401, 403].includes(error.status);
}

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
                const error = new SessionRequestError(payload.error || "Could not verify interview access.", response.status >= 500, response.status);
                if (response.status < 500 || attempt === attempts - 1) throw error;
                lastError = error;
            } else {
                return payload as InterviewAccess;
            }
        } catch (error) {
            if (error instanceof SessionRequestError && !error.retryable) throw error;
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
    check: async (sessionId: string): Promise<InterviewAccess> => {
        const access = await requestAccess("GET");
        if (access.sessionId !== sessionId) return {
            ...access, allowed: false,
            reason: "This interview session is no longer active. End it to save your transcript before starting another.",
        };
        return access;
    },
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
