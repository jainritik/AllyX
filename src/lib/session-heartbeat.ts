// Schedule only after the preceding check settles. Cleanup ignores late results.
export function startSessionHeartbeat<T>(
    check: () => Promise<T>,
    onResult: (value: T) => void,
    onError: (error: unknown) => void,
    interval = 15000,
): () => void {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
        try {
            const result = await check();
            if (!cancelled) onResult(result);
        } catch (error) {
            if (!cancelled) onError(error);
        } finally {
            if (!cancelled) timer = setTimeout(() => { void tick(); }, interval);
        }
    };
    void tick();
    return () => { cancelled = true; if (timer !== undefined) clearTimeout(timer); };
}
