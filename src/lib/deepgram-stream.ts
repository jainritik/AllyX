export type LiveCaptionStream = { stop: () => void; finish: () => Promise<void> };

/** A single continuous WebM stream. Individual recorder blobs are not standalone files. */
export async function startDeepgramStream(options: {
    stream: MediaStream;
    sessionId: string;
    language: string;
    signal: AbortSignal;
    onCaption: (text: string, final: boolean) => void;
    onError: (message: string) => void;
}): Promise<LiveCaptionStream | null> {
    const response = await fetch('/api/transcribe/live', {
        method: 'POST',
        headers: { 'X-ALLYX-Session-ID': options.sessionId },
        signal: AbortSignal.any([options.signal, AbortSignal.timeout(10000)]),
    });
    if (response.status === 204) return null;
    if (!response.ok) throw new Error('Live captions could not connect. Using standard transcription.');
    const { token } = await response.json() as { token: string };
    if (options.signal.aborted) throw new Error('Capture cancelled');
    const params = new URLSearchParams({
        model: 'nova-3', language: options.language.split('-')[0],
        interim_results: 'true', punctuate: 'true', endpointing: '300',
    });
    if (!MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) throw new Error('Streaming audio is unsupported');
    const recorder = new MediaRecorder(options.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 64000 });
    const socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, ['bearer', token]);
    let closed = false;
    let finishing = false;
    let metadataReceived = false;
    let durationTimer: ReturnType<typeof setTimeout> | undefined;
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    let resolveFinish: (() => void) | undefined;
    let rejectFinish: ((error: Error) => void) | undefined;
    let finishPromise: Promise<void> | undefined;
    let rejectOpen: ((error: Error) => void) | undefined;
    const seenFinals = new Set<string>();
    const stop = () => {
        if (closed) return;
        closed = true;
        clearTimeout(durationTimer);
        clearTimeout(finishTimer);
        clearTimeout(openTimer);
        options.signal.removeEventListener('abort', stop);
        recorder.ondataavailable = null;
        recorder.onstop = null;
        if (recorder.state !== 'inactive') recorder.stop();
        socket.close();
        rejectOpen?.(new Error('Live connection closed'));
        rejectFinish?.(new Error('Live capture stopped before final transcript arrived'));
    };
    const fail = (message: string) => {
        if (closed) return;
        options.onError(message);
        stop();
    };
    const openTimer = setTimeout(() => fail('Live caption connection timed out.'), 8000);
    options.signal.addEventListener('abort', stop, { once: true });
    recorder.ondataavailable = event => {
        if (!event.data.size || closed) return;
        if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 1_000_000) {
            fail('Live captions lost their connection. Please record the question again.');
            return;
        }
        socket.send(event.data);
    };
    recorder.onerror = () => fail('Live audio recording failed. Please start listening again.');
    socket.onmessage = event => {
        if (closed || options.signal.aborted) return;
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'Error') {
                fail('The speech service could not transcribe this audio. Please check your Deepgram configuration.');
                return;
            }
            if (data.type === 'Metadata' && finishing) metadataReceived = true;
            if (data.type !== 'Results') return;
            const text = data.channel?.alternatives?.[0]?.transcript;
            if (typeof text !== 'string') return;
            const final = data.is_final === true;
            const id = `${data.start}:${data.duration}`;
            if (final && seenFinals.has(id)) return;
            if (final) seenFinals.add(id);
            options.onCaption(text.trim(), final);
        } catch {
            fail('The speech service returned an invalid caption. Please start listening again.');
        }
    };
    socket.onerror = () => fail('Live captions could not connect. Please check your connection and Deepgram credit.');
    socket.onclose = event => {
        if (closed) return;
        if (finishing && metadataReceived && event.code === 1000) {
            resolveFinish?.();
            rejectFinish = undefined;
            stop();
        } else {
            fail('Live captions disconnected before completion. Please record the full question again.');
        }
    };
    await new Promise<void>((resolve, reject) => {
        rejectOpen = reject;
        socket.onopen = () => {
            clearTimeout(openTimer);
            rejectOpen = undefined;
            if (closed || options.signal.aborted) { stop(); reject(new Error('Capture cancelled')); return; }
            try {
                recorder.start(100);
                // Trial sessions are intentionally bounded; this is not a provider spending cap.
                durationTimer = setTimeout(() => fail('The 10-minute live-caption trial session ended. Start listening again to continue.'), 10 * 60_000);
                resolve();
            } catch {
                stop();
                reject(new Error('Streaming audio is not supported on this device.'));
            }
        };
    });
    return {
        stop,
        finish() {
            if (finishPromise) return finishPromise;
            if (closed) return Promise.reject(new Error('Live captions are disconnected'));
            finishing = true;
            clearTimeout(durationTimer);
            finishPromise = new Promise<void>((resolve, reject) => {
                resolveFinish = resolve;
                rejectFinish = reject;
                finishTimer = setTimeout(() => fail('Final live captions timed out. No answer was generated.'), 8000);
                // ondataavailable runs before onstop, so the final audio precedes CloseStream.
                recorder.onstop = () => {
                    if (!closed && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'CloseStream' }));
                };
                recorder.stop();
            });
            return finishPromise;
        },
    };
}
