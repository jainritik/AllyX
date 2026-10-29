/** Limit concurrent uploads; callers retain sequence order when consuming results. */
export function createTranscriptionPool(concurrency = 2) {
    let active = 0;
    const waiting: Array<() => void> = [];
    const pump = () => {
        while (active < concurrency && waiting.length) {
            active++;
            waiting.shift()!();
        }
    };
    return {
        run<T>(task: () => Promise<T>): Promise<T> {
            return new Promise<T>((resolve, reject) => {
                waiting.push(() => {
                    Promise.resolve().then(task).then(resolve, reject).finally(() => { active--; pump(); });
                });
                pump();
            });
        },
    };
}
