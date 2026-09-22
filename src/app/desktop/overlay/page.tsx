"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Eye, EyeOff, Minus, MousePointer2 } from "lucide-react";

export default function OverlayPage() {
    const [transcript, setTranscript] = useState("");
    const [answer, setAnswer] = useState("");
    const [isExpanded, setIsExpanded] = useState(true);
    const [interactive, setInteractive] = useState(true);
    const [opacity, setOpacity] = useState(82);
    const [fontSize, setFontSize] = useState(15);
    const answerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        document.documentElement.style.background = "transparent";
        document.body.style.background = "transparent";
        document.body.style.overflow = "hidden";

        const api = window.electronAPI;
        if (!api) return;
        queueMicrotask(() => setInteractive(api.getOverlayState?.().interactive ?? true));
        const removeTranscript = api.onTranscript(setTranscript);
        const removeAnswer = api.onAnswer((text) => {
            setAnswer(text);
            setIsExpanded(true);
        });
        const removeInteraction = api.onOverlayInteractionChange?.(setInteractive);

        return () => {
            removeTranscript?.();
            removeAnswer?.();
            removeInteraction?.();
            document.documentElement.style.background = "";
            document.body.style.background = "";
            document.body.style.overflow = "";
        };
    }, []);

    useEffect(() => {
        window.electronAPI?.resizeOverlay(isExpanded ? 480 : 320, isExpanded ? 460 : 220);
    }, [isExpanded]);

    useEffect(() => {
        answerRef.current?.scrollTo({ top: 0 });
    }, [answer]);

    const setClickThrough = () => {
        setInteractive(false);
        window.electronAPI?.setIgnoreMouseEvents(true, { forward: true });
    };

    return (
        <main className="h-screen w-screen overflow-hidden bg-transparent p-2 text-white">
            <section
                className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/15 shadow-2xl backdrop-blur-xl"
                style={{ backgroundColor: `rgba(9, 9, 11, ${opacity / 100})` }}
            >
                <header
                    className="flex min-h-11 items-center gap-2 border-b border-white/10 px-3"
                    style={{ WebkitAppRegion: interactive ? "drag" : "no-drag" } as React.CSSProperties}
                >
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                    <strong className="text-xs tracking-[0.16em]">ZEDX OVERLAY</strong>
                    <span className="ml-1 text-[10px] text-zinc-400">{interactive ? "Interactive" : "Click-through"}</span>
                    <div className="ml-auto flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                        <button onClick={setClickThrough} className="rounded-lg p-2 text-zinc-300 hover:bg-white/10" title="Click-through mode — unlock with Cmd/Ctrl+Shift+O">
                            <MousePointer2 size={15} />
                        </button>
                        <button onClick={() => window.electronAPI?.showApp()} className="rounded-lg p-2 text-zinc-300 hover:bg-white/10" title="Open full application">
                            <ExternalLink size={15} />
                        </button>
                        <button onClick={() => setIsExpanded(value => !value)} className="rounded-lg p-2 text-zinc-300 hover:bg-white/10" title={isExpanded ? "Compact overlay" : "Expand overlay"}>
                            {isExpanded ? <Minus size={15} /> : <Eye size={15} />}
                        </button>
                        <button onClick={() => window.electronAPI?.hideOverlay()} className="rounded-lg p-2 text-zinc-300 hover:bg-white/10" title="Hide overlay">
                            <EyeOff size={15} />
                        </button>
                    </div>
                </header>

                {!interactive && (
                    <div className="border-b border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] text-emerald-200">
                        Clicks pass through. Press ⌘⇧O on Mac or Ctrl+Shift+O on Windows to interact.
                    </div>
                )}

                {isExpanded ? (
                    <>
                        <div className="border-b border-white/10 px-4 py-2">
                            <div className="mb-1 text-[10px] font-bold tracking-wider text-zinc-500">LIVE QUESTION</div>
                            <div className="max-h-14 overflow-y-auto text-xs leading-relaxed text-zinc-300">
                                {transcript || "Listening for the next question…"}
                            </div>
                        </div>
                        <div className="min-h-0 flex-1 px-4 py-3">
                            <div className="mb-2 text-[10px] font-bold tracking-wider text-emerald-400">SUGGESTED ANSWER</div>
                            <div ref={answerRef} className="h-full overflow-y-auto whitespace-pre-wrap pr-2 text-zinc-100 selection:bg-emerald-500/30" style={{ fontSize, lineHeight: 1.55 }}>
                                {answer || <span className="text-zinc-500">The next generated answer will appear here automatically.</span>}
                            </div>
                        </div>
                        <footer className="flex items-center gap-3 border-t border-white/10 px-3 py-2 text-[10px] text-zinc-400" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                            <label className="flex items-center gap-2">
                                Opacity
                                <input aria-label="Overlay opacity" type="range" min="55" max="96" value={opacity} onChange={event => setOpacity(Number(event.target.value))} className="w-20 accent-emerald-400" />
                            </label>
                            <label className="ml-auto flex items-center gap-2">
                                Text
                                <input aria-label="Answer text size" type="range" min="12" max="20" value={fontSize} onChange={event => setFontSize(Number(event.target.value))} className="w-16 accent-emerald-400" />
                            </label>
                        </footer>
                    </>
                ) : (
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm leading-relaxed text-zinc-100" style={{ fontSize }}>
                        {answer || "Waiting for an answer…"}
                    </div>
                )}
            </section>
        </main>
    );
}
