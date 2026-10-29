// Show actionable categories without exposing raw database details to users.
export function interviewSaveErrorMessage(error: unknown): string {
    const outer = error && typeof error === "object" ? error as { message?: string; cause?: unknown } : {};
    const cause = outer.cause && typeof outer.cause === "object"
        ? outer.cause as { code?: string; message?: string; name?: string; status?: number } : {};
    const message = `${outer.message || ""} ${cause.message || ""}`;
    let reason = "The save could not be confirmed. Press End Interview to retry.";
    if (/not authenticated/i.test(message) || cause.status === 401 || cause.code === "PGRST301") {
        reason = "Your sign-in could not be verified. Copy your transcript before signing in again, then retry saving.";
    } else if (cause.code === "42501") {
        reason = "The database denied permission to save this interview. Contact support; changing your connection will not fix this.";
    } else if (["42P01", "42703", "PGRST204", "PGRST205"].includes(cause.code || "")) {
        reason = "Interview history needs a database configuration update. Contact support.";
    } else if (cause.name === "AbortError" || /abort|timeout|timed out/i.test(message)) {
        reason = "The save request timed out. Press End Interview to retry.";
    } else if (/fetch|network|connection/i.test(message)) {
        reason = "The save service could not be reached. Check your connection and press End Interview to retry.";
    }
    return `Could not save this interview. Your transcript is still on this screen. ${reason}`;
}
