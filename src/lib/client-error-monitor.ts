const RELEASE = "1.3.14";

export function reportClientError(error: unknown, componentStack?: string) {
    if (process.env.NODE_ENV !== "production" || typeof window === "undefined") return;
    const candidate = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown client error");
    const stack = [candidate.stack, componentStack].filter(Boolean).join("\n").slice(0, 2000);
    const payload = JSON.stringify({
        name: candidate.name || "Error",
        message: candidate.message || "Unknown client error",
        stack,
        route: window.location.pathname,
        release: RELEASE,
        runtime: window.electronAPI?.isElectron ? "desktop" : "browser",
    });
    void fetch("/api/monitoring/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
    }).catch(() => undefined);
}
