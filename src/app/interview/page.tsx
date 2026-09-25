"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Video, VideoOff, Loader2, AlertCircle, Sparkles, Trash2, LogOut, Copy, RotateCcw, Monitor, MonitorOff, Scan } from "lucide-react";
import { createWorker } from 'tesseract.js';
import { cn } from "@/lib/utils";
import ReactMarkdown from 'react-markdown';

import { useRouter } from "next/navigation";
import { SettingsDialog } from "@/components/settings-dialog";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { interviewService } from "@/lib/interview-service";
import { useAuth } from "@/lib/auth";
import { readInterviewContext } from "@/lib/interview-context";
import { interviewAccess } from "@/lib/interview-access";

// --- Types for Web Speech API ---
interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
    resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
    error: string;
    message?: string;
}

interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    maxAlternatives: number;
    onaudiostart: ((this: SpeechRecognition, ev: Event) => void) | null;
    onaudioend: ((this: SpeechRecognition, ev: Event) => void) | null;
    onend: ((this: SpeechRecognition, ev: Event) => void) | null;
    onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
    onnomatch: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
    onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
    onsoundstart: ((this: SpeechRecognition, ev: Event) => void) | null;
    onsoundend: ((this: SpeechRecognition, ev: Event) => void) | null;
    onspeechstart: ((this: SpeechRecognition, ev: Event) => void) | null;
    onspeechend: ((this: SpeechRecognition, ev: Event) => void) | null;
    onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
    start(): void;
    stop(): void;
    abort(): void;
}

function compactContext(value: string, limit: number): string {
    if (value.length <= limit) return value;
    const marker = "\n\n[Earlier context shortened]\n\n";
    const contentLimit = Math.max(0, limit - marker.length);
    const startLength = Math.floor(contentLimit * 0.7);
    const endLength = contentLimit - startLength;
    return `${value.slice(0, startLength)}${marker}${value.slice(-endLength)}`;
}

export default function InterviewPage() {
    const router = useRouter();
    const accountId = useAuth(state => state.user?.id);
    const { showToast } = useConfirmDialog();
    const videoRef = useRef<HTMLVideoElement>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const recognitionTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    const isRecordingRef = useRef(false);
    const deviceRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const autoAnswerPreferenceRef = useRef(true);
    const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isAiSpeakingRef = useRef(false);
    const isRecognitionActiveRef = useRef(false);
    const isSavingRef = useRef(false);
    const answerInFlightRef = useRef(false);
    const answerAbortRef = useRef<AbortController | null>(null);
    const pendingQuestionRef = useRef("");
    const sessionEndingRef = useRef(false);
    const captureEpochRef = useRef(0);
    const screenCaptureEpochRef = useRef(0);
    const speechActiveRef = useRef(false);
    const recordingStartRef = useRef(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const flushRecorderRef = useRef<(() => Promise<void>) | null>(null);
    const draftHydratedRef = useRef(false);
    const sessionIdRef = useRef("");
    const fullTranscriptRef = useRef("");

    // API Key no longer needed - using server-side Groq
    const [showSettings, setShowSettings] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isFinalizingCapture, setIsFinalizingCapture] = useState(false);
    const [transcript, setTranscript] = useState("");
    const [fullTranscript, setFullTranscript] = useState("");
    const [interimTranscript, setInterimTranscript] = useState("");
    const [aiResponse, setAiResponse] = useState("## Ready to Assist\n\nI am your AI Copilot. I will listen to your meeting and provide real-time context.\n\n**Instructions:**\n1. Click the microphone to start listening.\n2. Speak your question or discussion point.\n3. When you need context, click **Get Answer**.");
    const [isCameraOn, setIsCameraOn] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isCameraVisible, setIsCameraVisible] = useState(false);
    const [systemStatus, setSystemStatus] = useState({ browser: true, camera: false, mic: false });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ignoreStatus = systemStatus;
    const [interviewContext, setInterviewContext] = useState({ type: "", jd: "", resume: "", lang: "en-US", model: "openai/gpt-oss-120b" });
    const [answerModel, setAnswerModel] = useState<string | null>(null);
    const [answerTruncated, setAnswerTruncated] = useState(false);
    const [isAutoMode, setIsAutoMode] = useState(true); // Auto Answer ON by default
    const [lastTranscript, setLastTranscript] = useState<string>(""); // For retry functionality
    const [allQAPairs, setAllQAPairs] = useState<{ question: string, answer: string }[]>([]); // Track Q&A pairs
    const [isSaving, setIsSaving] = useState(false);
    const [interviewStartTime, setInterviewStartTime] = useState<Date>(new Date());
    const [manualQuestion, setManualQuestion] = useState(""); // Manual input for coding questions
    const [isScreenAudioActive, setIsScreenAudioActive] = useState(false);
    const [isScreenCapturing, setIsScreenCapturing] = useState(false);
    const screenStreamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const screenSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const [isScannerActive, setIsScannerActive] = useState(false);
    const [hasMounted, setHasMounted] = useState(false);
    const [contextReady, setContextReady] = useState(false);
    const [accessReady, setAccessReady] = useState(false);
    const [accessRemaining, setAccessRemaining] = useState<number | null>(null);

    // Constants
    const MAX_TRANSCRIPT_LENGTH = 4000;
    const MAX_QUESTION_LENGTH = 12000;

    const appendFullTranscript = useCallback((text: string) => {
        const clean = text.trim();
        if (!clean) return;
        const previous = fullTranscriptRef.current;
        const next = `${previous}${previous ? ' ' : ''}${clean}`.slice(-100000);
        fullTranscriptRef.current = next;
        setFullTranscript(next);
    }, []);

    useEffect(() => {
        isRecordingRef.current = isRecording;
    }, [isRecording]);

    useEffect(() => {
        if (!accountId || draftHydratedRef.current) return;
        draftHydratedRef.current = true;
        try {
            const accessSessionId = sessionStorage.getItem("allyx_access_session");
            if (accessSessionId) sessionIdRef.current = accessSessionId;
            const draft = JSON.parse(localStorage.getItem('interview_draft') || 'null');
            const setup = readInterviewContext(accountId);
            if (draft?.accountId === accountId && draft?.contextSavedAt === setup?.savedAt
                && (!sessionIdRef.current || draft.sessionId === sessionIdRef.current)) {
                if (!sessionIdRef.current) sessionIdRef.current = typeof draft.sessionId === 'string' ? draft.sessionId : crypto.randomUUID();
                if (typeof draft.transcript === 'string') setTranscript(draft.transcript);
                if (typeof draft.fullTranscript === 'string') {
                    fullTranscriptRef.current = draft.fullTranscript;
                    setFullTranscript(draft.fullTranscript);
                }
                if (typeof draft.interimTranscript === 'string') setInterimTranscript(draft.interimTranscript);
                if (Array.isArray(draft.qaPairs)) setAllQAPairs(draft.qaPairs.filter((qa: { question?: unknown; answer?: unknown }) => typeof qa.question === 'string' && typeof qa.answer === 'string'));
                if (typeof draft.manualQuestion === 'string') setManualQuestion(draft.manualQuestion);
                if (typeof draft.aiResponse === 'string') setAiResponse(draft.aiResponse);
                if (typeof draft.answerModel === 'string') setAnswerModel(draft.answerModel);
                if (typeof draft.answerTruncated === 'boolean') setAnswerTruncated(draft.answerTruncated);
                if (typeof draft.startedAt === 'number' && Number.isFinite(draft.startedAt)) setInterviewStartTime(new Date(draft.startedAt));
            }
            if (!sessionIdRef.current) sessionIdRef.current = crypto.randomUUID();
        } catch { /* Ignore corrupt local draft. */ }
        if (!sessionIdRef.current) sessionIdRef.current = crypto.randomUUID();
    }, [accountId]);

    useEffect(() => {
        if (!accountId || !sessionIdRef.current) return;
        let cancelled = false;
        const verify = async () => {
            try {
                const access = await interviewAccess.start(sessionIdRef.current);
                if (cancelled) return;
                if (!access.allowed) {
                    setError(access.reason || "Your interview access has ended.");
                    setAccessReady(false);
                    setAccessRemaining(0);
                    return;
                }
                setAccessReady(true);
                setAccessRemaining(access.source === "trial" ? access.remainingSeconds : null);
            } catch (accessError) {
                if (!cancelled) {
                    setAccessReady(false);
                    setError(accessError instanceof Error ? accessError.message : "Could not verify interview access.");
                }
            }
        };
        void verify();
        const heartbeat = window.setInterval(verify, 15000);
        return () => { cancelled = true; window.clearInterval(heartbeat); };
    }, [accountId]);

    useEffect(() => {
        if (accessRemaining === null || accessRemaining <= 0) return;
        const timer = window.setInterval(() => setAccessRemaining(value => value === null ? null : Math.max(0, value - 1)), 1000);
        return () => window.clearInterval(timer);
    }, [accessRemaining]);

    useEffect(() => {
        if (accessRemaining !== 0 || !accessReady) return;
        setAccessReady(false);
        setIsAutoMode(false);
        setError("Your 10-minute free trial has ended. End the interview to save your session.");
        answerAbortRef.current?.abort();
        if (isRecordingRef.current) {
            setIsRecording(false);
            stopDesktopSTT();
        }
    // stopDesktopSTT is declared later but stable before this effect executes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accessRemaining, accessReady]);

    useEffect(() => {
        if (!accountId || !draftHydratedRef.current) return;
        const saveTimer = window.setTimeout(() => {
            try {
                const contextSavedAt = readInterviewContext(accountId)?.savedAt;
                localStorage.setItem('interview_draft', JSON.stringify({
                    sessionId: sessionIdRef.current,
                    accountId,
                    contextSavedAt,
                    transcript,
                    fullTranscript,
                    interimTranscript,
                    qaPairs: allQAPairs,
                    manualQuestion,
                    aiResponse,
                    answerModel,
                    answerTruncated,
                    startedAt: interviewStartTime.getTime(),
                    savedAt: Date.now(),
                }));
            } catch { /* Saving can still be retried on this screen. */ }
        }, 500);
        return () => window.clearTimeout(saveTimer);
    }, [accountId, transcript, fullTranscript, interimTranscript, allQAPairs, manualQuestion, aiResponse, answerModel, answerTruncated, interviewStartTime]);

    // --- DESK_TOP STT ---

    // Load Settings
    useEffect(() => {
        // Listen for changes from SettingsDialog
        const handleSettingsChange = () => {
            // Placeholder for responsive UI if needed
        };
        window.addEventListener("settingsChanged", handleSettingsChange);
        window.addEventListener("themeChanged", handleSettingsChange);

        return () => {
            window.removeEventListener("settingsChanged", handleSettingsChange);
            window.removeEventListener("themeChanged", handleSettingsChange);
        };
    }, []);

    useEffect(() => {
        if (!accountId) return;
        setHasMounted(true);
        try {
            const saved = readInterviewContext(accountId);
            if (!saved) {
                setError("Interview setup is missing. Return to setup and start again.");
                router.replace("/dashboard/new");
                return;
            }
            setInterviewContext({ type: saved.type, jd: saved.jd, resume: saved.resume, lang: saved.lang, model: saved.model });
            setContextReady(true);
        } catch {
            // localStorage unavailable (private mode)
            setInterviewContext({ type: "General", jd: "", resume: "", lang: "en-US", model: "openai/gpt-oss-120b" });
        }

        // v18.0: Listen for scanner state changes (Atomic Sync)
        if (typeof window !== 'undefined' && window.electronAPI?.onScannerStateChange) {
            const cleanup = window.electronAPI.onScannerStateChange((active: boolean) => {
                console.log('[Sync] Scanner state changed:', active);
                setIsScannerActive(active);
            });
            return cleanup;
        }
    }, [accountId, router]);

    // Initialize Camera
    useEffect(() => {
        let currentStream: MediaStream | null = null;
        let cancelled = false;

        const startCamera = async () => {
            try {
                if (!navigator.mediaDevices?.getUserMedia) {
                    throw new Error("Camera API not supported in this browser.");
                }
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
                currentStream = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = currentStream;
                }
                setSystemStatus(prev => ({ ...prev, camera: true }));
                setError(null);
            } catch (err) {
                console.error("Error accessing camera:", err);
                setSystemStatus(prev => ({ ...prev, camera: false }));
                // Cleanup any partial stream on error
                if (currentStream) {
                    currentStream.getTracks().forEach(track => track.stop());
                    currentStream = null;
                }
            }
        };

        if (isCameraOn && isCameraVisible) {
            startCamera();
        } else {
            setSystemStatus(prev => ({ ...prev, camera: false }));
        }

        const videoElem = videoRef.current;
        return () => {
            cancelled = true;
            if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
            }
            // Fix: Use local variable for cleanup to avoid ref mutation issues
            if (videoElem) {
                videoElem.srcObject = null;
            }
        };
    }, [isCameraOn, isCameraVisible]);
    const isElectron = hasMounted && typeof window !== 'undefined' && (window as unknown as { electronAPI?: { isElectron: boolean } }).electronAPI?.isElectron;

    const getAiAnswer = useCallback(async (explicitQuestion?: string, continuation = false) => {
        if (!accessReady) {
            setError("Interview access is not active. Start a new session or choose an interview pack.");
            return;
        }
        const consumesLiveTranscript = explicitQuestion === undefined;
        const transcriptToUse = explicitQuestion || transcript;

        // No API key check needed - server has Groq configuration
        if (!transcriptToUse.trim()) {
            if (!isAutoMode) setError("No transcript to analyze. Please speak first.");
            return;
        }
        if (answerInFlightRef.current) {
            window.electronAPI?.sendOverlayStatus?.("An answer is already being generated. Wait for it to finish, then retry.", "error");
            return;
        }
        answerInFlightRef.current = true;

        // Preserve both the prompt and constraints when a pasted question or
        // code sample is larger than the live transcript window.
        const currentTranscript = compactContext(transcriptToUse, MAX_QUESTION_LENGTH);
        if (!continuation) {
            pendingQuestionRef.current = currentTranscript;
            setLastTranscript(currentTranscript);
        }
        if (consumesLiveTranscript) {
            setTranscript("");
            setInterimTranscript("");
        }

        setIsLoading(true);
        setError(null);
        window.electronAPI?.sendOverlayStatus?.("Generating answer…", "progress");

        // Stop listening while thinking/speaking to prevent picking up self
        if (isRecording) {
            recognitionRef.current?.stop();
            isAiSpeakingRef.current = true;
        }

        let requestTimeout: ReturnType<typeof setTimeout> | null = null;
        try {
            const controller = new AbortController();
            answerAbortRef.current = controller;
            requestTimeout = setTimeout(() => controller.abort(), 60000);
            const jobContext = compactContext(interviewContext.jd, 3500);
            const resumeContext = compactContext(interviewContext.resume, 6500);
            const recentMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
            let historyBudget = 14000;
            let includedPairs = 0;
            for (const pair of [...allQAPairs].reverse()) {
                if (includedPairs >= 10) break;
                const question = compactContext(pair.question, 3000);
                const answer = compactContext(pair.answer, 6000);
                const pairSize = question.length + answer.length;
                if (pairSize > historyBudget) continue;
                recentMessages.unshift(
                    { role: "user", content: question },
                    { role: "assistant", content: answer },
                );
                historyBudget -= pairSize;
                includedPairs++;
            }
            // Construct the prompt (Unified for all providers)
            const systemPrompt = `
        SYSTEM INSTRUCTION:
        You are assisting a candidate during a professional interview. Provide a clear, accurate answer the candidate can adapt and speak naturally.

        CRITICAL RULES:
        1. **IDENTITY**: You are the candidate. Answer directly as "I". Never say "A good answer would be...".
        2. **CONTEXT AWARENESS**: 
           - Use the provided resume and AI context for personal questions.
           - Follow answer-format, tone, length, and language preferences written in AI Context when they apply.
           - Never invent employment history, achievements, metrics, or skills that are not supported by the supplied context.
           - For technical or general questions, provide accurate, practical explanations.
        3. **DYNAMIC LENGTH (CRITICAL)**:
           - Adjust your length based on the question. 
           - If the question is simple or introductory, be brief and punchy.
           - If the question is technical, architectural, or complex, provide a detailed, logical, and well-structured explanation that demonstrates deep expertise.
        4. **INTERVIEW STRATEGY**: Focus on problem-solving, impact, and clarity. State uncertainty instead of fabricating facts.
        5. **LANGUAGE**: Strictly use ${interviewContext.lang}.
           - If 'ar-EG', use professional Egyptian Arabic (Ammiya) but keep technical terms in English where appropriate. Avoid overly formal Fusha.
           - If 'en-US', use professional corporate English.

        LANGUAGE SPECIFICS (ar-EG):
        - Use professional yet natural Egyptian terms like "حضرتك", "الفكرة إن", "بناءً على خبرتي".
        - Avoid stiff Standard Arabic.

        CONTEXT:
        - Meeting Type: ${interviewContext.type}
        - AI Context & Answer Style: ${jobContext || "Not provided"}
        - Resume: ${resumeContext || "Not provided"}
        `;

            const requestBody = JSON.stringify({
                model: interviewContext.model,
                systemPrompt,
                messages: [...recentMessages, { role: "user", content: currentTranscript }]
            });
            let response: Response | null = null;
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    response = await fetch("/api/generate-stream", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "X-ALLYX-Session-ID": sessionIdRef.current },
                        signal: controller.signal,
                        body: requestBody,
                    });
                    break;
                } catch (fetchError) {
                    if (attempt === 1 || controller.signal.aborted) throw fetchError;
                    await new Promise(resolve => setTimeout(resolve, 350));
                }
            }
            if (!response) throw new Error("The AI service could not be reached.");
            if (!response.ok) {
                let message = `AI request failed (${response.status}).`;
                try {
                    const data = await response.json();
                    message = data.error?.message || data.error || message;
                } catch { /* Keep HTTP fallback. */ }
                throw new Error(message);
            }
            if (!response.body) throw new Error("The AI response stream was empty.");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let text = "";
            let finishReason = "";
            let lastOverlayUpdate = 0;
            const prefix = continuation ? `${aiResponse}\n\n` : "";
            while (true) {
                const { value, done } = await reader.read();
                buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
                const events = buffer.split("\n\n");
                buffer = events.pop() || "";
                for (const event of events) {
                    for (const line of event.split("\n")) {
                        if (!line.startsWith("data: ")) continue;
                        const payload = line.slice(6);
                        if (payload === "[DONE]") continue;
                        try {
                            const eventData = JSON.parse(payload);
                            text += eventData.content || "";
                            if (eventData.finishReason) finishReason = eventData.finishReason;
                        } catch { /* Ignore malformed event. */ }
                    }
                    if (text) {
                        const liveAnswer = `${prefix}${text}`;
                        setAiResponse(liveAnswer);
                        const now = Date.now();
                        if (now - lastOverlayUpdate > 80) {
                            window.electronAPI?.sendAnswer?.(liveAnswer);
                            lastOverlayUpdate = now;
                        }
                    }
                }
                if (done) break;
            }
            if (!text.trim()) throw new Error("Empty response from AI.");
            if (sessionEndingRef.current) return;

            const completeAnswer = `${prefix}${text}`;
            setAiResponse(completeAnswer);
            const effectiveModel = response.headers.get("X-ALLYX-Model") || interviewContext.model;
            setAnswerModel(effectiveModel);
            setAnswerTruncated(finishReason === "length");
            const fallbackMessage = effectiveModel !== interviewContext.model
                ? `Paid model unavailable. Answered by ${effectiveModel} fallback.`
                : "";
            window.electronAPI?.sendOverlayStatus?.(
                finishReason === "length" ? "The answer reached its limit. Press Continue to finish it." : fallbackMessage,
                finishReason === "length" ? "progress" : "success",
                finishReason === "length" ? "continue" : undefined,
            );
            // Broadcast to Electron Overlay
            if (window.electronAPI?.sendAnswer) {
                window.electronAPI.sendAnswer(completeAnswer);
            }
            // Track Q&A pairs for saving to history - save question and answer together
            setAllQAPairs(prev => {
                if (!continuation || prev.length === 0) return [...prev, { question: currentTranscript.trim(), answer: text }];
                const updated = [...prev];
                const last = updated[updated.length - 1];
                updated[updated.length - 1] = { ...last, answer: `${last.answer}\n\n${text}` };
                return updated;
            });
            if (!continuation) pendingQuestionRef.current = "";
            // Text-to-speech disabled - text only mode
            isAiSpeakingRef.current = false;

            // Restart speech recognition after AI finishes
            if (isRecordingRef.current && recognitionRef.current) {
                const timer = setTimeout(() => {
                    if (!isRecordingRef.current || sessionEndingRef.current) return;
                    try {
                        recognitionRef.current?.start();
                        console.log("[Speech] Restarted after AI response");
                    } catch (e) {
                        console.log("[Speech] Could not restart:", e);
                    }
                }, 300);
                recognitionTimersRef.current.push(timer);
            }

        } catch (error: unknown) {
            const err = error as Error;
            if (sessionEndingRef.current) return;
            console.error("Error generating AI response:", err);
            let errorMessage = "Could not generate response.";
            if (err.name === "AbortError") {
                errorMessage = "The AI response timed out. Check your connection and retry.";
            } else if (err.message.includes("429")) {
                errorMessage = "AI is busy (Rate Limit). Please try again.";
            } else if (err.message.includes("configuration missing")) {
                errorMessage = "Server AI configuration error. Please contact support.";
            } else if (err.message === "Failed to fetch" || err instanceof TypeError) {
                errorMessage = "Network connection lost while contacting the AI service. Check your connection and retry.";
            } else {
                errorMessage = err.message;
            }
            if (!continuation) {
                setAiResponse(`**Error:** ${errorMessage}`);
                setAnswerTruncated(false);
            }
            setError(errorMessage);
            window.electronAPI?.sendOverlayStatus?.(errorMessage, "error");
            if (consumesLiveTranscript && !continuation) {
                setTranscript(liveText => {
                    const newSpeech = liveText.trim();
                    return newSpeech ? `${currentTranscript} ${newSpeech}`.slice(-MAX_TRANSCRIPT_LENGTH) : currentTranscript;
                });
            }
            isAiSpeakingRef.current = false;
            if (isRecordingRef.current) recognitionRef.current?.start();
        } finally {
            if (requestTimeout) clearTimeout(requestTimeout);
            answerAbortRef.current = null;
            answerInFlightRef.current = false;
            setIsLoading(false);
        }
    }, [accessReady, aiResponse, allQAPairs, interviewContext, transcript, isAutoMode, isRecording, recognitionRef]);

    const handleManualSubmit = () => {
        if (!contextReady) {
            setError("Interview setup is not ready. Return to setup and start again.");
            return;
        }
        if (!manualQuestion.trim()) return;
        getAiAnswer(manualQuestion);
    };

    useEffect(() => window.electronAPI?.onOverlayManualQuestion?.((question: string) => {
        setManualQuestion(question);
        if (!contextReady) {
            window.electronAPI?.sendOverlayStatus?.("Finish interview setup before asking a question.", "error");
            return;
        }
        void getAiAnswer(question);
    }), [contextReady, getAiAnswer]);

    useEffect(() => window.electronAPI?.onOverlayContinueAnswer?.(() => {
        if (!contextReady || !answerTruncated) return;
        void getAiAnswer("Continue exactly from the last sentence without repeating the previous answer.", true);
    }), [answerTruncated, contextReady, getAiAnswer]);

    useEffect(() => {
        window.electronAPI?.setInterviewReady?.(contextReady);
        return () => window.electronAPI?.setInterviewReady?.(false);
    }, [contextReady]);

    // Silence Detection for Auto-Answer
    useEffect(() => {
        if (!isAutoMode || !isRecording || isLoading || !transcript.trim()) return;

        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        const waitForCompleteQuestion = () => {
            silenceTimerRef.current = setTimeout(() => {
                if (speechActiveRef.current) {
                    waitForCompleteQuestion();
                    return;
                }
                console.log("Auto-answering after confirmed silence...");
                getAiAnswer();
            }, isElectron ? 1600 : 1800);
        };
        waitForCompleteQuestion();

        return () => {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        };
    }, [transcript, isAutoMode, isLoading, isRecording, getAiAnswer, isElectron]);

    // --- SCREEN AUDIO CAPTURE (ELECTRON ONLY) ---
    const stopScreenAudio = useCallback(() => {
        screenCaptureEpochRef.current++;
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(t => t.stop());
            screenStreamRef.current = null;
        }
        if (screenSourceRef.current) {
            screenSourceRef.current.disconnect();
            screenSourceRef.current = null;
        }
        setIsScreenAudioActive(false);
        console.log("[Screen Audio] Stopped");
    }, []);

    useEffect(() => window.electronAPI?.onStopAudioSource?.(() => stopScreenAudio()), [stopScreenAudio]);

    const toggleScreenAudio = async () => {
        if (!isElectron) return;

        if (isScreenAudioActive) {
            stopScreenAudio();
            window.electronAPI?.stopSystemAudioCapture();
        } else {
            console.log("[Screen Audio] Requesting capture...");
            const result = await window.electronAPI?.startSystemAudioCapture();
            console.log("[Screen Audio] Capture request result:", result);
            if (result && !result.success) {
                console.error("[Screen Audio] Capture request failed:", result.error);
                setError(result.error || "Failed to start screen capture.");
            }
        }
    };

    useEffect(() => {
        if (!isElectron) return;

        const cleanup = window.electronAPI?.onAudioSourceReady(async (sourceId: string) => {
            console.log("[Screen Audio] Source ID received:", sourceId);
            const epoch = screenCaptureEpochRef.current;
            try {
                if (!navigator.mediaDevices?.getUserMedia) {
                    throw new Error("System audio capture not supported.");
                }
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        // @ts-expect-error: mandatory is non-standard but required for Electron desktop capture
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: sourceId
                        }
                    },
                    video: {
                        // @ts-expect-error: mandatory is non-standard but required for Electron desktop capture
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: sourceId
                        }
                    }
                });
                if (epoch !== screenCaptureEpochRef.current || window.electronAPI?.isPresentationSafeMode()) {
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }

                screenStreamRef.current = stream;
                setIsScreenAudioActive(true);

                // If recording is already active, connect this new stream to existing context
                if (isRecording && audioContextRef.current && analyserRef.current) {
                    try {
                        const screenSource = audioContextRef.current.createMediaStreamSource(stream);
                        screenSource.connect(analyserRef.current);
                        screenSourceRef.current = screenSource;
                        console.log("[Screen Audio] Stream mixed into active recording");
                    } catch (e: unknown) {
                        console.error("[Screen Audio] Failed to mix stream:", e as Error);
                    }
                }

                // Monitor for capture stop (user clicks "Stop Sharing" in OS)
                const videoTrack = stream.getVideoTracks()[0];
                if (videoTrack) videoTrack.onended = () => {
                    console.log("[Screen Audio] Capture stopped by OS");
                    stopScreenAudio();
                    if (!sessionEndingRef.current) setError("System audio capture stopped. Press the System Audio button to reconnect it.");
                };

            } catch (err: unknown) {
                console.error("[Screen Audio] Failed to get stream:", err as Error);
                setIsScreenAudioActive(false);
                setError("System audio capture failed (Permission or selection issue).");
            }
        });

        return () => {
            // onAudioSourceReady doesn't return a cleanup in some versions, check if it does
            if (typeof cleanup === 'function') (cleanup as () => void)();
        };
    }, [isElectron, isRecording, stopScreenAudio]);

    // --- DESKTOP STT (Groq Whisper with Silence Detection) ---
    const activeStreamsRef = useRef<MediaStream[]>([]);
    const lastGroqTranscriptRef = useRef<string>("");

    // Ignore only exact non-speech captions. Real phrases must remain available to the AI.
    const NON_SPEECH_CAPTIONS = new Set(["[music]", "[applause]", "(music)", "(applause)"]);

    const processGroqAudio = async (audioBlob: Blob) => {
        try {
            // Groq is picky about types. Ensure it's marked as webm.
            if (audioBlob.size < 2000) {
                return;
            }

            const formData = new FormData();
            formData.append('file', audioBlob, 'audio.webm');
            formData.append('model', 'whisper-large-v3-turbo');

            // Get selected language
            const selectedLanguage = interviewContext.lang.split('-')[0];
            const langCode = selectedLanguage === 'fil' ? 'tl' : selectedLanguage;
            formData.append('language', langCode);

            // Add prompt to help Whisper understand the expected language
            if (langCode === 'en') {
                formData.append('prompt', 'This is an English professional meeting conversation.');
            } else if (langCode === 'ar') {
                formData.append('prompt', 'هذه محادثة اجتماع عمل باللغة العربية.');
            }

            console.log(`[Desktop STT] Sending audio with language: ${langCode}`);

            let response;
            let retries = 0;
            let delay = 1000;

            while (retries >= 0) {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 25000);
                try {
                    response = await fetch('/api/transcribe', {
                        method: 'POST',
                        headers: { "X-ALLYX-Session-ID": sessionIdRef.current },
                        body: formData,
                        signal: controller.signal,
                    });
                } finally {
                    clearTimeout(timeout);
                }

                if (response.ok) break;

                if (response.status === 503 || response.status === 429) {
                    console.warn(`[Desktop STT] Retrying due to ${response.status}... (${retries} left)`);
                    await new Promise(r => setTimeout(r, delay));
                    retries--;
                    delay *= 2;
                } else {
                    break;
                }
            }

            if (!response || !response.ok) {
                console.error(`[Desktop STT] API Error: ${response?.status}`);
                let message = "Transcription stopped because the audio service could not be reached.";
                try {
                    const body = await response?.json();
                    if (typeof body?.error === "string") message = body.error;
                    else if (typeof body?.error?.message === "string") message = body.error.message;
                } catch { /* Keep the safe fallback message. */ }
                setError(`${message} Stop and restart the microphone to retry.`);
                return;
            }

            const data = await response.json();
            console.log(`[Desktop STT] Groq returned: "${data.text || '(empty)'}"`);

            if (data.text && data.text.trim()) {
                const newText = data.text.trim();
                const clean = newText.toLowerCase().replace(/[.,!?]/g, '').trim();
                const wordCount = clean.split(/\s+/).length;

                // Filter: too short (Speed Mode)
                if (wordCount < 1) {
                    return;
                }

                if (NON_SPEECH_CAPTIONS.has(newText.toLowerCase().trim())) {
                    console.log(`[Desktop STT] Filtered non-speech caption: "${newText}"`);
                    return;
                }

                // Filter: duplicate
                if (lastGroqTranscriptRef.current === clean) {
                    console.log(`[Desktop STT] Filtered: duplicate`);
                    return;
                }

                lastGroqTranscriptRef.current = clean;
                console.log(`[Desktop STT] ✅ Heard (${langCode}): "${newText}"`);

                appendFullTranscript(newText);

                setTranscript(prev => {
                    const prevTrimmed = prev.trim();


                    // Simple check: if the last few words of the transcript match the start of the new text, skip the overlap
                    // This is more basic than the onresult deduplication because Groq text is usually 
                    // more complete and we want to preserve its accuracy.

                    // But if the entire newText is already at the end of the transcript, skip it.
                    if (prevTrimmed.endsWith(newText)) return prev;

                    const finalTranscript = (prev + " " + newText).trim();
                    return finalTranscript.slice(-MAX_TRANSCRIPT_LENGTH);
                });

                if ((window as unknown as { electronAPI?: { sendTranscript: (t: string) => void } }).electronAPI?.sendTranscript) {
                    (window as unknown as { electronAPI: { sendTranscript: (t: string) => void } }).electronAPI.sendTranscript(newText);
                }
            } else {
                console.log("[Desktop STT] Groq returned empty response");
            }
        } catch (error) {
            console.error("[Desktop STT] Error:", error);
            setError("Transcription failed. Check your connection, then stop and restart the microphone.");
        }
    };

    const startDesktopSTT = async () => {
        const epoch = captureEpochRef.current;
        try {
            if (window.electronAPI?.isPresentationSafeMode()) return false;
            console.log("[Desktop STT] Starting Smart VAD...");

            // 1. Get Microphone stream
            const micStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            });
            if (epoch !== captureEpochRef.current || window.electronAPI?.isPresentationSafeMode()) {
                micStream.getTracks().forEach(track => track.stop());
                return false;
            }
            activeStreamsRef.current = [micStream];
            const microphoneTrack = micStream.getAudioTracks()[0];
            if (microphoneTrack) {
                microphoneTrack.onended = () => {
                    if (epoch !== captureEpochRef.current || sessionEndingRef.current || !isRecordingRef.current) return;
                    setError("The microphone disconnected. Reconnecting…");
                    setIsRecording(false);
                    setIsAutoMode(false);
                    stopDesktopSTT();
                    if (deviceRecoveryTimerRef.current) clearTimeout(deviceRecoveryTimerRef.current);
                    deviceRecoveryTimerRef.current = setTimeout(async () => {
                        deviceRecoveryTimerRef.current = null;
                        if (sessionEndingRef.current) return;
                        const recovered = await startDesktopSTT();
                        if (recovered) {
                            setIsRecording(true);
                            setIsAutoMode(autoAnswerPreferenceRef.current);
                            setError(null);
                        } else {
                            setError("Microphone reconnection failed. Select an available microphone and press Start.");
                        }
                    }, 1000);
                };
            }

            // 2. Initialize Audio Context & Analyser (Saved to Refs for mixing)
            const audioContext = new AudioContext();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;

            audioContextRef.current = audioContext;
            analyserRef.current = analyser;

            // 3. Connect Microphone
            const micSource = audioContext.createMediaStreamSource(micStream);
            micSource.connect(analyser);
            micSourceRef.current = micSource;

            // 4. Connect Screen Audio (if already active)
            if (isScreenAudioActive && screenStreamRef.current) {
                try {
                    const screenSource = audioContext.createMediaStreamSource(screenStreamRef.current);
                    screenSource.connect(analyser);
                    screenSourceRef.current = screenSource;
                    console.log("[Desktop STT] Screen audio mixed at start");
                } catch (e) {
                    console.warn("[Desktop STT] Failed to mix screen audio at start:", e);
                }
            }

            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            // VAD Parameters (Ultra-Low Latency Mode)
            const SPEECH_THRESHOLD = 12;        // Increased sensitivity for system audio
            const SILENCE_DURATION = 800;       // 0.8s silence = End of sentence (Fast & snappy)
            const MIN_SPEECH_DURATION = 500;    // Allow short sentences
            const MAX_RECORDING_TIME = 15000;   // Force send after 15s

            let mediaRecorder: MediaRecorder | null = null;
            let isSpeaking = false;
            let silenceStart = 0;
            let speechStart = 0;
            let lastLogTime = 0;

            const checkAudioLevel = () => {
                if (epoch !== captureEpochRef.current) return;
                if (!activeStreamsRef.current.length && !screenStreamRef.current) return;

                analyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

                // Log every 2.5s to reduce console noise
                if (Date.now() - lastLogTime > 2500) {
                    console.log(`[VAD] Avg: ${average.toFixed(1)} | Mic: ${!!micStream} | Screen: ${isScreenAudioActive}`);
                    lastLogTime = Date.now();
                }

                if (average > SPEECH_THRESHOLD) {
                    speechActiveRef.current = true;
                    // SPEECH DETECTED
                    silenceStart = 0;
                    if (!isSpeaking) {
                        isSpeaking = true;
                        speechStart = Date.now();
                        const ownedChunks: Blob[] = [];
                        console.log("[VAD] ⚡ Speech detected!");

                        // Create a mixed stream for the MediaRecorder
                        const dest = audioContext.createMediaStreamDestination();
                        const screenSourceAtStart = screenSourceRef.current;
                        micSource.connect(dest);
                        if (screenSourceAtStart) {
                            screenSourceAtStart.connect(dest);
                        }

                        // Use standard webm to avoid header issues with Whisper
                        const mimeType = 'audio/webm';
                        mediaRecorder = new MediaRecorder(dest.stream, { mimeType });
                        mediaRecorderRef.current = mediaRecorder;
                        mediaRecorder.ondataavailable = (e) => {
                            if (e.data.size > 0) ownedChunks.push(e.data);
                        };

                        let resolveStopped: () => void = () => {};
                        const stopped = new Promise<void>(resolve => { resolveStopped = resolve; });
                        const ownedRecorder = mediaRecorder;
                        const flushOwned = async () => {
                            if (ownedRecorder.state === 'recording') ownedRecorder.stop();
                            await stopped;
                        };
                        mediaRecorder.onstop = async () => {
                            try {
                                if (epoch !== captureEpochRef.current) return;
                                const duration = Date.now() - speechStart;
                                if (duration < MIN_SPEECH_DURATION || ownedChunks.length === 0) return;
                                const fullAudio = new Blob(ownedChunks, { type: 'audio/webm' });
                                console.log(`[VAD] Sending ${(fullAudio.size / 1024).toFixed(1)}KB...`);
                                await processGroqAudio(fullAudio);
                            } finally {
                                try { micSource.disconnect(dest); } catch { /* already disconnected */ }
                                try { screenSourceAtStart?.disconnect(dest); } catch { /* already disconnected */ }
                                dest.stream.getTracks().forEach(track => track.stop());
                                ownedChunks.length = 0;
                                if (mediaRecorderRef.current === ownedRecorder) mediaRecorderRef.current = null;
                                if (flushRecorderRef.current === flushOwned) flushRecorderRef.current = null;
                                resolveStopped();
                            }
                        };
                        flushRecorderRef.current = flushOwned;

                        // IMPORTANT: Start without timeslice to get a single valid blob at onstop
                        // This produces a much more stable WebM file for Groq
                        mediaRecorder.start();
                    } else {
                        // Check Max Duration
                        if (Date.now() - speechStart > MAX_RECORDING_TIME) {
                            console.log("[VAD] Max duration reached, forcing stop.");
                            stopAndProcess();
                        }
                    }
                } else {
                    // SILENCE
                    if (isSpeaking) {
                        if (silenceStart === 0) {
                            silenceStart = Date.now();
                        } else if (Date.now() - silenceStart > SILENCE_DURATION) {
                            console.log("[VAD] End of sentence (Silence detected).");
                            stopAndProcess();
                        }
                    }
                }
                requestAnimationFrame(checkAudioLevel);
            };

            const stopAndProcess = () => {
                isSpeaking = false;
                speechActiveRef.current = false;
                silenceStart = 0;

                if (mediaRecorder && mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                }
            };

            checkAudioLevel();
            setIsRecording(true);
            console.log("[Desktop STT] VAD Engine Started");
            return true;

        } catch (err: unknown) {
            const error = err as Error;
            console.error("Desktop STT Error:", error);
            captureEpochRef.current++;
            activeStreamsRef.current.forEach(stream => stream.getTracks().forEach(track => track.stop()));
            activeStreamsRef.current = [];
            void audioContextRef.current?.close();
            audioContextRef.current = null;
            setError(error.message || "Recording failed.");
            return false;
        }
    };

    const stopDesktopSTT = useCallback(() => {
        captureEpochRef.current++;
        speechActiveRef.current = false;
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.onstop = null;
            mediaRecorderRef.current.stop();
        }
        mediaRecorderRef.current = null;
        flushRecorderRef.current = null;
        if (screenSourceRef.current) {
            screenSourceRef.current.disconnect();
            screenSourceRef.current = null;
        }

        if (micSourceRef.current) {
            micSourceRef.current.disconnect();
            micSourceRef.current = null;
        }

        const audioContext = audioContextRef.current;
        if (audioContext) {
            audioContext.close();
            audioContextRef.current = null;
        }

        activeStreamsRef.current.forEach(stream => {
            stream.getTracks().forEach(track => track.stop());
        });
        activeStreamsRef.current = [];
        console.log("[Desktop STT] Stopped");
    }, []);

    const flushAndStopDesktopSTT = useCallback(async () => {
        const flush = flushRecorderRef.current;
        if (flush) await flush();
        stopDesktopSTT();
    }, [stopDesktopSTT]);

    useEffect(() => () => {
        if (deviceRecoveryTimerRef.current) clearTimeout(deviceRecoveryTimerRef.current);
        stopDesktopSTT();
        stopScreenAudio();
    }, [stopDesktopSTT, stopScreenAudio]);

    useEffect(() => {
        if (!isElectron || !window.electronAPI) return;

        const stopForPresentation = (active: boolean) => {
            if (!active) return;
            setIsRecording(false);
            setIsAutoMode(false);
            setIsCameraOn(false);
            setIsCameraVisible(false);
            stopDesktopSTT();
            stopScreenAudio();
            window.electronAPI?.stopSystemAudioCapture();
            try { recognitionRef.current?.abort(); } catch { }
            isRecognitionActiveRef.current = false;
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        };

        stopForPresentation(window.electronAPI.isPresentationSafeMode());
        return window.electronAPI.onPresentationSafeModeChange(stopForPresentation);
    }, [isElectron, stopDesktopSTT, stopScreenAudio]);

    // --- TOGGLE RECORDING (UNIFIED) ---
    const toggleRecording = async () => {
        if (isFinalizingCapture) return;
        if (!contextReady) {
            setError("Interview setup is not ready. Return to setup and start again.");
            return;
        }
        if (recordingStartRef.current) {
            captureEpochRef.current++;
            return;
        }
        if (isRecording) {
            // STOP
            setIsFinalizingCapture(true);
            setIsRecording(false);
            setIsAutoMode(false);

            // 1. Stop Browser Recognition
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch { }
            }

            // 2. Stop Desktop VAD (if running)
            try {
                if (isElectron) await flushAndStopDesktopSTT();
            } finally {
                setIsFinalizingCapture(false);
            }

            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            console.log("[Interview] Recording stopped");
            return;
        }

        // START
        if (window.electronAPI?.isPresentationSafeMode()) return;
        recordingStartRef.current = true;
        isAiSpeakingRef.current = false;
        setError(null);
        setTranscript("");
        setInterimTranscript("");

        try {
            // Browser speech recognition is web-only. Electron uses Groq Whisper below.
            if (!isElectron && recognitionRef.current) {
                try {
                    if (!isRecognitionActiveRef.current) {
                        recognitionRef.current.start();
                        isRecognitionActiveRef.current = true;
                        console.log("[Speech] Fast Live Engine started successfully");
                    }
                } catch (e: unknown) {
                    const err = e as Error;
                    if (err.name === 'InvalidStateError') {
                        isRecognitionActiveRef.current = true; // Sync state
                    } else {
                        console.error("[Speech] Failed to start Web Speech API:", err);
                        if (!isElectron) {
                            setError("Microphone access is already in use or failed.");
                        }
                    }
                }
            } else if (!isElectron) {
                console.warn("[Speech] Web Speech API not initialized.");
                if (!isElectron) {
                    setError("Your browser does not support Live Speech. Use Chrome or Edge.");
                }
            }

            // STEP 2: Desktop Only - Start High-Quality mixed audio STT
            if (isElectron) {
                const started = await startDesktopSTT();
                if (!started) return;
            }

            setIsRecording(true);
            setIsAutoMode(autoAnswerPreferenceRef.current);
            console.log("[Interview] Recording started (Dual-Engine Mode)");
        } catch (err: unknown) {
            const error = err as Error;
            console.error("Failed to start recording:", error);
            setError("Could not access microphone.");
        } finally {
            recordingStartRef.current = false;
        }
    };

    // Initialize Speech Recognition (website only)
    useEffect(() => {
        if (window.electronAPI) return;

        const schedule = (callback: () => void, delay: number) => {
            const timer = setTimeout(callback, delay);
            recognitionTimersRef.current.push(timer);
        };

        const win = typeof window !== 'undefined' ? window as unknown as {
            webkitSpeechRecognition?: new () => SpeechRecognition;
            SpeechRecognition?: new () => SpeechRecognition;
        } : null;

        if (!win) return;

        const SpeechRecognitionClass = win.webkitSpeechRecognition || win.SpeechRecognition;
        if (SpeechRecognitionClass) {
            try {
                recognitionRef.current = new SpeechRecognitionClass();
            } catch (e) {
                console.error("[Speech] Failed to create instances:", e);
                return;
            }
            const rec = recognitionRef.current;
            if (rec) {
                rec.continuous = true;
                rec.interimResults = true;
                rec.lang = interviewContext.lang.startsWith('ar') ? 'ar-EG' : interviewContext.lang;
                rec.maxAlternatives = 3;
            }
        }

        if (recognitionRef.current) {
            recognitionRef.current.onstart = () => {
                isRecognitionActiveRef.current = true;
                setSystemStatus(prev => ({ ...prev, mic: true }));
                setError(null);
                console.log("[Speech] Recognition started");
            };
            recognitionRef.current.onspeechstart = () => {
                speechActiveRef.current = true;
            };
            recognitionRef.current.onspeechend = () => {
                speechActiveRef.current = false;
            };
        }

        if (recognitionRef.current) {
            recognitionRef.current.onend = () => {
                isRecognitionActiveRef.current = false;
                console.log("[Speech] Recognition ended, isRecording:", isRecordingRef.current, "isAiSpeaking:", isAiSpeakingRef.current);
                // Auto-restart ONLY if we are supposed to be recording AND AI is NOT speaking
                if (isRecordingRef.current && !isAiSpeakingRef.current) {
                    console.log("[Speech] Auto-restarting...");
                    // Use a small delay to prevent rapid restart loops
                    schedule(() => {
                        if (recognitionRef.current && isRecordingRef.current && !isAiSpeakingRef.current && !isRecognitionActiveRef.current) {
                            try {
                                recognitionRef.current.start();
                                isRecognitionActiveRef.current = true;
                            } catch (err: unknown) {
                                const error = err as Error;
                                if (error.name !== 'InvalidStateError') {
                                    console.error("[Speech] Failed to restart:", error);
                                } else {
                                    isRecognitionActiveRef.current = true;
                                }
                            }
                        }
                    }, 300); // Slightly longer delay for stability
                }
            };
        }

        if (recognitionRef.current) {
            recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
                let interim = '';
                let finalText = '';

                // Process only new results
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const result = event.results[i];
                    const transcript = result[0].transcript;

                    if (result.isFinal) {
                        finalText += transcript;
                    } else {
                        interim = transcript; // Only keep the latest interim
                    }
                }

                // Add final text to transcript
                if (finalText) {
                    const cleanedFinal = finalText.trim();
                    if (cleanedFinal) {
                        appendFullTranscript(cleanedFinal);
                        setTranscript(prev => {
                            // Enhanced deduplication: check if the new text overlaps with the end of existing transcript
                            const prevTrimmed = prev.trim();

                            // Check if this text is a repeat of what we just added
                            if (prevTrimmed.endsWith(cleanedFinal)) {
                                return prev; // Skip complete duplicate
                            }

                            // Check for partial overlap (last N words match first N words of new text)
                            const prevWords = prevTrimmed.split(' ').slice(-10); // Last 10 words
                            const newWords = cleanedFinal.split(' ');

                            // Find overlap: check if end of prev matches start of new
                            let overlapLength = 0;
                            for (let len = Math.min(prevWords.length, newWords.length); len > 0; len--) {
                                const prevEnd = prevWords.slice(-len).join(' ').toLowerCase();
                                const newStart = newWords.slice(0, len).join(' ').toLowerCase();
                                if (prevEnd === newStart) {
                                    overlapLength = len;
                                    break;
                                }
                            }

                            // Remove overlapping words from new text
                            const textToAdd = overlapLength > 0
                                ? newWords.slice(overlapLength).join(' ')
                                : cleanedFinal;

                            if (!textToAdd.trim()) {
                                return prev; // Nothing new to add
                            }

                            const newTranscript = prev + (prev ? ' ' : '') + textToAdd;

                            // Broadcast to Electron Overlay
                            if (window.electronAPI?.sendTranscript) {
                                window.electronAPI.sendTranscript(textToAdd);
                            }

                            // Limit transcript length
                            if (newTranscript.length > MAX_TRANSCRIPT_LENGTH) {
                                return newTranscript.slice(-MAX_TRANSCRIPT_LENGTH); // Keep last 4000 chars
                            }
                            return newTranscript;
                        });
                    }
                    setInterimTranscript('');
                } else if (interim) {
                    setInterimTranscript(interim);
                    // Also broadcast interim if possible for smoother UI
                    if (window.electronAPI?.sendTranscript) {
                        window.electronAPI.sendTranscript(interim);
                    }
                }
            };

            recognitionRef.current.onerror = (event: { error: string; }) => {
                console.log("[Speech] Error:", event.error);
                if (event.error === 'not-allowed') {
                    setError("Microphone access blocked.");
                }
                // Sync state on abort/end
                if (event.error === 'aborted' || event.error === 'audio-capture') {
                    isRecognitionActiveRef.current = false;
                }
                if (event.error === 'audio-capture') {
                    setIsRecording(false);
                    setIsAutoMode(false);
                    setError("The active microphone became unavailable. Check the device and press Start to reconnect.");
                    setSystemStatus(prev => ({ ...prev, mic: false }));
                    return;
                }

                // Still try to restart after minor errors if recording is active
                if ((event.error === 'no-speech' || event.error === 'aborted') && isRecordingRef.current && !isAiSpeakingRef.current) {
                    schedule(() => {
                        if (recognitionRef.current && isRecordingRef.current && !isRecognitionActiveRef.current) {
                            try {
                                recognitionRef.current.start();
                                isRecognitionActiveRef.current = true;
                            } catch { /* ignore */ }
                        }
                    }, 400);
                }

                // Handle network errors with auto-retry
                if (event.error === 'network') {
                    console.log("[Speech] Network error, will retry...");
                    schedule(() => {
                        if (recognitionRef.current && isRecordingRef.current) {
                            try {
                                recognitionRef.current.start();
                            } catch { /* ignore */ }
                        }
                    }, 1000);
                    return;
                }

                // v21.1: Silence transient errors that are already handled by the retry logic
                if (event.error === 'aborted' || event.error === 'no-speech') {
                    return;
                }

                console.error("[Speech] Recognition error:", event.error);
                if (event.error === 'not-allowed') {
                    setIsRecording(false);
                    setError("Microphone access denied. Please allow microphone permissions.");
                    setSystemStatus(prev => ({ ...prev, mic: false }));
                }
            };
        }

        return () => {
            recognitionTimersRef.current.forEach(clearTimeout);
            recognitionTimersRef.current = [];
            const recognition = recognitionRef.current;
            recognitionRef.current = null;
            if (recognition) {
                recognition.onstart = null;
                recognition.onend = null;
                recognition.onresult = null;
                recognition.onerror = null;
                try { recognition.abort(); } catch { /* already stopped */ }
            }
            isRecognitionActiveRef.current = false;
        };
    }, [appendFullTranscript, interviewContext.lang]);


    const processCapturedImage = useCallback(async (imageData: string) => {
        let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
        try {
            if (!imageData?.startsWith('data:image/')) throw new Error('The captured image was invalid.');
            window.electronAPI?.sendOverlayStatus?.("Reading captured code…", "progress");
            const deadline = <T,>(promise: Promise<T>, ms: number, message: string) => Promise.race<T>([
                promise,
                new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
            ]);
            worker = await deadline(createWorker('eng', 1, {
                langPath: '/tessdata',
                logger: m => console.log("[Scanner] Progress:", m.status, Math.round(m.progress * 100) + "%"),
            }), 30000, "OCR engine initialization timed out. Check your connection and retry.");
            await worker.setParameters({
                tessedit_pageseg_mode: '3',
                preserve_interword_spaces: '1',
            } as unknown as Record<string, string>);
            const ret = await deadline(worker.recognize(imageData), 30000, "OCR took too long. Capture a smaller area and retry.");
            const text = ret.data.text.trim();
            if (!text) {
                const message = "No readable text was detected. Enlarge the code and try again.";
                showToast(message, "info");
                window.electronAPI?.sendOverlayStatus?.(message, "error");
                return;
            }
            setManualQuestion(text);
            window.electronAPI?.sendCapturedText?.(text);
            window.electronAPI?.sendOverlayStatus?.("Code captured. Generating answer…", "progress");
            showToast("Text captured. Generating the answer.", "success");
            await getAiAnswer(text);
        } catch (err) {
            console.error("[Scanner] OCR processing failed:", err);
            const message = err instanceof Error ? err.message : "Failed to process screen capture.";
            showToast(message, "error");
            window.electronAPI?.sendOverlayStatus?.(message, "error");
        } finally {
            if (worker) await worker.terminate().catch(console.error);
        }
    }, [getAiAnswer, showToast]);

    const captureBrowserScreen = useCallback(async () => {
        if (!navigator.mediaDevices?.getDisplayMedia) {
            setError("Screen capture is not supported by this browser. Use the AllyX desktop app or a current Chrome, Edge, or Safari version.");
            return;
        }
        let stream: MediaStream | null = null;
        setIsScreenCapturing(true);
        setError(null);
        try {
            stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            const video = document.createElement("video");
            video.muted = true;
            video.playsInline = true;
            video.srcObject = stream;
            await new Promise<void>((resolve, reject) => {
                const timeout = window.setTimeout(() => reject(new Error("Screen capture timed out. Please try again.")), 10000);
                video.onloadedmetadata = () => { window.clearTimeout(timeout); resolve(); };
                video.onerror = () => { window.clearTimeout(timeout); reject(new Error("The selected screen could not be captured.")); };
            });
            await video.play();
            if (!video.videoWidth || !video.videoHeight) throw new Error("The selected screen returned an empty image.");

            const maxDimension = 2400;
            const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
            canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Screen capture could not initialize.");
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            await processCapturedImage(canvas.toDataURL("image/png"));
        } catch (captureError) {
            const cancelled = captureError instanceof DOMException && ["NotAllowedError", "AbortError"].includes(captureError.name);
            const message = cancelled
                ? "Screen capture was cancelled. Press Screen Capture and select the screen or window containing the question."
                : captureError instanceof Error ? captureError.message : "Screen capture failed. Please try again.";
            setError(message);
            showToast(message, cancelled ? "info" : "error");
        } finally {
            stream?.getTracks().forEach(track => track.stop());
            setIsScreenCapturing(false);
        }
    }, [processCapturedImage, showToast]);

    useEffect(() => {
        if (!window.electronAPI) return;
        return window.electronAPI.onProcessOcr(data => { void processCapturedImage(data.imageData); });
    }, [processCapturedImage]);

    // Handle End Interview - Save to history and navigate
    const handleEndInterview = async () => {
        if (isSavingRef.current) return;
        isSavingRef.current = true;
        sessionEndingRef.current = true;
        answerAbortRef.current?.abort();
        setIsSaving(true);
        setError(null);

        // Stop capture before saving, including when there is no session to save.
        isAiSpeakingRef.current = true;
        setIsRecording(false);
        setIsAutoMode(false);
        setIsCameraOn(false);
        setIsCameraVisible(false);
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        try { recognitionRef.current?.abort(); } catch { /* already stopped */ }
        isRecognitionActiveRef.current = false;
        setIsFinalizingCapture(true);
        try {
            await flushAndStopDesktopSTT();
        } finally {
            setIsFinalizingCapture(false);
        }
        stopScreenAudio();
        if (window.electronAPI) {
            void window.electronAPI.stopSystemAudioCapture().catch(console.error);
            if (isScannerActive) void window.electronAPI.toggleScannerFrame().catch(console.error);
        }

        const pendingQuestion = pendingQuestionRef.current.trim();
        const completeSpeech = fullTranscriptRef.current.trim();
        const remainingTranscript = [
            completeSpeech,
            pendingQuestion && !completeSpeech.includes(pendingQuestion) ? pendingQuestion : "",
            interimTranscript.trim(),
        ].filter(Boolean).join(" ");
        // Only save if there's meaningful content
        if (remainingTranscript.length < 10 && allQAPairs.length === 0) {
            await interviewAccess.finish(sessionIdRef.current).catch(console.error);
            sessionStorage.removeItem("allyx_access_session");
            isSavingRef.current = false;
            setIsSaving(false);
            router.push("/dashboard");
            return;
        }

        try {
            const title = interviewContext.type
                ? `${interviewContext.type} Meeting`
                : "Meeting Session";

            // Calculate interview duration in minutes
            const durationMinutes = Math.round((new Date().getTime() - interviewStartTime.getTime()) / 60000);

            // Format transcript with Q&A pairs for better history display
            const formattedTranscript = [
                allQAPairs.map((qa, idx) => `Q${idx + 1}: ${qa.question}\n\nA${idx + 1}: ${qa.answer}`).join('\n\n---\n\n'),
                remainingTranscript ? `Transcript:\n${remainingTranscript}` : '',
            ].filter(Boolean).join('\n\n---\n\n');

            await interviewService.saveInterview(
                title,
                formattedTranscript,
                {
                    job_description: interviewContext.jd,
                    interview_type: interviewContext.type,
                    language: interviewContext.lang,
                    ai_responses: allQAPairs.map(qa => qa.answer),
                    duration_minutes: durationMinutes,
                    questions: allQAPairs.map(qa => qa.question),
                    model_used: answerModel || interviewContext.model
                },
                sessionIdRef.current || undefined
            );
            showToast("Meeting saved to history", "success");
            await interviewAccess.finish(sessionIdRef.current).catch(console.error);
            sessionStorage.removeItem("allyx_access_session");
            localStorage.removeItem('interview_draft');
            router.push("/dashboard");
        } catch (error) {
            console.error("Failed to save interview:", error);
            sessionEndingRef.current = false;
            setError("Could not save this interview. Your transcript is still here. Check your connection and press End Interview to retry.");
        } finally {
            setIsSaving(false);
            isSavingRef.current = false;
        }
    };

    return (
        <div className="min-h-screen flex flex-col lg:flex-row gap-4 p-2 sm:p-4 pt-20 transition-colors duration-300 bg-gray-50 dark:bg-zinc-950 overflow-auto">
            {accessRemaining !== null && (
                <div className="fixed top-20 right-4 z-50 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 shadow dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
                    Free trial {Math.floor(accessRemaining / 60)}:{String(accessRemaining % 60).padStart(2, "0")}
                </div>
            )}
            {/* Error Banner */}
            {error && (
                <div className="fixed top-24 left-1/2 transform -translate-x-1/2 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50 flex items-center gap-2 shadow-lg">
                    <AlertCircle size={20} />
                    <span>{error}</span>
                    <Button variant="ghost" size="sm" onClick={() => setError(null)} className="ml-2 h-6 w-6 p-0 rounded-full hover:bg-red-200">
                        X
                    </Button>
                </div>
            )}

            {/* Settings Modal */}
            <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />

            {/* Left Panel: Video & Transcript */}
            <div className={cn("flex flex-col gap-4 transition-all duration-300 w-full", isCameraVisible ? "lg:w-1/2" : "lg:w-1/3")}>
                {/* Video Feed */}
                {isCameraVisible && (
                    <div className="flex-1 bg-black rounded-2xl overflow-hidden relative shadow-lg min-h-[300px]">
                        {isCameraOn ? (
                            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover transform scale-x-[-1]" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-500 bg-gray-900">
                                <VideoOff size={48} />
                            </div>
                        )}

                        <div className="absolute top-4 right-4 flex gap-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="text-white hover:bg-white/20"
                                onClick={() => setIsCameraVisible(!isCameraVisible)}
                                title={isCameraVisible ? "Hide Camera" : "Show Camera"}
                            >
                                {isCameraVisible ? <VideoOff size={20} /> : <Video size={20} />}
                            </Button>
                        </div>

                        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex items-center justify-center gap-6">
                            {/* Microphone Button */}
                            <button
                                onClick={toggleRecording}
                                disabled={isFinalizingCapture}
                                className={cn(
                                    "w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg backdrop-blur-sm",
                                    isRecording
                                        ? "bg-[#00D95A] text-white scale-110 shadow-green-500/40"
                                        : "bg-black/40 text-white hover:bg-black/60 border border-white/10"
                                )}
                                title={isFinalizingCapture ? "Finalizing transcription" : isRecording ? "Stop Recording" : "Start Recording"}
                            >
                                {isFinalizingCapture ? <Loader2 size={26} className="animate-spin" /> : <Mic size={26} strokeWidth={isRecording ? 2.5 : 2} />}
                            </button>

                            {/* Camera Toggle Button (Web Only) */}
                            {!isElectron && (
                                <button
                                    onClick={() => setIsCameraOn(!isCameraOn)}
                                    className={cn(
                                        "w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg backdrop-blur-sm",
                                        isCameraOn
                                            ? "bg-[#00D95A] text-white scale-110 shadow-green-500/40"
                                            : "bg-black/40 text-white hover:bg-black/60 border border-white/10"
                                    )}
                                    title={isCameraOn ? "Turn Camera Off" : "Turn Camera On"}
                                >
                                    {isCameraOn ? <Video size={26} strokeWidth={2.5} /> : <VideoOff size={26} strokeWidth={2} />}
                                </button>
                            )}

                            {/* Screen Audio Toggle Button (Electron Only) */}
                            {isElectron && (
                                <button
                                    onClick={toggleScreenAudio}
                                    className={cn(
                                        "w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg backdrop-blur-sm",
                                        isScreenAudioActive
                                            ? "bg-blue-500 text-white scale-110 shadow-blue-500/40"
                                            : "bg-black/40 text-white hover:bg-black/60 border border-white/10"
                                    )}
                                    title={isScreenAudioActive ? "Stop System Audio" : "Start System Audio (Screen Sharing)"}
                                >
                                    {isScreenAudioActive ? <Monitor size={26} strokeWidth={2.5} /> : <MonitorOff size={26} strokeWidth={2} />}
                                </button>
                            )}

                            {/* End Interview Button - Far Right */}
                            <button
                                onClick={handleEndInterview}
                                disabled={isSaving}
                                className="w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg backdrop-blur-sm bg-red-500 hover:bg-red-600 text-white disabled:opacity-50"
                                title="End Meeting"
                            >
                                {isSaving ? <Loader2 size={26} className="animate-spin" /> : <LogOut size={26} strokeWidth={2} />}
                            </button>
                        </div>
                    </div>
                )}

                {/* Hidden Camera State Controls */}
                {!isCameraVisible && (
                    <div className="flex justify-center gap-6 my-6 flex-wrap">
                        {/* Microphone Icon Button */}
                        <button
                            onClick={toggleRecording}
                            disabled={isFinalizingCapture}
                            className={cn(
                                "w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-md",
                                isRecording
                                    ? "bg-[#00D95A] text-white scale-110 shadow-green-500/30 ring-4 ring-green-100 dark:ring-green-900/30"
                                    : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                            )}
                            title={isFinalizingCapture ? "Finalizing transcription" : isRecording ? "Stop Recording" : "Start Recording"}
                        >
                            {isFinalizingCapture ? <Loader2 size={26} className="animate-spin" /> : <Mic size={26} strokeWidth={isRecording ? 2.5 : 2} />}
                        </button>

                        {/* Camera Icon Button (Web Only) */}
                        {!isElectron && (
                            <button
                                onClick={() => setIsCameraVisible(true)}
                                className={cn(
                                    "w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-md",
                                    isCameraOn
                                        ? "bg-[#00D95A] text-white scale-110 shadow-green-500/30 ring-4 ring-green-100 dark:ring-green-900/30"
                                        : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                                )}
                                title={isCameraOn ? "Camera On - Show" : "Camera Off - Show"}
                            >
                                {isCameraOn ? <Video size={26} strokeWidth={2.5} /> : <VideoOff size={26} strokeWidth={2} />}
                            </button>
                        )}

                        {/* Screen Audio Toggle Button (Electron Only) */}
                        {isElectron && (
                            <button
                                onClick={toggleScreenAudio}
                                className={cn(
                                    "w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-md",
                                    isScreenAudioActive
                                        ? "bg-blue-500 text-white scale-110 shadow-blue-500/30 ring-4 ring-blue-100 dark:ring-blue-900/30"
                                        : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                                )}
                                title={isScreenAudioActive ? "Stop System Audio" : "Start System Audio (Screen Sharing)"}
                            >
                                {isScreenAudioActive ? <Monitor size={26} strokeWidth={2.5} /> : <MonitorOff size={26} strokeWidth={2} />}
                            </button>
                        )}

                        {/* End Interview Button - Far Right */}
                        <button
                            onClick={handleEndInterview}
                            disabled={isSaving}
                            className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-md bg-red-500 hover:bg-red-600 text-white disabled:opacity-50"
                            title="End Meeting"
                        >
                            {isSaving ? <Loader2 size={26} className="animate-spin" /> : <LogOut size={26} strokeWidth={2} />}
                        </button>
                    </div>
                )}

                {/* Transcript Area */}
                <div className="h-1/3 p-4 rounded-2xl shadow-sm border flex flex-col bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                            <span className={cn("w-2 h-2 rounded-full", isRecording ? "bg-red-500 animate-pulse" : "bg-gray-300")}></span>
                            Live Transcript
                        </h3>
                        <div className="flex items-center gap-2">
                            {!isAutoMode && (
                                <Button
                                    size="sm"
                                    onClick={() => getAiAnswer()}
                                    disabled={isLoading || !transcript.trim()}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                    <Sparkles size={14} className="mr-1" /> Get Answer
                                </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => setTranscript("")} className="text-gray-400 hover:text-red-500">
                                <Trash2 size={16} />
                            </Button>
                        </div>
                    </div>
                    <div className="flex-1 rounded-xl p-4 overflow-y-auto text-base font-sans leading-loose bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 transition-colors">
                        {transcript}
                        {interimTranscript && (
                            <span className="text-gray-500 dark:text-gray-400 italic">
                                {interimTranscript}
                                <span className="animate-pulse">|</span>
                            </span>
                        )}
                        {!transcript && !interimTranscript && "Click the microphone to start listening..."}
                    </div>
                </div>
            </div>

            {/* Right Panel: AI Response */}
            <div className="w-full lg:w-1/2 flex flex-col gap-4">
                <div className="p-6 rounded-2xl shadow-sm border flex-1 flex flex-col bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 transition-colors">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                        <h3 className="font-bold flex items-center gap-2 text-lg text-gray-900 dark:text-white">
                            <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
                            AI Copilot
                        </h3>
                        {answerModel && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                Answered by {answerModel}{answerModel !== interviewContext.model ? " (fallback)" : ""}
                            </span>
                        )}
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    const next = !isAutoMode;
                                    autoAnswerPreferenceRef.current = next;
                                    setIsAutoMode(next);
                                }}
                                className={cn(
                                    "gap-2 text-xs sm:text-sm transition-all duration-300",
                                    isAutoMode
                                        ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500 shadow-lg shadow-emerald-500/20"
                                        : "bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-zinc-700"
                                )}
                            >
                                <Sparkles size={14} />
                                <span className="hidden sm:inline">{isAutoMode ? "Auto Answer ON" : "Auto Answer OFF"}</span>
                                <span className="sm:hidden">{isAutoMode ? "Auto ON" : "Auto OFF"}</span>
                            </Button>

                            <Button
                                onClick={async () => {
                                    if (window.electronAPI) {
                                        const res = await window.electronAPI.toggleScannerFrame();
                                        setIsScannerActive(res.active);
                                    } else {
                                        await captureBrowserScreen();
                                    }
                                }}
                                disabled={isScreenCapturing || isLoading}
                                variant={isScannerActive ? "default" : "outline"}
                                size="sm"
                                className={cn(
                                    "gap-2 text-xs sm:text-sm transition-all duration-300",
                                    isScannerActive
                                        ? "bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20"
                                        : "bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-zinc-700"
                                )}
                            >
                                {isScreenCapturing ? <Loader2 size={14} className="animate-spin" /> : <Scan size={14} />}
                                <span className="hidden sm:inline">{isScreenCapturing ? "Capturing…" : isScannerActive ? "Close Scanner" : "Screen Capture"}</span>
                                <span className="sm:hidden">{isScreenCapturing ? "Wait…" : isScannerActive ? "Close" : "Capture"}</span>
                            </Button>
                        </div>
                    </div>

                    {/* Manual Input for Coding Questions */}
                    <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Manual Question / Code
                            </label>
                            {manualQuestion && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setManualQuestion("")}
                                    className="h-6 px-2 text-gray-400 hover:text-red-500 text-[10px] gap-1"
                                >
                                    <Trash2 size={12} /> Clear
                                </Button>
                            )}
                        </div>
                        <div className="relative">
                            <textarea
                                value={manualQuestion}
                                onChange={(e) => setManualQuestion(e.target.value)}
                                placeholder="Paste coding question or type here... (Press Enter to ask)"
                                className="w-full p-4 pr-12 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50 resize-y min-h-[120px] text-gray-800 dark:text-gray-200 shadow-sm"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleManualSubmit();
                                    }
                                }}
                            />
                            <Button
                                size="icon"
                                onClick={handleManualSubmit}
                                disabled={isLoading || !contextReady || !manualQuestion.trim()}
                                className="absolute bottom-3 right-3 h-9 w-9 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-md disabled:opacity-50 transition-all hover:scale-105"
                                title="Get Answer"
                            >
                                <Sparkles size={18} />
                            </Button>
                        </div>
                    </div>

                    {!isElectron ? <div className="flex-1 min-h-[320px] max-h-[65vh] rounded-xl p-6 overflow-y-auto overscroll-contain prose prose-lg max-w-none bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-colors relative">
                        <div className="absolute top-2 right-2 flex gap-1">
                            {/* Retry Button - always shows when lastTranscript exists */}
                            {lastTranscript && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                    onClick={() => getAiAnswer(lastTranscript)}
                                    disabled={isLoading}
                                    title="Retry last question"
                                >
                                    <RotateCcw size={16} />
                                </Button>
                            )}
                            {/* Copy Button */}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                onClick={() => {
                                    navigator.clipboard.writeText(aiResponse.replace(/\*\*/g, '').replace(/\*/g, ''));
                                    showToast("Copied to clipboard!", "success");
                                }}
                                title="Copy to clipboard"
                            >
                                <Copy size={16} />
                            </Button>
                        </div>
                        <div className="leading-loose text-lg">
                            <ReactMarkdown>{aiResponse}</ReactMarkdown>
                        </div>
                    </div> : <div className="flex min-h-[140px] items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center">
                        <div>
                            <p className="font-semibold text-gray-800 dark:text-gray-100">Answers are displayed in the desktop overlay.</p>
                            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Press Command+Shift+O to interact with the overlay while keeping this window as session controls.</p>
                            {isLoading && <p className="mt-3 text-sm text-emerald-500 animate-pulse">Generating and streaming the answer…</p>}
                        </div>
                    </div>}
                    {!isElectron && answerTruncated && (
                        <div role="status" className="mt-2 flex flex-wrap items-center gap-3 text-sm text-amber-600 dark:text-amber-400">
                            <span>The model reached its output limit.</span>
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={isLoading}
                                onClick={() => getAiAnswer("Continue exactly from the last sentence without repeating the previous answer.", true)}
                            >
                                Continue answer
                            </Button>
                        </div>
                    )}

                    {/* Debug Info */}
                    <div className="mt-4 text-xs text-center text-gray-400">
                        {isAutoMode ? "AI will answer automatically after you stop speaking." : "Use Get Answer when the complete question is ready."}
                    </div>
                    {/* Debug Info */}
                    <div className="mt-2 text-[10px] text-gray-300 text-center">
                        Context Loaded: User File ({interviewContext.resume.length} chars) | Agenda ({interviewContext.jd.length} chars)
                    </div>

                </div>
            </div>

        </div>
    );
}
