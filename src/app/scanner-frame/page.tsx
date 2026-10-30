"use client";

import { useEffect, useState } from "react";
import { Scan, X, Loader2, Target, ChevronDown } from "lucide-react";

export default function ScannerFrame() {
    const [isScanning, setIsScanning] = useState(false);
    const [windowMode, setWindowMode] = useState(false);
    const [windows, setWindows] = useState<{ id: string; name: string }[]>([]);
    const [preview, setPreview] = useState<{ id: number; imageData: string } | null>(null);
    const [contentTop, setContentTop] = useState<number | null>(null);
    const [windowError, setWindowError] = useState('');
    const openWindowPicker = async () => {
        setWindowMode(true); setIsScanning(true); setPreview(null); setContentTop(null); setWindowError('');
        try {
            if (!window.electronAPI?.listScannerWindows) throw new Error('Install the latest AllyX build to capture webpage content. Selected-area capture is still available.');
            const result = await window.electronAPI.listScannerWindows();
            if (!result.success) throw new Error(result.error);
            setWindows(result.windows);
            if (!result.windows.length) setWindowError('No windows are available. Open your browser, then try again.');
        } catch (error) { setWindowError(error instanceof Error ? error.message : 'Could not list windows.'); }
        finally { setIsScanning(false); }
    };
    const previewWindow = async (id: string) => {
        setPreview(null); setContentTop(null); setWindowError('');
        if (!id) return;
        setIsScanning(true);
        try {
            const result = await window.electronAPI?.previewScannerWindow?.(id);
            if (!result?.success || !result.imageData || result.id === undefined) throw new Error(result?.error || 'Could not preview this window.');
            setPreview({ id: result.id, imageData: result.imageData });
        } catch (error) { setWindowError(error instanceof Error ? error.message : 'Could not preview this window.'); }
        finally { setIsScanning(false); }
    };
    const capturePage = async () => {
        if (isScanning || !preview || contentTop === null) return;
        setIsScanning(true); setWindowError('');
        try {
            const result = await window.electronAPI?.captureScannerPage?.(preview.id, contentTop);
            if (!result?.success) throw new Error(result?.error || 'Could not capture this webpage.');
        } catch (error) { setWindowError(error instanceof Error ? error.message : 'Capture failed.'); }
        finally { setIsScanning(false); }
    };
    const [captureMessage, setCaptureMessage] = useState("Move and resize this frame around the question. Only the area inside this frame will be read. For a browser, choose Capture webpage content to exclude tabs and the address bar.");
    const [captureFailed, setCaptureFailed] = useState(false);
    const [setupPending, setSetupPending] = useState(false);
    const [settingsRequired, setSettingsRequired] = useState(false);
    const [restartRequired, setRestartRequired] = useState(false);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        document.body.style.background = 'transparent';
        document.documentElement.style.background = 'transparent';

        const style = document.createElement('style');
        style.innerHTML = `* { cursor: auto !important; } .drag-handle { cursor: move !important; } button { cursor: pointer !important; } .resize-cursor-nwse { cursor: nwse-resize !important; } .resize-cursor-nesw { cursor: nesw-resize !important; } .resize-cursor-ns { cursor: ns-resize !important; } .resize-cursor-ew { cursor: ew-resize !important; }`;
        document.head.appendChild(style);
    }, []);

    const requestCapture = async () => {
        if (isScanning) return;
        setIsScanning(true);
        setCaptureFailed(false);
        setSetupPending(false);
        setSettingsRequired(false);
        setRestartRequired(false);
        setCaptureMessage("Capturing…");
        try {
            if (!window.electronAPI) {
                setCaptureFailed(true);
                setCaptureMessage("Screen Capture is available in the AllyX desktop app.");
                return;
            }
            // The desktop process reads the native selection-frame bounds. It
            // avoids browser screen-coordinate scaling differences on Retina
            // and scaled macOS displays.
            const result = await window.electronAPI.captureScannerArea();
            const waitingForConsent = Boolean(result.setupPending);
            setCaptureFailed(!result.success && !waitingForConsent);
            setSetupPending(waitingForConsent);
            setSettingsRequired(Boolean(result.settingsRequired));
            setRestartRequired(Boolean(result.restartRequired));
            setCaptureMessage(result.success ? "Captured. Reading the selected text…" : (result.error || "Capture failed. Try again."));
        } catch (err) {
            console.error("Scan failed:", err);
            setCaptureFailed(true);
            setSetupPending(false);
            setSettingsRequired(false);
            setRestartRequired(false);
            setCaptureMessage(err instanceof Error ? err.message : "Capture failed.");
        } finally {
            // A source lookup can legitimately take several seconds while
            // macOS wakes ScreenCaptureKit. Keep the controls disabled until
            // its IPC request actually finishes; an arbitrary two-second
            // timeout let customers start a conflicting second capture.
            setIsScanning(false);
        }
    };

    const handleSelectedAreaCapture = () => { void requestCapture(); };


    const openScreenRecordingSettings = async () => {
        const result = await window.electronAPI?.openScreenRecordingSettings();
        if (result?.success) {
            setCaptureMessage("Allow AllyX in Screen & System Audio Recording, then press Restart AllyX. Closing its window only hides the app.");
            setRestartRequired(true);
            return;
        }
        if (result?.error) setCaptureMessage(result.error);
    };

    if (windowMode) return (
        <div className="h-screen overflow-auto bg-slate-950 p-3 text-white text-xs">
            <div className="flex items-center justify-between gap-2 mb-2">
                <strong>Capture visible webpage</strong>
                <button disabled={isScanning} onClick={() => { setWindowMode(false); setPreview(null); }} className="rounded border px-2 py-1">Back</button>
            </div>
            <p className="mb-2">Choose your browser window. Then click the preview just below the tabs, address bar, and bookmarks. Only the content below the green line will be read.</p>
            <select aria-label="Browser window" defaultValue="" disabled={isScanning} onChange={event => { void previewWindow(event.target.value); }} className="w-full bg-slate-800 p-2 mb-2">
                <option value="">Select a window…</option>
                {windows.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            {preview && <>
                <button type="button" aria-label="Mark the top edge of webpage content" disabled={isScanning} className="relative block w-full" onClick={event => {
                    const bounds = event.currentTarget.getBoundingClientRect();
                    setContentTop(Math.max(0.001, Math.min(0.89, (event.clientY - bounds.top) / bounds.height)));
                }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="Selected window preview" src={preview.imageData} className="block w-full h-auto" draggable={false} />
                    {contentTop !== null && <div className="absolute inset-x-0 top-0 bg-black/70 border-b-2 border-emerald-400 pointer-events-none" style={{ height: `${contentTop * 100}%` }} />}
                </button>
                <label className="block mt-2">Adjust webpage top edge
                    <input aria-label="Webpage top edge" type="range" min="0.1" max="89" step="0.1" disabled={isScanning} value={(contentTop ?? 0.001) * 100} onChange={event => setContentTop(Number(event.target.value) / 100)} className="w-full" />
                </label>
                <button disabled={isScanning || contentTop === null} onClick={() => { void capturePage(); }} className="mt-2 rounded bg-emerald-600 px-4 py-2 disabled:opacity-40">{isScanning ? 'Capturing…' : 'Capture webpage content'}</button>
                <p className="mt-2 text-slate-300">Captures this preview, including only the visible part of the page. Resize the frame for a larger preview.</p>
            </>}
            {isScanning && <p role="status">Preparing capture…</p>}
            {windowError && <p role="alert" className="mt-2 text-red-300">{windowError}</p>}
        </div>
    );

    return (
        <div className="w-screen h-screen bg-transparent p-0 flex flex-col select-none overflow-hidden relative border-none">

            {/* --- MAIN UI FRAME --- */}
            <div className={`
                flex-1 flex flex-col bg-black/60 backdrop-blur-md relative overflow-hidden
                border-2 border-emerald-500/80 shadow-[0_0_20px_rgba(16,185,129,0.3)]
                rounded-md transition-all duration-100 m-1
            `}>
                {/* Header doubles as a drag handle so the selection stays on the intended display. */}
                <div
                    className="[-webkit-app-region:drag] h-9 bg-emerald-600/20 border-b border-emerald-500/40 flex items-center justify-between px-3 drag-handle"
                >
                    <div className="flex items-center gap-2">
                        <Target size={14} className="text-emerald-400 animate-pulse" />
                        <span className="text-[10px] font-mono font-black text-emerald-400 tracking-[0.2em] uppercase">
                            SCREEN CAPTURE
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            className="[-webkit-app-region:no-drag] p-1 hover:bg-red-600 rounded transition-all text-emerald-400 hover:text-white"
                            onClick={(e) => { e.stopPropagation(); window.electronAPI?.toggleScannerFrame(); }}
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

                    <div className="z-40 flex flex-col items-center gap-3">
                        <button
                            onClick={handleSelectedAreaCapture}
                            disabled={isScanning}
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
                                {isScanning ? 'WAIT' : 'CAPTURE SELECTED AREA'}
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={() => { void openWindowPicker(); }}
                            disabled={isScanning}
                            className="rounded-md border border-emerald-200/70 px-3 py-1.5 text-[11px] font-bold text-emerald-100 transition-colors hover:bg-emerald-500/20 disabled:opacity-60"
                        >
                            Capture webpage content
                        </button>
                    </div>

                    <div aria-live="polite" className={`absolute bottom-3 left-3 right-3 flex flex-col items-center rounded-lg px-3 py-2 ${captureFailed ? 'border border-red-400/70 bg-red-950/90' : 'bg-black/70'}`}>
                        <span className={`max-w-full text-center text-[11px] font-semibold leading-4 ${captureFailed ? 'text-red-100' : setupPending ? 'text-amber-200' : 'text-emerald-200'}`}>{captureMessage}</span>
                        {setupPending && <span className="mt-1 text-center text-[10px] font-medium text-amber-100/90">Finish the macOS permission dialog, then restart AllyX.</span>}
                        {captureFailed && (
                            <div className="mt-2 flex flex-col items-center gap-2">
                                {(settingsRequired || restartRequired) && (
                                    <div className="flex flex-wrap items-center justify-center gap-2">
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
                                <span className="text-center text-[10px] font-medium text-red-100/90">Try Capture again. AllyX keeps the frame open so you can retry.</span>
                            </div>
                        )}
                        {!captureFailed && <ChevronDown size={12} className="mt-1 animate-bounce text-emerald-400" />}
                    </div>
                </div>
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
