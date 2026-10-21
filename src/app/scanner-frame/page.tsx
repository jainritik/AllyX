"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Scan, X, Loader2, Target, ChevronDown } from "lucide-react";

type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | null;

export default function ScannerFrame() {
    const [isScanning, setIsScanning] = useState(false);
    const [isResizing, setIsResizing] = useState<ResizeDirection>(null);
    const [isMoving, setIsMoving] = useState(false);
    const [captureMessage, setCaptureMessage] = useState("Position this frame over text, then press Capture.");
    const [captureFailed, setCaptureFailed] = useState(false);
    const [settingsRequired, setSettingsRequired] = useState(false);
    const [restartRequired, setRestartRequired] = useState(false);
    const [pickerFallbackAvailable, setPickerFallbackAvailable] = useState(false);
    const [isPickingScreen, setIsPickingScreen] = useState(false);
    const [pickerPreview, setPickerPreview] = useState<string | null>(null);
    const [pickerPreviewAspect, setPickerPreviewAspect] = useState(16 / 9);
    const [pickerCrop, setPickerCrop] = useState({ x: 0.08, y: 0.08, width: 0.84, height: 0.84 });
    const [isSelectingPickerCrop, setIsSelectingPickerCrop] = useState(false);
    const initialPos = useRef({ x: 0, y: 0, width: 0, height: 0, mouseX: 0, mouseY: 0 });
    const lastUpdate = useRef<number>(0);
    const pickerSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const pickerCropStartRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        document.body.style.background = 'transparent';
        document.documentElement.style.background = 'transparent';

        const style = document.createElement('style');
        style.innerHTML = `* { cursor: auto !important; } .drag-handle { cursor: move !important; } button { cursor: pointer !important; } .resize-cursor-nwse { cursor: nwse-resize !important; } .resize-cursor-nesw { cursor: nesw-resize !important; } .resize-cursor-ns { cursor: ns-resize !important; } .resize-cursor-ew { cursor: ew-resize !important; }`;
        document.head.appendChild(style);
    }, []);

    const handleScan = async () => {
        if (isScanning) return;
        setIsScanning(true);
        setCaptureFailed(false);
        setSettingsRequired(false);
        setRestartRequired(false);
        setPickerFallbackAvailable(false);
        setCaptureMessage("Capturing…");
        try {
            if (!window.electronAPI) {
                setCaptureFailed(true);
                setCaptureMessage("Screen Capture is available in the AllyX desktop app.");
                return;
            }
            const bounds = {
                x: window.screenX,
                y: window.screenY,
                width: window.innerWidth,
                height: window.innerHeight
            };
            const result = await window.electronAPI.captureScannerArea(bounds);
            setCaptureFailed(!result.success);
            setSettingsRequired(Boolean(result.settingsRequired));
            setRestartRequired(Boolean(result.restartRequired));
            setPickerFallbackAvailable(Boolean(result.pickerFallbackAvailable));
            setCaptureMessage(result.success ? "Captured. Reading the selected text…" : (result.error || "Capture failed. Try again."));
        } catch (err) {
            console.error("Scan failed:", err);
            setCaptureFailed(true);
            setSettingsRequired(false);
            setRestartRequired(false);
            setCaptureMessage(err instanceof Error ? err.message : "Capture failed.");
        } finally {
            setTimeout(() => setIsScanning(false), 2000);
        }
    };

    const resetPickerPreview = () => {
        pickerSourceCanvasRef.current = null;
        setPickerPreview(null);
        setIsSelectingPickerCrop(false);
        setPickerCrop({ x: 0.08, y: 0.08, width: 0.84, height: 0.84 });
    };

    const captureWithSystemPicker = async () => {
        if (isPickingScreen || isScanning || !navigator.mediaDevices?.getDisplayMedia) return;
        let stream: MediaStream | null = null;
        setIsPickingScreen(true);
        setCaptureFailed(false);
        setCaptureMessage("Choose the screen or window that contains the text.");
        try {
            // This must be called directly from the button click. The system picker
            // is the customer's explicit choice; AllyX never picks a display itself.
            stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            const video = document.createElement("video");
            video.muted = true;
            video.playsInline = true;
            video.srcObject = stream;
            await new Promise<void>((resolve, reject) => {
                const timeout = window.setTimeout(() => reject(new Error("The selected screen did not become ready. Try again.")), 10000);
                video.onloadedmetadata = () => {
                    window.clearTimeout(timeout);
                    resolve();
                };
                video.onerror = () => {
                    window.clearTimeout(timeout);
                    reject(new Error("The selected screen could not be captured."));
                };
            });
            await video.play();
            await new Promise<void>(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
            if (!video.videoWidth || !video.videoHeight) throw new Error("The selected screen returned an empty image.");

            const sourceCanvas = document.createElement("canvas");
            sourceCanvas.width = video.videoWidth;
            sourceCanvas.height = video.videoHeight;
            const sourceContext = sourceCanvas.getContext("2d");
            if (!sourceContext) throw new Error("The selected screen could not be prepared.");
            sourceContext.drawImage(video, 0, 0, sourceCanvas.width, sourceCanvas.height);
            pickerSourceCanvasRef.current = sourceCanvas;

            const previewLimit = 1200;
            const previewScale = Math.min(1, previewLimit / Math.max(sourceCanvas.width, sourceCanvas.height));
            const previewCanvas = document.createElement("canvas");
            previewCanvas.width = Math.max(1, Math.round(sourceCanvas.width * previewScale));
            previewCanvas.height = Math.max(1, Math.round(sourceCanvas.height * previewScale));
            const previewContext = previewCanvas.getContext("2d");
            if (!previewContext) throw new Error("The selected screen preview could not be prepared.");
            previewContext.drawImage(sourceCanvas, 0, 0, previewCanvas.width, previewCanvas.height);
            setPickerPreview(previewCanvas.toDataURL("image/png"));
            setPickerPreviewAspect(previewCanvas.width / previewCanvas.height);
            setPickerCrop({ x: 0.08, y: 0.08, width: 0.84, height: 0.84 });
            setCaptureMessage("Drag over the text to read, then press Read selected text.");
        } catch (error) {
            const cancelled = error instanceof DOMException && ["NotAllowedError", "AbortError"].includes(error.name);
            setCaptureFailed(true);
            setCaptureMessage(cancelled
                ? "No screen was selected. Nothing was captured."
                : error instanceof Error ? error.message : "The macOS screen picker could not capture a screen.");
        } finally {
            stream?.getTracks().forEach(track => track.stop());
            setIsPickingScreen(false);
        }
    };

    const pickerPoint = (event: React.PointerEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        return {
            x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
            y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
        };
    };

    const startPickerCrop = (event: React.PointerEvent<HTMLDivElement>) => {
        const point = pickerPoint(event);
        pickerCropStartRef.current = point;
        setPickerCrop({ x: point.x, y: point.y, width: 0.01, height: 0.01 });
        setIsSelectingPickerCrop(true);
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const updatePickerCrop = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!isSelectingPickerCrop) return;
        const point = pickerPoint(event);
        const start = pickerCropStartRef.current;
        setPickerCrop({
            x: Math.min(start.x, point.x),
            y: Math.min(start.y, point.y),
            width: Math.max(0.01, Math.abs(point.x - start.x)),
            height: Math.max(0.01, Math.abs(point.y - start.y)),
        });
    };

    const finishPickerCrop = () => setIsSelectingPickerCrop(false);

    const submitPickerCrop = async () => {
        const sourceCanvas = pickerSourceCanvasRef.current;
        if (!sourceCanvas || !window.electronAPI?.deliverPickerCapture || isScanning) return;
        setIsScanning(true);
        setCaptureFailed(false);
        setCaptureMessage("Preparing the selected text…");
        try {
            const sourceX = Math.floor(sourceCanvas.width * pickerCrop.x);
            const sourceY = Math.floor(sourceCanvas.height * pickerCrop.y);
            const sourceWidth = Math.max(1, Math.floor(sourceCanvas.width * pickerCrop.width));
            const sourceHeight = Math.max(1, Math.floor(sourceCanvas.height * pickerCrop.height));
            const maxEdge = 2400;
            const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
            const output = document.createElement("canvas");
            output.width = Math.max(1, Math.round(sourceWidth * scale));
            output.height = Math.max(1, Math.round(sourceHeight * scale));
            const context = output.getContext("2d");
            if (!context) throw new Error("The selected text could not be prepared.");
            context.drawImage(sourceCanvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, output.width, output.height);
            const result = await window.electronAPI.deliverPickerCapture(output.toDataURL("image/png"));
            if (!result.success) throw new Error(result.error || "AllyX could not read the selected image.");
            resetPickerPreview();
            setCaptureMessage("Captured. Reading the selected text…");
        } catch (error) {
            setCaptureFailed(true);
            setCaptureMessage(error instanceof Error ? error.message : "The selected image could not be read.");
        } finally {
            setIsScanning(false);
        }
    };

    const openScreenRecordingSettings = async () => {
        const result = await window.electronAPI?.openScreenRecordingSettings();
        if (result?.success) {
            setCaptureMessage("Allow AllyX in Screen & System Audio Recording, then press Restart AllyX. Closing its window only hides the app.");
            setRestartRequired(true);
            return;
        }
        if (result?.error) setCaptureMessage(result.error);
    };

    // --- MANUAL MOVE LOGIC ---
    const startMoving = (e: React.MouseEvent) => {
        if (isResizing) return;
        setIsMoving(true);
        initialPos.current = {
            x: window.screenX,
            y: window.screenY,
            width: window.innerWidth,
            height: window.innerHeight,
            mouseX: e.screenX,
            mouseY: e.screenY
        };
    };

    // --- MANUAL RESIZE LOGIC ---
    const startResizing = (dir: ResizeDirection, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(dir);

        initialPos.current = {
            x: window.screenX,
            y: window.screenY,
            width: window.innerWidth,
            height: window.innerHeight,
            mouseX: e.screenX,
            mouseY: e.screenY
        };
    };

    const doInteraction = useCallback((e: MouseEvent) => {
        if ((!isResizing && !isMoving) || !window.electronAPI) return;

        const now = Date.now();
        if (now - lastUpdate.current < 16) return;
        lastUpdate.current = now;

        const deltaX = (e.screenX - initialPos.current.mouseX);
        const deltaY = (e.screenY - initialPos.current.mouseY);

        if (isMoving) {
            window.electronAPI.updateScannerBounds({
                x: initialPos.current.x + deltaX,
                y: initialPos.current.y + deltaY,
                width: initialPos.current.width,
                height: initialPos.current.height
            });
            return;
        }

        if (isResizing) {
            let newX = initialPos.current.x;
            let newY = initialPos.current.y;
            let newWidth = initialPos.current.width;
            let newHeight = initialPos.current.height;

            if (isResizing.includes("e")) newWidth = Math.max(200, initialPos.current.width + deltaX);
            if (isResizing.includes("w")) {
                const potentialWidth = initialPos.current.width - deltaX;
                if (potentialWidth >= 200) {
                    newWidth = potentialWidth;
                    newX = initialPos.current.x + deltaX;
                }
            }
            if (isResizing.includes("s")) newHeight = Math.max(150, initialPos.current.height + deltaY);
            if (isResizing.includes("n")) {
                const potentialHeight = initialPos.current.height - deltaY;
                if (potentialHeight >= 150) {
                    newHeight = potentialHeight;
                    newY = initialPos.current.y + deltaY;
                }
            }

            window.electronAPI.updateScannerBounds({
                x: newX,
                y: newY,
                width: newWidth,
                height: newHeight
            });
        }
    }, [isResizing, isMoving]);

    const stopInteraction = useCallback(() => {
        setIsResizing(null);
        setIsMoving(false);
    }, []);

    useEffect(() => {
        if (isResizing || isMoving) {
            window.addEventListener("mousemove", doInteraction);
            window.addEventListener("mouseup", stopInteraction);
            return () => {
                window.removeEventListener("mousemove", doInteraction);
                window.removeEventListener("mouseup", stopInteraction);
            };
        }
    }, [isResizing, isMoving, doInteraction, stopInteraction]);

    return (
        <div className="w-screen h-screen bg-transparent p-0 flex flex-col select-none overflow-hidden relative border-none">

            {/* --- MAIN UI FRAME --- */}
            <div className={`
                flex-1 flex flex-col bg-black/60 backdrop-blur-md relative overflow-hidden
                border-2 ${isResizing ? 'border-red-500 shadow-[0_0_25px_rgba(239,68,68,0.5)]' : 'border-emerald-500/80 shadow-[0_0_20px_rgba(16,185,129,0.3)]'}
                rounded-md transition-all duration-100 m-1
            `}>
                {/* Header doubles as a drag handle so the selection stays on the intended display. */}
                <div
                    onMouseDown={startMoving}
                    className="h-9 bg-emerald-600/20 border-b border-emerald-500/40 flex items-center justify-between px-3 drag-handle"
                >
                    <div className="flex items-center gap-2">
                        <Target size={14} className="text-emerald-400 animate-pulse" />
                        <span className="text-[10px] font-mono font-black text-emerald-400 tracking-[0.2em] uppercase">
                            SCREEN CAPTURE
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); window.electronAPI?.toggleScannerFrame(); }}
                            className="p-1 hover:bg-red-600 rounded transition-all text-emerald-400 hover:text-white"
                        >
                            <X size={16} strokeWidth={3} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 relative flex items-center justify-center">
                    {/* Scanning Animation */}
                    {isScanning && (
                        <div className="absolute inset-0 z-50 pointer-events-none">
                            <div className="absolute inset-x-0 h-[2px] bg-red-500 shadow-[0_0_20px_rgba(255,0,0,1)] animate-[scan_1.3s_linear_infinite]" />
                            <div className="absolute inset-0 bg-red-950/30 backdrop-blur-[2px] flex flex-col items-center justify-center">
                                <Loader2 size={32} className="text-red-500 animate-spin" />
                                <span className="text-[12px] font-mono text-white font-black tracking-[0.3em] mt-3">ANALYZING</span>
                            </div>
                        </div>
                    )}

                    {pickerPreview ? (
                        <div className="z-40 flex h-full w-full flex-col items-center justify-center gap-2 p-3">
                            <p className="text-center text-[10px] font-semibold text-emerald-100">Drag a box over the text you want AllyX to read.</p>
                            <div
                                className="relative max-h-[62%] w-full max-w-[94%] touch-none overflow-hidden rounded border border-emerald-300/80 bg-black"
                                style={{ aspectRatio: pickerPreviewAspect }}
                                onPointerDown={startPickerCrop}
                                onPointerMove={updatePickerCrop}
                                onPointerUp={finishPickerCrop}
                                onPointerCancel={finishPickerCrop}
                            >
                                {/* This is a one-frame local preview. The stream has already stopped. */}
                                <img src={pickerPreview} alt="Selected screen preview" draggable={false} className="pointer-events-none h-full w-full object-contain" />
                                <div
                                    className="pointer-events-none absolute border-2 border-emerald-300 bg-emerald-400/15 shadow-[0_0_0_999px_rgba(0,0,0,0.28)]"
                                    style={{ left: `${pickerCrop.x * 100}%`, top: `${pickerCrop.y * 100}%`, width: `${pickerCrop.width * 100}%`, height: `${pickerCrop.height * 100}%` }}
                                />
                            </div>
                            <div className="flex flex-wrap justify-center gap-2">
                                <button type="button" onClick={resetPickerPreview} className="rounded-md border border-white/30 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-white/10">Cancel</button>
                                <button type="button" onClick={() => { void submitPickerCrop(); }} disabled={isScanning} className="rounded-md bg-emerald-500 px-3 py-1.5 text-[11px] font-bold text-black hover:bg-emerald-400 disabled:opacity-60">Read selected text</button>
                            </div>
                        </div>
                    ) : (
                    <div className="z-40">
                        <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={handleScan}
                            disabled={isScanning || !!isResizing || isMoving}
                            className={`
                                flex items-center gap-3 px-10 py-3 rounded-full border-2 transition-all duration-300 shadow-2xl active:scale-95
                                ${isScanning
                                    ? 'bg-red-700 border-red-500 text-white'
                                    : 'bg-emerald-600 border-emerald-400 text-white hover:bg-emerald-500'
                                }
                            `}
                        >
                            <Scan size={20} strokeWidth={3} />
                            <span className="text-[14px] font-mono font-black uppercase tracking-widest leading-none">
                                {isScanning ? 'WAIT' : 'CAPTURE'}
                            </span>
                        </button>
                    </div>
                    )}

                    <div aria-live="polite" className={`absolute bottom-3 left-3 right-3 flex flex-col items-center rounded-lg px-3 py-2 ${captureFailed ? 'border border-red-400/70 bg-red-950/90' : 'bg-black/70'}`}>
                        <span className={`max-w-full text-center text-[11px] font-semibold leading-4 ${captureFailed ? 'text-red-100' : 'text-emerald-200'}`}>{captureMessage}</span>
                        {captureFailed && (settingsRequired || restartRequired) && (
                            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                                {settingsRequired && (
                                    <button
                                        type="button"
                                        onMouseDown={(event) => event.stopPropagation()}
                                        onClick={() => { void openScreenRecordingSettings(); }}
                                        className="rounded-md bg-white px-3 py-1 text-[11px] font-bold text-red-800 transition-colors hover:bg-red-100"
                                    >
                                        Open System Settings
                                    </button>
                                )}
                                {restartRequired && (
                                    <button
                                        type="button"
                                        onMouseDown={(event) => event.stopPropagation()}
                                        onClick={() => window.electronAPI?.relaunchApp()}
                                        className="rounded-md border border-red-200 px-3 py-1 text-[11px] font-bold text-white transition-colors hover:bg-red-900"
                                    >
                                        Restart AllyX
                                    </button>
                                )}
                            </div>
                        )}
                        {captureFailed && !settingsRequired && !restartRequired && (
                            <div className="mt-1 flex flex-col items-center gap-2">
                                <span className="text-center text-[10px] font-medium text-red-100/90">Try Capture again. AllyX keeps the frame open so you can retry.</span>
                                {pickerFallbackAvailable && !pickerPreview && (
                                    <button
                                        type="button"
                                        onMouseDown={(event) => event.stopPropagation()}
                                        onClick={() => { void captureWithSystemPicker(); }}
                                        disabled={isPickingScreen || isScanning}
                                        className="rounded-md border border-emerald-200 bg-emerald-500 px-3 py-1 text-[11px] font-bold text-black transition-colors hover:bg-emerald-400 disabled:opacity-60"
                                    >
                                        {isPickingScreen ? "Opening picker…" : "Choose a screen in macOS picker"}
                                    </button>
                                )}
                            </div>
                        )}
                        {!captureFailed && <ChevronDown size={12} className="mt-1 animate-bounce text-emerald-400" />}
                    </div>
                </div>
            </div>

            {/* --- RESIZE HANDLES (PLACED LAST TO BE ON TOP) --- */}
            <div className="absolute inset-0 pointer-events-none z-[9999]">
                {/* 4 Corners - Visible for feedback */}
                <div onMouseDown={(e) => startResizing("nw", e)} className="absolute top-0 left-0 w-8 h-8 resize-cursor-nwse pointer-events-auto z-[1001] bg-emerald-500/5 hover:bg-emerald-500/40 border-t border-l border-emerald-500/20" />
                <div onMouseDown={(e) => startResizing("ne", e)} className="absolute top-0 right-0 w-8 h-8 resize-cursor-nesw pointer-events-auto z-[1001] bg-emerald-500/5 hover:bg-emerald-500/40 border-t border-r border-emerald-500/20" />
                <div onMouseDown={(e) => startResizing("sw", e)} className="absolute bottom-0 left-0 w-8 h-8 resize-cursor-nesw pointer-events-auto z-[1001] bg-emerald-500/5 hover:bg-emerald-500/40 border-b border-l border-emerald-500/20" />
                <div onMouseDown={(e) => startResizing("se", e)} className="absolute bottom-0 right-0 w-8 h-8 resize-cursor-nwse pointer-events-auto z-[1001] bg-emerald-500/5 hover:bg-emerald-500/40 border-b border-r border-emerald-500/20" />

                {/* 4 Sides */}
                <div onMouseDown={(e) => startResizing("n", e)} className="absolute top-0 inset-x-8 h-4 resize-cursor-ns pointer-events-auto z-[1000] hover:bg-emerald-500/20" />
                <div onMouseDown={(e) => startResizing("s", e)} className="absolute bottom-0 inset-x-8 h-4 resize-cursor-ns pointer-events-auto z-[1000] hover:bg-emerald-500/20" />
                <div onMouseDown={(e) => startResizing("e", e)} className="absolute right-0 inset-y-8 w-4 resize-cursor-ew pointer-events-auto z-[1000] hover:bg-emerald-500/20" />
                <div onMouseDown={(e) => startResizing("w", e)} className="absolute left-0 inset-y-8 w-4 resize-cursor-ew pointer-events-auto z-[1000] hover:bg-emerald-500/20" />
            </div>

            <style jsx global>{`
                @keyframes scan {
                    0% { transform: translateY(-50px); }
                    100% { transform: translateY(100vh); }
                }
                body {
                    background: transparent !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    overflow: hidden !important;
                }
            `}</style>
        </div>
    );
}
