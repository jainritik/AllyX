"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Video, VideoOff, Loader2, AlertCircle, Sparkles, Trash2, LogOut, Copy, RotateCcw, Monitor, MonitorOff, Scan, ShieldCheck, CircleAlert } from "lucide-react";
import { createWorker } from 'tesseract.js';
import { cn } from "@/lib/utils";
import { supportsCoordinatedScannerCapture } from "@/lib/native-scanner-bridge";
import ReactMarkdown from 'react-markdown';

import { useRouter } from "next/navigation";
import { SettingsDialog } from "@/components/settings-dialog";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { interviewService } from "@/lib/interview-service";
import { useAuth } from "@/lib/auth";
import { loadInterviewContext, readInterviewContext } from "@/lib/interview-context";
import { interviewAccess } from "@/lib/interview-access";
import { createLiveQuestionState } from "@/lib/live-question-state";

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

type TranscriptionSegment = {
    audio: Blob;
    epoch: number;
    sequence: number;
    finalizesQuestion: boolean;
};

type DesktopPermissions = {
    screen: string;
    microphone: string;
    platform: string;
};

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
    // Browser speech recognition is used only as an immediate on-screen preview.
    // Whisper remains the canonical transcript because it can also hear meeting audio.
    const liveCaptionRef = useRef("");
    const isRecordingRef = useRef(false);
    const deviceRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const autoAnswerPreferenceRef = useRef(true);
    const isAiSpeakingRef = useRef(false);
    const isRecognitionActiveRef = useRef(false);
    const isSavingRef = useRef(false);
    const answerInFlightRef = useRef(false);
    const answerAbortRef = useRef<AbortController | null>(null);
    const pendingQuestionRef = useRef("");
    const sessionEndingRef = useRef(false);
    const captureEpochRef = useRef(0);
    const screenCaptureEpochRef = useRef(0);
    // Only the canonical audio VAD may decide that a question has ended.
    // Browser SpeechRecognition is a best-effort caption preview and must not
    // accidentally trigger an answer at one of its phrase boundaries.
    const vadSpeechActiveRef = useRef(false);
    const recordingStartRef = useRef(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const flushRecorderRef = useRef<(() => Promise<void>) | null>(null);
    const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Groq Whisper accepts completed audio files rather than a token stream. Keep
    // requests ordered and below the provider's free-tier rate limit so captions
    // never arrive in the wrong order or disappear during rate-limit retries.
    const pendingTranscriptionsRef = useRef<TranscriptionSegment[]>([]);
    const transcriptionDrainRef = useRef<(() => Promise<void>) | null>(null);
    const isTranscriptionDrainActiveRef = useRef(false);
    const activeTranscriptionTaskRef = useRef<Promise<void> | null>(null);
    const transcriptionAbortControllersRef = useRef(new Set<AbortController>());
    const transcriptionEpochRef = useRef(0);
    const nextTranscriptionSequenceRef = useRef(0);
    const nextTranscriptionToProcessRef = useRef(1);
    const skippedTranscriptionSequencesRef = useRef(new Set<number>());
    const questionStateRef = useRef(createLiveQuestionState());
    const autoAnswerEnabledRef = useRef(true);
    const pendingAutoQuestionsRef = useRef<string[]>([]);
    const processPendingAutoAnswersRef = useRef<() => void>(() => {});
    const pendingCapturedQuestionRef = useRef<string | null>(null);
    const processPendingCapturedAnswerRef = useRef<() => void>(() => {});
    const captureProcessingRef = useRef(false);
    // Keep the native IPC subscription stable while React re-renders during an
    // answer stream. The subscription dispatches to this current callback so a
    // screenshot cannot arrive in the brief unsubscribe/re-subscribe gap.
    const processCapturedImageRef = useRef<(imageData: string, options?: { reserved?: boolean }) => Promise<void>>(async () => {});
    const retryQuestionRef = useRef("");
    // Electron uses the MediaRecorder pipeline as the canonical transcript.
    // Chromium SpeechRecognition is a provisional microphone caption preview:
    // it starts only after the recorder and disables itself if this Mac cannot
    // provide both audio paths reliably.
    const previewUnavailableRef = useRef(false);
    const recoveryGenerationRef = useRef(0);
    const draftHydratedRef = useRef(false);
    const sessionIdRef = useRef("");
    const fullTranscriptRef = useRef("");
    const historySavedRef = useRef(false);
    const toggleRecordingActionRef = useRef<() => void>(() => {});
    const endInterviewActionRef = useRef<() => void>(() => {});

    // API Key no longer needed - using server-side Groq
    const [showSettings, setShowSettings] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isFinalizingCapture, setIsFinalizingCapture] = useState(false);
    const [transcript, setTranscript] = useState("");
    const [fullTranscript, setFullTranscript] = useState("");
    const [interimTranscript, setInterimTranscript] = useState("");
    const [aiResponse, setAiResponse] = useState("## Ready to Assist\n\nI am your AllyX interview assistant. I will listen to your interview and provide real-time context.\n\n**Instructions:**\n1. Click the microphone to start listening.\n2. Speak your question or discussion point.\n3. When you need context, click **Get Answer**.");
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
    const [retryQuestion, setRetryQuestion] = useState("");
    const [allQAPairs, setAllQAPairs] = useState<{ question: string, answer: string }[]>([]); // Track Q&A pairs
    const [isSaving, setIsSaving] = useState(false);
    const [interviewStartTime, setInterviewStartTime] = useState<Date>(new Date());
    const [manualQuestion, setManualQuestion] = useState(""); // Manual input for coding questions
    const [isScreenAudioActive, setIsScreenAudioActive] = useState(false);
    const [meetingAudioSources, setMeetingAudioSources] = useState<Array<{ id: string; name: string }>>([]);
    const [selectedMeetingAudioSource, setSelectedMeetingAudioSource] = useState("");
    const [isLoadingMeetingAudioSources, setIsLoadingMeetingAudioSources] = useState(false);
    const [capturePermissionNeedsRestart, setCapturePermissionNeedsRestart] = useState(false);
    const [desktopPermissions, setDesktopPermissions] = useState<DesktopPermissions | null>(null);
    const [isCheckingDesktopPermissions, setIsCheckingDesktopPermissions] = useState(false);
    const [isRequestingMicrophonePermission, setIsRequestingMicrophonePermission] = useState(false);
    const [audioCaptureStatus, setAudioCaptureStatus] = useState<"idle" | "waiting" | "hearing" | "transcribing" | "no-signal">("idle");
    const [isScreenCapturing, setIsScreenCapturing] = useState(false);
    const screenStreamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const screenSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const screenSourceIdRef = useRef<string | null>(null);
    const [isScannerActive, setIsScannerActive] = useState(false);
    const [hasMounted, setHasMounted] = useState(false);
    const [contextReady, setContextReady] = useState(false);
    const [accessReady, setAccessReady] = useState(false);
    const [accessRemaining, setAccessRemaining] = useState<number | null>(null);
    const lastAudibleSignalAtRef = useRef(0);
    const lastAudioStatusUpdateAtRef = useRef(0);

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

    const cancelDeviceRecovery = useCallback(() => {
        recoveryGenerationRef.current += 1;
        if (deviceRecoveryTimerRef.current) {
            clearTimeout(deviceRecoveryTimerRef.current);
            deviceRecoveryTimerRef.current = null;
        }
    }, []);

    const invalidateTranscriptionPipeline = useCallback(() => {
        transcriptionEpochRef.current += 1;
        nextTranscriptionSequenceRef.current = 0;
        nextTranscriptionToProcessRef.current = 1;
        skippedTranscriptionSequencesRef.current.clear();
        pendingTranscriptionsRef.current = [];
        pendingAutoQuestionsRef.current = [];
        questionStateRef.current.clear();
        retryQuestionRef.current = "";
        liveCaptionRef.current = "";
        transcriptionAbortControllersRef.current.forEach(controller => controller.abort());
        transcriptionAbortControllersRef.current.clear();
    }, []);

    const resetTranscriptionPipeline = useCallback(() => {
        invalidateTranscriptionPipeline();
        setRetryQuestion("");
    }, [invalidateTranscriptionPipeline]);

    useEffect(() => {
        isRecordingRef.current = isRecording;
    }, [isRecording]);

    useEffect(() => {
        autoAnswerEnabledRef.current = isAutoMode;
    }, [isAutoMode]);

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
                if (typeof draft.transcript === 'string') {
                    setTranscript(draft.transcript);
                    questionStateRef.current.append(draft.transcript);
                }
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
        if (!accountId || !sessionIdRef.current || !contextReady || !window.electronAPI?.isElectron) return;
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
    }, [accountId, contextReady]);

    useEffect(() => {
        if (accessRemaining === null || accessRemaining <= 0) return;
        const timer = window.setInterval(() => setAccessRemaining(value => value === null ? null : Math.max(0, value - 1)), 1000);
        return () => window.clearInterval(timer);
    }, [accessRemaining]);

    useEffect(() => {
        if (accessRemaining !== 0 || !accessReady) return;
        setAccessReady(false);
        autoAnswerEnabledRef.current = false;
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
        if (!window.electronAPI?.isElectron) {
            setError("Live interview sessions require the AllyX desktop app. Browser screen sharing can make this page visible to other participants.");
            router.replace("/dashboard/new/how-to-use");
            return;
        }
        let cancelled = false;
        const load = async () => {
        try {
            const saved = await loadInterviewContext(accountId);
            if (cancelled) return;
            if (!saved) {
                setError("Interview setup is missing. Return to setup and start again.");
                router.replace("/dashboard/new");
                return;
            }
            setInterviewContext({ type: saved.type, jd: saved.jd, resume: saved.resume, lang: saved.lang, model: saved.model });
            setContextReady(true);
        } catch {
            if (cancelled) return;
            setError("Interview setup could not be read. Return to setup and start again.");
            router.replace("/dashboard/new");
            return;
        }
        };
        void load();

        // v18.0: Listen for scanner state changes (Atomic Sync)
        if (typeof window !== 'undefined' && window.electronAPI?.onScannerStateChange) {
            const cleanup = window.electronAPI.onScannerStateChange((active: boolean) => {
                console.log('[Sync] Scanner state changed:', active);
                setIsScannerActive(active);
            });
            return () => { cancelled = true; cleanup(); };
        }
        return () => { cancelled = true; };
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

    const refreshDesktopPermissions = useCallback(async () => {
        if (!window.electronAPI?.isElectron || !window.electronAPI.getDesktopPermissions) return;
        setIsCheckingDesktopPermissions(true);
        try {
            const permissions = await window.electronAPI.getDesktopPermissions();
            setDesktopPermissions(permissions);
        } catch {
            setDesktopPermissions(null);
        } finally {
            setIsCheckingDesktopPermissions(false);
        }
    }, []);

    const requestMicrophonePermission = useCallback(async () => {
        if (!window.electronAPI?.requestMicrophoneAccess) return;
        setIsRequestingMicrophonePermission(true);
        try {
            const result = await window.electronAPI.requestMicrophoneAccess();
            await refreshDesktopPermissions();
            if (!result.granted) setError("Microphone access is needed to transcribe your voice. Allow it in macOS Settings, then return here.");
        } catch {
            setError("AllyX could not request microphone access. Allow it in macOS Settings, then return here.");
        } finally {
            setIsRequestingMicrophonePermission(false);
        }
    }, [refreshDesktopPermissions]);

    useEffect(() => {
        if (isElectron) void refreshDesktopPermissions();
    }, [isElectron, refreshDesktopPermissions]);

    const screenPermissionReady = desktopPermissions?.screen === "granted" || desktopPermissions?.screen === "not-applicable";
    const microphonePermissionReady = desktopPermissions?.microphone === "granted" || desktopPermissions?.microphone === "not-applicable";

    const getAiAnswer = useCallback(async (
        explicitQuestion?: string,
        continuation = false,
        consumePracticeQuestion = false,
        preserveForRetry = false,
        queueIfBusy = false,
    ) => {
        if (!accessReady) {
            setError("Interview access is not active. Start a new session or choose an interview pack.");
            return;
        }
        const consumesLiveTranscript = consumePracticeQuestion || explicitQuestion === undefined;
        // The visible caption remains on screen while the answer streams. The
        // question buffer is separate so the next spoken question can start
        // cleanly without erasing what the participant just said.
        const transcriptToUse = explicitQuestion || (consumesLiveTranscript
            ? questionStateRef.current.current()
            : transcript);

        // No API key check needed - server has Groq configuration
        if (!transcriptToUse.trim()) {
            if (!isAutoMode) setError("No transcript to analyze. Please speak first.");
            return;
        }
        if (answerInFlightRef.current) {
            if (queueIfBusy && explicitQuestion?.trim()) {
                pendingCapturedQuestionRef.current = explicitQuestion.trim();
                window.electronAPI?.sendOverlayStatus?.("Code captured. The current answer will finish before this one starts.", "progress");
                return;
            }
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
            questionStateRef.current.consume();
            setInterimTranscript("");
        }

        setIsLoading(true);
        setError(null);
        window.electronAPI?.sendOverlayStatus?.("Generating answer…", "progress");

        // Answer rendering is text-only. Keep the microphone/caption path alive
        // so a completed answer never disables later practice questions.

        let requestTimeout: ReturnType<typeof setTimeout> | null = null;
        let streamedText = "";
        const answerPrefix = continuation ? `${aiResponse}\n\n` : "";
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
           - For a simple factual question, give a complete answer in roughly 3-6 spoken sentences.
           - For technical questions, give the complete answer, not an outline or a shortened summary. Explain the approach, key trade-offs, edge cases, and a concrete example. Aim for a natural 60-90 second spoken answer unless the user requested another length.
           - For coding questions, state the algorithm, provide correct readable code when useful, then explain why it works and finish with time/space complexity and edge cases.
           - For architecture and system-design questions, clarify assumptions, describe components and data flow, then cover scaling, reliability, security, observability, and trade-offs.
           - Answer every distinct part of a multi-part question. Lead with the conclusion, use short spoken paragraphs, and never add filler, a preamble, or meta-commentary about being an assistant.
        4. **INTERVIEW STRATEGY**: Focus on problem-solving, impact, and clarity. State uncertainty instead of fabricating facts.
        5. **LANGUAGE**: Strictly use ${interviewContext.lang}.
           - If 'ar-EG', use professional Egyptian Arabic (Ammiya) but keep technical terms in English where appropriate. Avoid overly formal Fusha.
           - If 'en-US', use professional corporate English.

        LANGUAGE SPECIFICS (ar-EG):
        - Use professional yet natural Egyptian terms like "حضرتك", "الفكرة إن", "بناءً على خبرتي".
        - Avoid stiff Standard Arabic.

        CONTEXT:
        - Interview type: ${interviewContext.type}
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
            let finishReason = "";
            let lastOverlayUpdate = 0;
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
                            streamedText += eventData.content || "";
                            if (eventData.finishReason) finishReason = eventData.finishReason;
                        } catch { /* Ignore malformed event. */ }
                    }
                    if (streamedText) {
                        const liveAnswer = `${answerPrefix}${streamedText}`;
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
            if (!streamedText.trim()) throw new Error("Empty response from AI.");
            if (sessionEndingRef.current) return;

            const completeAnswer = `${answerPrefix}${streamedText}`;
            setAiResponse(completeAnswer);
            const effectiveModel = response.headers.get("X-ALLYX-Model") || interviewContext.model;
            setAnswerModel(effectiveModel);
            setAnswerTruncated(finishReason === "length");
            const fallbackMessage = effectiveModel !== interviewContext.model
                ? `Answered by ${effectiveModel} because the selected model was unavailable.`
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
                if (!continuation || prev.length === 0) return [...prev, { question: currentTranscript.trim(), answer: streamedText }];
                const updated = [...prev];
                const last = updated[updated.length - 1];
                updated[updated.length - 1] = { ...last, answer: `${last.answer}\n\n${streamedText}` };
                return updated;
            });
            if (!continuation) {
                pendingQuestionRef.current = "";
                retryQuestionRef.current = "";
                setRetryQuestion("");
            }
        } catch (error: unknown) {
            const err = error as Error;
            if (sessionEndingRef.current) return;
            console.error("Error generating AI response:", err);
            let errorMessage = "Could not generate response.";
            if (err.name === "AbortError") {
                errorMessage = "The AI response timed out. Check your connection and retry.";
            } else if (err.message === "Usage accounting is unavailable" || err.message === "Interview access verification is unavailable") {
                errorMessage = "AllyX could not confirm session usage right now. Your time and credits are safe. Wait a moment, then try again.";
            } else if (err.message.includes("429")) {
                errorMessage = "AI is busy (Rate Limit). Please try again.";
            } else if (err.message.includes("configuration missing")) {
                errorMessage = "Server AI configuration error. Please contact support.";
            } else if (err.message === "Failed to fetch" || err instanceof TypeError) {
                errorMessage = "Network connection lost while contacting the AI service. Check your connection and retry.";
            } else {
                errorMessage = err.message;
            }
            if (streamedText.trim()) {
                const interruptedAnswer = `${answerPrefix}${streamedText}`;
                setAiResponse(interruptedAnswer);
                setAnswerTruncated(true);
                setAllQAPairs(prev => {
                    if (!continuation || prev.length === 0) return [...prev, { question: currentTranscript.trim(), answer: streamedText }];
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    updated[updated.length - 1] = { ...last, answer: `${last.answer}\n\n${streamedText}` };
                    return updated;
                });
                if (!continuation) pendingQuestionRef.current = "";
                window.electronAPI?.sendAnswer?.(interruptedAnswer);
                window.electronAPI?.sendOverlayStatus?.("The connection stopped before the answer finished. Press Continue to resume it.", "error", "continue");
            } else if (!continuation) {
                setAiResponse(`**Error:** ${errorMessage}`);
                setAnswerTruncated(false);
                if (preserveForRetry) {
                    retryQuestionRef.current = currentTranscript;
                    setRetryQuestion(currentTranscript);
                    autoAnswerEnabledRef.current = false;
                    setIsAutoMode(false);
                }
            }
            setError(errorMessage);
            if (!streamedText.trim()) window.electronAPI?.sendOverlayStatus?.(errorMessage, "error");
        } finally {
            if (requestTimeout) clearTimeout(requestTimeout);
            answerAbortRef.current = null;
            answerInFlightRef.current = false;
            setIsLoading(false);
            if (!sessionEndingRef.current) {
                setTimeout(() => {
                    processPendingCapturedAnswerRef.current();
                    processPendingAutoAnswersRef.current();
                }, 0);
            }
        }
    }, [accessReady, aiResponse, allQAPairs, interviewContext, transcript, isAutoMode]);

    const processPendingAutoAnswers = useCallback(() => {
        if (!autoAnswerEnabledRef.current || sessionEndingRef.current || answerInFlightRef.current) return;
        const question = pendingAutoQuestionsRef.current.shift();
        if (!question) return;
        // The VAD has already snapshotted and cleared this exact question. Pass it
        // explicitly so another caller cannot merge it with speech that begins
        // while the previous answer is still streaming.
        void getAiAnswer(question, false, false, true);
    }, [getAiAnswer]);
    processPendingAutoAnswersRef.current = processPendingAutoAnswers;

    const processPendingCapturedAnswer = useCallback(() => {
        if (sessionEndingRef.current || answerInFlightRef.current) return;
        const question = pendingCapturedQuestionRef.current;
        if (!question) return;
        pendingCapturedQuestionRef.current = null;
        void getAiAnswer(question, false, false, false, true);
    }, [getAiAnswer]);
    processPendingCapturedAnswerRef.current = processPendingCapturedAnswer;

    const handleManualSubmit = () => {
        if (!contextReady) {
            setError("Interview setup is not ready. Return to setup and start again.");
            return;
        }
        const question = manualQuestion.trim() || retryQuestionRef.current;
        if (!question) return;
        getAiAnswer(question);
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
        window.electronAPI?.setInterviewReady?.(contextReady && accessReady);
        return () => window.electronAPI?.setInterviewReady?.(false);
    }, [accessReady, contextReady]);

    useEffect(() => window.electronAPI?.onScannerStateChange?.((active: boolean) => {
        setIsScannerActive(active);
    }), []);

    // --- SCREEN AUDIO CAPTURE (ELECTRON ONLY) ---
    const stopScreenAudio = useCallback(() => {
        screenCaptureEpochRef.current++;
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(t => t.stop());
            screenStreamRef.current = null;
        }
        screenSourceIdRef.current = null;
        if (screenSourceRef.current) {
            screenSourceRef.current.disconnect();
            screenSourceRef.current = null;
        }
        setIsScreenAudioActive(false);
        console.log("[Screen Audio] Stopped");
    }, []);

    useEffect(() => window.electronAPI?.onStopAudioSource?.(() => stopScreenAudio()), [stopScreenAudio]);

    const loadMeetingAudioSources = useCallback(async (reportFailure = true) => {
        if (!window.electronAPI?.isElectron) return [] as Array<{ id: string; name: string }>;
        setIsLoadingMeetingAudioSources(true);
        let failureMessage = "Could not list the available displays for meeting audio.";
        try {
            // macOS can briefly return an empty desktopCapturer list just after
            // the app regains focus or the customer closes System Settings. Retry
            // once automatically before showing a setup error.
            for (let attempt = 0; attempt < 2; attempt += 1) {
                try {
                    const result = await window.electronAPI.listSystemAudioSources();
                    if (result.success && result.sources.length) {
                        const sources = result.sources;
                        setMeetingAudioSources(sources);
                        setSelectedMeetingAudioSource(current => {
                            if (sources.some(source => source.id === current)) return current;
                            return sources.length === 1 ? sources[0].id : "";
                        });
                        return sources;
                    }
                    failureMessage = result.error || failureMessage;
                } catch {
                    failureMessage = "Could not list the available displays for meeting audio. Refresh and try again.";
                }
                if (attempt === 0) await new Promise<void>(resolve => window.setTimeout(resolve, 600));
            }
            // Starting the microphone must never look broken simply because macOS
            // is still enumerating displays. Explicit refresh and audio-start
            // actions still report the actionable source-listing failure.
            if (reportFailure) setError(failureMessage);
            return [];
        } finally {
            setIsLoadingMeetingAudioSources(false);
        }
    }, []);

    useEffect(() => {
        if (isElectron) void loadMeetingAudioSources(false);
    }, [isElectron, loadMeetingAudioSources]);

    const connectScreenAudio = useCallback(async (sourceId: string) => {
        if (screenSourceIdRef.current === sourceId && screenStreamRef.current) return true;
        const epoch = screenCaptureEpochRef.current;
        try {
            if (!navigator.mediaDevices?.getUserMedia) throw new Error("System audio capture is not supported.");
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    // @ts-expect-error Electron desktop-capture constraint
                    mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId }
                },
                video: {
                    // @ts-expect-error Electron desktop-capture constraint
                    mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId }
                }
            });
            if (epoch !== screenCaptureEpochRef.current || window.electronAPI?.isPresentationSafeMode()) {
                stream.getTracks().forEach(track => track.stop());
                return false;
            }
            const audioTrack = stream.getAudioTracks()[0];
            if (!audioTrack || audioTrack.readyState !== "live") {
                stream.getTracks().forEach(track => track.stop());
                throw new Error("The selected display did not provide a live audio stream.");
            }
            screenStreamRef.current?.getTracks().forEach(track => track.stop());
            screenStreamRef.current = stream;
            screenSourceIdRef.current = sourceId;
            if (audioContextRef.current && analyserRef.current) {
                screenSourceRef.current?.disconnect();
                const source = audioContextRef.current.createMediaStreamSource(new MediaStream([audioTrack]));
                source.connect(analyserRef.current);
                screenSourceRef.current = source;
            }
            setIsScreenAudioActive(true);
            audioTrack.onended = () => {
                stopScreenAudio();
                if (!sessionEndingRef.current) setError("Meeting audio stopped. Press Start listening to reconnect it.");
            };
            return true;
        } catch (error) {
            console.error("[Meeting Audio] Failed:", error);
            setIsScreenAudioActive(false);
            const detail = error instanceof Error ? error.message : "";
            const platformHint = (window.electronAPI?.platform === "darwin" || navigator.userAgent.toLowerCase().includes("mac"))
                ? "Check Screen & System Audio permission in macOS Settings, then restart AllyX."
                : "Check the selected display and your operating system's screen/audio capture permission.";
            const message = detail
                ? `Meeting audio could not start for the selected display. ${detail}`
                : `Meeting audio could not start for the selected display. ${platformHint}`;
            setError(message);
            window.electronAPI?.sendOverlayStatus?.(message, "error");
            return false;
        }
    }, [stopScreenAudio]);

    const startMeetingAudio = useCallback(async (sourceId?: string) => {
        if (!isElectron || screenStreamRef.current) return Boolean(screenStreamRef.current);
        // Avoid repeatedly showing a macOS setup prompt after the person has
        // already completed it for this installed copy. A transient display
        // enumeration failure is not evidence that permission was revoked.
        if (desktopPermissions?.platform === "darwin" && !screenPermissionReady) {
            setCapturePermissionNeedsRestart(true);
            setError("Complete Screen & System Audio setup below, then restart AllyX once before starting interviewer audio.");
            return false;
        }
        const result = await window.electronAPI?.startSystemAudioCapture(sourceId);
        if (!result?.success || !result.sourceId) {
            const message = result?.error || "Meeting audio could not be started. Microphone listening is still available.";
            setCapturePermissionNeedsRestart(Boolean(result?.restartRequired) && !screenPermissionReady);
            setError(message);
            window.electronAPI?.sendOverlayStatus?.(message, "error");
            return false;
        }
        setCapturePermissionNeedsRestart(false);
        return connectScreenAudio(result.sourceId);
    }, [connectScreenAudio, desktopPermissions?.platform, isElectron, screenPermissionReady]);

    const toggleScreenAudio = async () => {
        if (!isElectron) return;
        if (isScreenAudioActive) {
            stopScreenAudio();
            await window.electronAPI?.stopSystemAudioCapture();
        } else {
            const sources = await loadMeetingAudioSources();
            let sourceId = selectedMeetingAudioSource;
            if (!sourceId && sources.length === 1) sourceId = sources[0].id;
            if (!sourceId) {
                setError("Choose the display that contains your meeting, then start interviewer audio.");
                return;
            }
            await startMeetingAudio(sourceId);
        }
    };

    useEffect(() => window.electronAPI?.onAudioSourceReady?.((sourceId: string) => {
        void connectScreenAudio(sourceId);
    }), [connectScreenAudio]);

    // --- DESKTOP STT (ordered Groq Whisper segments + voice activity detection) ---
    const activeStreamsRef = useRef<MediaStream[]>([]);

    // Ignore only exact non-speech captions. Real phrases must remain available to the AI.
    const NON_SPEECH_CAPTIONS = new Set(["[music]", "[applause]", "(music)", "(applause)"]);

    const processGroqAudio = async (segment: TranscriptionSegment): Promise<string | null> => {
        if (segment.epoch !== transcriptionEpochRef.current || segment.audio.size < 2000) return null;

        const selectedLanguage = interviewContext.lang.split('-')[0];
        const langCode = selectedLanguage === 'fil' ? 'tl' : selectedLanguage;
        const buildFormData = () => {
            const formData = new FormData();
            formData.append('file', segment.audio, 'audio.webm');
            formData.append('model', 'whisper-large-v3-turbo');
            formData.append('language', langCode);
            if (langCode === 'en') formData.append('prompt', 'This is an English professional practice interview conversation.');
            if (langCode === 'ar') formData.append('prompt', 'هذه محادثة تدريبية مهنية باللغة العربية.');
            return formData;
        };

        setAudioCaptureStatus("transcribing");
        let response: Response | null = null;
        let lastFailure: unknown = null;
        const waitWhileCurrent = async (milliseconds: number) => {
            const deadline = Date.now() + milliseconds;
            while (Date.now() < deadline) {
                if (segment.epoch !== transcriptionEpochRef.current) return false;
                await new Promise<void>(resolve => window.setTimeout(resolve, Math.min(100, deadline - Date.now())));
            }
            return segment.epoch === transcriptionEpochRef.current;
        };

        for (let attempt = 0; attempt < 3; attempt += 1) {
            if (segment.epoch !== transcriptionEpochRef.current) return null;
            const controller = new AbortController();
            transcriptionAbortControllersRef.current.add(controller);
            const timeout = window.setTimeout(() => controller.abort(), 25000);
            try {
                response = await fetch('/api/transcribe', {
                    method: 'POST',
                    headers: { "X-ALLYX-Session-ID": sessionIdRef.current },
                    body: buildFormData(),
                    signal: controller.signal,
                });
                if (response.ok) break;
                lastFailure = new Error(`Transcription request returned ${response.status}`);
            } catch (error) {
                lastFailure = error;
            } finally {
                window.clearTimeout(timeout);
                transcriptionAbortControllersRef.current.delete(controller);
            }

            if (segment.epoch !== transcriptionEpochRef.current) return null;
            const retryable = !response || response.status === 429 || response.status === 503;
            if (!retryable || attempt === 2) break;
            const retryAfter = response?.headers.get('retry-after') ?? null;
            const seconds = retryAfter ? Number(retryAfter) : Number.NaN;
            const waitMs = Number.isFinite(seconds) && seconds > 0
                ? Math.min(seconds * 1000, 8000)
                : 1200 * (attempt + 1);
            if (!await waitWhileCurrent(waitMs)) return null;
        }

        if (segment.epoch !== transcriptionEpochRef.current) return null;
        if (!response?.ok) {
            console.error("[Desktop STT] transcription request failed", lastFailure);
            setAudioCaptureStatus("waiting");
            setError("Live captions could not reconnect. Check your connection, then stop and start listening.");
            window.electronAPI?.sendOverlayStatus?.("Live captions could not reconnect. Stop and start listening to retry.", "error");
            return null;
        }

        let data: { text?: string };
        try {
            data = await response.json() as { text?: string };
        } catch (error) {
            console.error("[Desktop STT] transcription response could not be read", error);
            setAudioCaptureStatus("waiting");
            setError("Live captions received an unreadable response. Stop and start listening to retry.");
            return null;
        }
        if (segment.epoch !== transcriptionEpochRef.current) return null;
        const newText = typeof data.text === 'string' ? data.text.trim() : '';
        if (!newText || NON_SPEECH_CAPTIONS.has(newText.toLowerCase())) {
            setAudioCaptureStatus("waiting");
            return null;
        }
        return newText;
    };

    const commitTranscriptSegment = (segment: TranscriptionSegment, text: string) => {
        if (segment.epoch !== transcriptionEpochRef.current) return;
        const previousQuestion = questionStateRef.current.current();
        const currentQuestion = questionStateRef.current.append(text);
        const novelText = currentQuestion.slice(previousQuestion.length).trim();
        if (!novelText) return;

        // The browser recognizer is only a provisional preview. Preserve the
        // server transcript and keep the complete current question visible while
        // the answer request is in progress.
        liveCaptionRef.current = "";
        setInterimTranscript("");
        appendFullTranscript(novelText);
        setTranscript(currentQuestion.slice(-MAX_TRANSCRIPT_LENGTH));
        setAudioCaptureStatus("hearing");
        window.electronAPI?.sendTranscript?.(currentQuestion.slice(-MAX_TRANSCRIPT_LENGTH));
    };

    const drainTranscriptions = async (): Promise<void> => {
        if (isTranscriptionDrainActiveRef.current) return;
        const drainEpoch = transcriptionEpochRef.current;
        isTranscriptionDrainActiveRef.current = true;
        try {
            while (drainEpoch === transcriptionEpochRef.current) {
                const expectedSequence = nextTranscriptionToProcessRef.current;
                if (skippedTranscriptionSequencesRef.current.delete(expectedSequence)) {
                    nextTranscriptionToProcessRef.current += 1;
                    continue;
                }
                const index = pendingTranscriptionsRef.current.findIndex(segment => (
                    segment.epoch === drainEpoch && segment.sequence === expectedSequence
                ));
                // A later recorder can emit its stop event first. Wait for the
                // missing earlier sequence instead of corrupting the caption order.
                if (index < 0) break;
                const [segment] = pendingTranscriptionsRef.current.splice(index, 1);
                if (!segment) continue;

                const task = (async () => {
                    const text = await processGroqAudio(segment);
                    if (text) commitTranscriptSegment(segment, text);

                    // Only a natural VAD pause can complete a question. A rolling
                    // chunk from continuous speech never sends an early answer.
                    if (
                        segment.finalizesQuestion
                        && segment.epoch === transcriptionEpochRef.current
                        && autoAnswerEnabledRef.current
                        && !sessionEndingRef.current
                    ) {
                        const question = questionStateRef.current.consume().trim();
                        if (question) {
                            pendingAutoQuestionsRef.current.push(question);
                            processPendingAutoAnswersRef.current();
                        }
                    }
                })();
                activeTranscriptionTaskRef.current = task;
                try {
                    await task;
                } catch (error) {
                    console.error("[Desktop STT] Unexpected transcription task error:", error);
                } finally {
                    if (activeTranscriptionTaskRef.current === task) activeTranscriptionTaskRef.current = null;
                }
                if (drainEpoch === transcriptionEpochRef.current) {
                    nextTranscriptionToProcessRef.current += 1;
                }
            }
        } finally {
            isTranscriptionDrainActiveRef.current = false;
            if (pendingTranscriptionsRef.current.length) void drainTranscriptions();
        }
    };
    transcriptionDrainRef.current = drainTranscriptions;

    const startDesktopSTT = async () => {
        const captureEpoch = captureEpochRef.current;
        const transcriptionEpoch = transcriptionEpochRef.current;
        try {
            if (window.electronAPI?.isPresentationSafeMode()) return false;
            console.log("[Desktop STT] Starting ordered caption pipeline...");

            // Start the canonical recorder first. Chromium's optional preview can
            // otherwise take the microphone and prevent reliable Whisper capture.
            const micStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            });
            if (captureEpoch !== captureEpochRef.current || window.electronAPI?.isPresentationSafeMode()) {
                micStream.getTracks().forEach(track => track.stop());
                return false;
            }
            activeStreamsRef.current = [micStream];
            const microphoneTrack = micStream.getAudioTracks()[0];
            if (microphoneTrack) {
                microphoneTrack.onended = () => {
                    if (captureEpoch !== captureEpochRef.current || sessionEndingRef.current || !isRecordingRef.current) return;
                    setError("The microphone disconnected. Reconnecting…");
                    setIsRecording(false);
                    setIsAutoMode(false);
                    stopDesktopSTT();
                    const recoveryGeneration = ++recoveryGenerationRef.current;
                    deviceRecoveryTimerRef.current = setTimeout(async () => {
                        deviceRecoveryTimerRef.current = null;
                        if (sessionEndingRef.current || recoveryGeneration !== recoveryGenerationRef.current) return;
                        resetTranscriptionPipeline();
                        const recovered = await startDesktopSTT();
                        if (recoveryGeneration !== recoveryGenerationRef.current) {
                            if (recovered) stopDesktopSTT();
                            return;
                        }
                        if (recovered) {
                            autoAnswerEnabledRef.current = autoAnswerPreferenceRef.current;
                            setIsRecording(true);
                            setIsAutoMode(autoAnswerPreferenceRef.current);
                            setError(null);
                        } else {
                            setError("Microphone reconnection failed. Select an available microphone and press Start.");
                        }
                    }, 1000);
                };
            }

            const audioContext = new AudioContext();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            if (audioContext.state !== "running") await audioContext.resume();
            audioContextRef.current = audioContext;
            analyserRef.current = analyser;

            const micSource = audioContext.createMediaStreamSource(micStream);
            micSource.connect(analyser);
            micSourceRef.current = micSource;
            if (screenStreamRef.current) {
                try {
                    const screenSource = audioContext.createMediaStreamSource(screenStreamRef.current);
                    screenSource.connect(analyser);
                    screenSourceRef.current = screenSource;
                } catch (error) {
                    console.warn("[Desktop STT] Could not mix the existing meeting-audio track:", error);
                }
            }

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const timeDomainData = new Uint8Array(analyser.fftSize);
            // Lower thresholds recognise ordinary laptop-mic speech while still
            // rejecting a silent input. The selected meeting display is mixed when
            // its visible OS permission is available.
            const SPEECH_RMS_THRESHOLD = 0.9;
            const SPEECH_SPECTRUM_THRESHOLD = 2.4;
            const SILENCE_DURATION = 750;
            // Four-second rolling chunks keep confirmed captions close to live
            // while staying inside the provider request rate available to every
            // account. A natural pause can finish a question after 2.5 seconds.
            const MIN_SEGMENT_DURATION = 2500;
            const MAX_RECORDING_TIME = 4000;

            let mediaRecorder: MediaRecorder | null = null;
            let isSpeaking = false;
            let silenceStart = 0;
            let speechStart = 0;
            let setCurrentSegmentFinalization: ((finalizesQuestion: boolean, waitForContinuation?: boolean) => void) | null = null;
            let pendingRollover: { sequence: number; decision: boolean | null } | null = null;
            let deferredRolloverSegment: TranscriptionSegment | null = null;
            let lastLogTime = 0;

            const releaseRolloverSegment = (finalizesQuestion: boolean) => {
                if (!pendingRollover) return;
                pendingRollover.decision = finalizesQuestion;
                if (!deferredRolloverSegment || deferredRolloverSegment.sequence !== pendingRollover.sequence) return;
                deferredRolloverSegment.finalizesQuestion = finalizesQuestion;
                pendingTranscriptionsRef.current.push(deferredRolloverSegment);
                deferredRolloverSegment = null;
                pendingRollover = null;
                void transcriptionDrainRef.current?.();
            };

            const stopAndQueue = (finalizesQuestion: boolean) => {
                if (!isSpeaking) return;
                isSpeaking = false;
                vadSpeechActiveRef.current = !finalizesQuestion;
                silenceStart = 0;
                // At the four-second rollover we wait one silence window before
                // deciding whether the chunk was the end of the question. This
                // prevents a long question from being answered halfway through,
                // while still answering if speech ends on the chunk boundary.
                setCurrentSegmentFinalization?.(finalizesQuestion, !finalizesQuestion);
                if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
            };

            const startSegment = () => {
                // Speech continued after a rolling chunk, so release that previous
                // chunk as part of the same question before recording the next one.
                releaseRolloverSegment(false);
                isSpeaking = true;
                vadSpeechActiveRef.current = true;
                speechStart = Date.now();
                const segmentStartedAt = speechStart;
                const segmentSequence = ++nextTranscriptionSequenceRef.current;
                let segmentFinalizesQuestion = false;
                let waitsForContinuation = false;
                setCurrentSegmentFinalization = (finalizesQuestion, waitForContinuation = false) => {
                    segmentFinalizesQuestion = finalizesQuestion;
                    waitsForContinuation = waitForContinuation;
                    if (waitForContinuation) pendingRollover = { sequence: segmentSequence, decision: null };
                };
                const ownedChunks: Blob[] = [];
                const destination = audioContext.createMediaStreamDestination();
                const screenSourceAtStart = screenSourceRef.current;
                micSource.connect(destination);
                if (screenSourceAtStart) screenSourceAtStart.connect(destination);

                const preferredMimeType = 'audio/webm;codecs=opus';
                const mimeType = MediaRecorder.isTypeSupported(preferredMimeType) ? preferredMimeType : 'audio/webm';
                const ownedRecorder = new MediaRecorder(destination.stream, { mimeType });
                mediaRecorder = ownedRecorder;
                mediaRecorderRef.current = ownedRecorder;
                ownedRecorder.ondataavailable = event => {
                    if (event.data.size > 0) ownedChunks.push(event.data);
                };

                let resolveStopped: () => void = () => {};
                const stopped = new Promise<void>(resolve => { resolveStopped = resolve; });
                const flushOwned = async () => {
                    if (ownedRecorder.state === 'recording') ownedRecorder.stop();
                    await stopped;
                };
                ownedRecorder.onstop = () => {
                    try {
                        const duration = Date.now() - segmentStartedAt;
                        if (captureEpoch !== captureEpochRef.current) return;
                        if (duration < 350 || !ownedChunks.length) {
                            skippedTranscriptionSequencesRef.current.add(segmentSequence);
                            void transcriptionDrainRef.current?.();
                            return;
                        }
                        const queuedSegment: TranscriptionSegment = {
                            audio: new Blob(ownedChunks, { type: 'audio/webm' }),
                            epoch: transcriptionEpoch,
                            sequence: segmentSequence,
                            finalizesQuestion: segmentFinalizesQuestion,
                        };
                        if (waitsForContinuation && pendingRollover?.sequence === segmentSequence) {
                            deferredRolloverSegment = queuedSegment;
                            if (pendingRollover.decision !== null) {
                                releaseRolloverSegment(pendingRollover.decision);
                            }
                        } else {
                            pendingTranscriptionsRef.current.push(queuedSegment);
                            void transcriptionDrainRef.current?.();
                        }
                    } finally {
                        try { micSource.disconnect(destination); } catch { /* already disconnected */ }
                        try { screenSourceAtStart?.disconnect(destination); } catch { /* already disconnected */ }
                        destination.stream.getTracks().forEach(track => track.stop());
                        ownedChunks.length = 0;
                        if (mediaRecorder === ownedRecorder) setCurrentSegmentFinalization = null;
                        if (mediaRecorderRef.current === ownedRecorder) mediaRecorderRef.current = null;
                        if (flushRecorderRef.current === flushOwned) flushRecorderRef.current = null;
                        resolveStopped();
                    }
                };
                flushRecorderRef.current = flushOwned;
                ownedRecorder.start();
            };

            const checkAudioLevel = () => {
                if (captureEpoch !== captureEpochRef.current) return;
                if (!activeStreamsRef.current.length && !screenStreamRef.current) return;
                analyser.getByteFrequencyData(dataArray);
                analyser.getByteTimeDomainData(timeDomainData);
                const spectrumAverage = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
                const rms = Math.sqrt(timeDomainData.reduce((sum, value) => {
                    const centered = value - 128;
                    return sum + centered * centered;
                }, 0) / timeDomainData.length);
                const audible = rms >= SPEECH_RMS_THRESHOLD || spectrumAverage >= SPEECH_SPECTRUM_THRESHOLD;
                const now = Date.now();

                if (now - lastLogTime > 2500) {
                    console.log(`[VAD] RMS: ${rms.toFixed(1)} | Spectrum: ${spectrumAverage.toFixed(1)} | Mic stream: ${Boolean(micStream)}`);
                    lastLogTime = now;
                }

                if (audible) {
                    lastAudibleSignalAtRef.current = now;
                    if (now - lastAudioStatusUpdateAtRef.current > 500) {
                        lastAudioStatusUpdateAtRef.current = now;
                        setAudioCaptureStatus("hearing");
                    }
                    silenceStart = 0;
                    if (!isSpeaking) startSegment();
                    else if (now - speechStart >= MAX_RECORDING_TIME) {
                        // This is a rolling chunk, not the end of the question.
                        stopAndQueue(false);
                    }
                } else if (isSpeaking) {
                    if (!silenceStart) silenceStart = now;
                    const longEnough = now - speechStart >= MIN_SEGMENT_DURATION;
                    if (longEnough && now - silenceStart >= SILENCE_DURATION) {
                        stopAndQueue(true);
                    }
                } else if (pendingRollover && now - lastAudibleSignalAtRef.current >= SILENCE_DURATION) {
                    // A speaker stopped just as the recorder rolled over. Treat the
                    // held chunk as the complete question instead of leaving it
                    // visible forever without an answer.
                    releaseRolloverSegment(true);
                }

                if (!isSpeaking && now - lastAudibleSignalAtRef.current > 7000 && now - lastAudioStatusUpdateAtRef.current > 1000) {
                    lastAudioStatusUpdateAtRef.current = now;
                    setAudioCaptureStatus("no-signal");
                }
            };

            if (vadTimerRef.current) clearInterval(vadTimerRef.current);
            lastAudibleSignalAtRef.current = Date.now();
            lastAudioStatusUpdateAtRef.current = Date.now();
            setAudioCaptureStatus("waiting");
            checkAudioLevel();
            vadTimerRef.current = setInterval(checkAudioLevel, 50);
            setIsRecording(true);
            console.log("[Desktop STT] Ordered VAD engine started");
            return true;
        } catch (err: unknown) {
            const error = err as Error;
            console.error("[Desktop STT] failed to start:", error);
            cancelDeviceRecovery();
            captureEpochRef.current++;
            invalidateTranscriptionPipeline();
            if (vadTimerRef.current) {
                clearInterval(vadTimerRef.current);
                vadTimerRef.current = null;
            }
            activeStreamsRef.current.forEach(stream => stream.getTracks().forEach(track => track.stop()));
            activeStreamsRef.current = [];
            void audioContextRef.current?.close().catch(() => undefined);
            audioContextRef.current = null;
            autoAnswerEnabledRef.current = false;
            setIsRecording(false);
            setIsAutoMode(false);
            const message = error.message || "Microphone recording could not start.";
            setError(message);
            window.electronAPI?.sendOverlayStatus?.(message, "error");
            window.electronAPI?.sendRecordingState?.({ listening: false, meetingAudio: false, finalizing: false });
            return false;
        }
    };

    const stopDesktopSTT = useCallback((discardPendingTranscription = true) => {
        // Invalidate any late recorder or network callback before releasing the
        // audio device. A hard stop must never append a caption from the previous
        // practice session after the customer starts another one.
        cancelDeviceRecovery();
        captureEpochRef.current++;
        vadSpeechActiveRef.current = false;
        autoAnswerEnabledRef.current = false;
        if (discardPendingTranscription) invalidateTranscriptionPipeline();
        if (vadTimerRef.current) {
            clearInterval(vadTimerRef.current);
            vadTimerRef.current = null;
        }
        setAudioCaptureStatus("idle");

        // Leave the recorder's onstop handler intact. It owns disconnecting its
        // destination and resolving a pending flush. Removing it left the final
        // segment hanging and made later sessions appear to stop listening.
        const recorder = mediaRecorderRef.current;
        if (recorder?.state === 'recording') recorder.stop();
        if (!recorder || recorder.state === 'inactive') {
            mediaRecorderRef.current = null;
            flushRecorderRef.current = null;
        }
        if (screenSourceRef.current) {
            try { screenSourceRef.current.disconnect(); } catch { /* already disconnected */ }
            screenSourceRef.current = null;
        }
        if (micSourceRef.current) {
            try { micSourceRef.current.disconnect(); } catch { /* already disconnected */ }
            micSourceRef.current = null;
        }
        const audioContext = audioContextRef.current;
        if (audioContext) {
            void audioContext.close().catch(() => undefined);
            audioContextRef.current = null;
        }
        activeStreamsRef.current.forEach(stream => stream.getTracks().forEach(track => track.stop()));
        activeStreamsRef.current = [];
        console.log("[Desktop STT] Stopped");
    }, [cancelDeviceRecovery, invalidateTranscriptionPipeline]);

    const flushAndStopDesktopSTT = useCallback(async () => {
        // Ending an interview preserves the recorder's final segment so it can be
        // transcribed and saved. Explicit stops and device failures discard it.
        autoAnswerEnabledRef.current = false;
        const flush = flushRecorderRef.current;
        if (flush) await flush();
        stopDesktopSTT(false);
        while (pendingTranscriptionsRef.current.length || activeTranscriptionTaskRef.current || isTranscriptionDrainActiveRef.current) {
            const drain = transcriptionDrainRef.current;
            if (pendingTranscriptionsRef.current.length && drain) await drain();
            const activeTask = activeTranscriptionTaskRef.current;
            if (activeTask) await activeTask.catch(() => undefined);
            else if (isTranscriptionDrainActiveRef.current) {
                await new Promise<void>(resolve => window.setTimeout(resolve, 20));
            }
            if (!pendingTranscriptionsRef.current.length && !activeTranscriptionTaskRef.current && !isTranscriptionDrainActiveRef.current) break;
        }
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
        if (isElectron && !accessReady) {
            setError("Preparing your interview session. Please wait a moment, then start listening.");
            return;
        }
        if (recordingStartRef.current) {
            captureEpochRef.current++;
            return;
        }
        if (isRecording) {
            // STOP
            setIsFinalizingCapture(true);
            autoAnswerEnabledRef.current = false;
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
            if (isElectron) {
                stopScreenAudio();
                void window.electronAPI?.stopSystemAudioCapture().catch(console.error);
            }

            console.log("[Interview] Recording stopped");
            return;
        }

        // START
        if (window.electronAPI?.isPresentationSafeMode()) return;
        recordingStartRef.current = true;
        cancelDeviceRecovery();
        autoAnswerEnabledRef.current = autoAnswerPreferenceRef.current;
        isAiSpeakingRef.current = false;
        setError(null);
        setTranscript("");
        setInterimTranscript("");
        resetTranscriptionPipeline();

        try {
            // Start the canonical desktop microphone before the optional Chromium
            // preview. On macOS, starting the preview first can take the sole audio
            // handle and make the actual caption recorder fail.
            if (isElectron) {
                // On a single-display computer there is no meaningful choice to make,
                // so connect that meeting display as part of Start listening. Multiple
                // displays still require the customer to choose the correct one.
                const availableSources = meetingAudioSources;
                const sourceId = selectedMeetingAudioSource
                    || (availableSources.length === 1 ? availableSources[0].id : "");

                // Start the microphone first. macOS can take a moment to validate
                // Screen & System Audio permission; waiting for that would make the
                // listening control appear broken even though mic capture is ready.
                const started = await startDesktopSTT();
                if (!started) return;
                if (sourceId && !isScreenAudioActive && screenPermissionReady) void startMeetingAudio(sourceId);
                // Display enumeration is optional for microphone captions and can
                // briefly stall after System Settings closes. Start recording first,
                // then attach a sole meeting display when macOS has one ready.
                if (!sourceId && availableSources.length === 0) {
                    void loadMeetingAudioSources(false).then(sources => {
                        if (!isRecordingRef.current || sessionEndingRef.current || sources.length !== 1 || !screenPermissionReady) return;
                        void startMeetingAudio(sources[0].id);
                    });
                }
            }

            // Start the provisional microphone caption preview only after the
            // canonical recorder. If Chromium rejects a second audio consumer,
            // its error handler disables this optional preview and keeps the
            // reliable recorder running.
            if (recognitionRef.current && !previewUnavailableRef.current) {
                try {
                    if (!isRecognitionActiveRef.current) {
                        recognitionRef.current.start();
                        isRecognitionActiveRef.current = true;
                        console.log("[Speech] Provisional caption preview started");
                    }
                } catch (e: unknown) {
                    const err = e as Error;
                    if (err.name === 'InvalidStateError') {
                        isRecognitionActiveRef.current = true;
                    } else {
                        console.warn("[Speech] Provisional caption preview unavailable:", err);
                        if (!isElectron) setError("Microphone access is already in use or failed.");
                    }
                }
            } else if (!isElectron && !previewUnavailableRef.current) {
                console.warn("[Speech] Web Speech API not initialized.");
                setError("Your browser does not support live microphone captions. Use Chrome or Edge.");
            }

            if (!isElectron) setIsRecording(true);
            setIsAutoMode(autoAnswerPreferenceRef.current);
            console.log("[Interview] Recording started");
        } catch (err: unknown) {
            const error = err as Error;
            console.error("Failed to start recording:", error);
            setError("Could not access microphone.");
        } finally {
            recordingStartRef.current = false;
        }
    };
    toggleRecordingActionRef.current = () => { void toggleRecording(); };

    // Initialize native Chromium speech recognition when it is available. In the
    // desktop app this is an immediate microphone-only caption preview; Whisper
    // remains responsible for the final mixed microphone + meeting transcript.
    useEffect(() => {

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
            recognitionRef.current.onspeechstart = null;
            recognitionRef.current.onspeechend = null;
        }

        if (recognitionRef.current) {
            recognitionRef.current.onend = () => {
                isRecognitionActiveRef.current = false;
                console.log("[Speech] Recognition ended, isRecording:", isRecordingRef.current);
                // Answers are rendered as text, so a completed answer must never
                // prevent later provisional captions from restarting.
                if (isRecordingRef.current && !previewUnavailableRef.current) {
                    console.log("[Speech] Auto-restarting...");
                    // Use a small delay to prevent rapid restart loops
                    schedule(() => {
                        if (recognitionRef.current && isRecordingRef.current && !isRecognitionActiveRef.current) {
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

                if (window.electronAPI) {
                    // Do not save this provisional microphone-only caption. The final
                    // Whisper result below can include both the candidate and the
                    // selected meeting display, so it replaces this preview safely.
                    if (finalText) {
                        liveCaptionRef.current = `${liveCaptionRef.current} ${finalText}`.trim();
                    }
                    const liveCaption = `${liveCaptionRef.current} ${interim}`.trim();
                    setInterimTranscript(liveCaption);
                    if (liveCaption) window.electronAPI.sendTranscript?.(liveCaption);
                    return;
                }

                // Browser-only practice uses SpeechRecognition as the canonical
                // source. Use the same question buffer as desktop so a manual
                // answer always uses the text the participant can see.
                if (finalText) {
                    const cleanedFinal = finalText.trim();
                    if (cleanedFinal) {
                        const previousQuestion = questionStateRef.current.current();
                        const currentQuestion = questionStateRef.current.append(cleanedFinal);
                        const novelText = currentQuestion.slice(previousQuestion.length).trim();
                        if (novelText) appendFullTranscript(novelText);
                        setTranscript(currentQuestion.slice(-MAX_TRANSCRIPT_LENGTH));
                    }
                    setInterimTranscript('');
                } else if (interim) {
                    setInterimTranscript(interim);
                }
            };

            recognitionRef.current.onerror = (event: { error: string; }) => {
                console.log("[Speech] Error:", event.error);
                if (event.error === 'not-allowed' && !window.electronAPI) {
                    setError("Microphone access blocked.");
                }
                // Sync state on abort/end
                if (event.error === 'aborted' || event.error === 'audio-capture') {
                    isRecognitionActiveRef.current = false;
                }
                if (event.error === 'audio-capture') {
                    if (window.electronAPI) {
                        // The Electron recorder remains active. Do not retry this
                        // optional browser feature and risk taking its microphone.
                        previewUnavailableRef.current = true;
                        return;
                    }
                    setIsRecording(false);
                    setIsAutoMode(false);
                    setError("The active microphone became unavailable. Check the device and press Start to reconnect.");
                    setSystemStatus(prev => ({ ...prev, mic: false }));
                    return;
                }

                if (window.electronAPI && (event.error === 'not-allowed' || event.error === 'service-not-allowed')) {
                    // The immediate caption preview is optional. Keep the canonical
                    // MediaRecorder/Whisper path alive if Chromium cannot provide a
                    // second recognition stream for this particular Mac.
                    previewUnavailableRef.current = true;
                    setInterimTranscript("");
                    return;
                }

                // Still try to restart after minor errors if recording is active
                if ((event.error === 'no-speech' || event.error === 'aborted') && isRecordingRef.current) {
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


    const processCapturedImage = useCallback(async (imageData: string, options?: { reserved?: boolean }) => {
        let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
        if (captureProcessingRef.current && !options?.reserved) {
            const message = "A previous screen capture is still being read. Wait for it to finish before capturing again.";
            showToast(message, "info");
            window.electronAPI?.sendOverlayStatus?.(message, "error");
            return;
        }
        captureProcessingRef.current = true;
        setIsScreenCapturing(true);
        void window.electronAPI?.setScannerProcessing?.(true);
        try {
            if (!imageData?.startsWith('data:image/')) throw new Error('The captured image was invalid.');
            window.electronAPI?.sendOverlayStatus?.("Reading captured code…", "progress");
            const deadline = <T,>(promise: Promise<T>, ms: number, message: string) => Promise.race<T>([
                promise,
                new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
            ]);
            worker = await deadline(createWorker('eng', 1, {
                workerPath: '/tesseract/worker.min.js',
                corePath: '/tesseract-core',
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
            await getAiAnswer(text, false, false, false, true);
        } catch (err) {
            console.error("[Scanner] OCR processing failed:", err);
            const message = err instanceof Error
                ? err.message
                : typeof err === "string" && err.trim()
                    ? err
                    : "Failed to process screen capture.";
            showToast(message, "error");
            window.electronAPI?.sendOverlayStatus?.(message, "error");
        } finally {
            if (worker) await worker.terminate().catch(console.error);
            captureProcessingRef.current = false;
            setIsScreenCapturing(false);
            void window.electronAPI?.setScannerProcessing?.(false);
        }
    }, [getAiAnswer, showToast]);
    processCapturedImageRef.current = processCapturedImage;

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
        return window.electronAPI.onProcessOcr(data => {
            void (async () => {
                const api = window.electronAPI;
                if (!api) return;

                // Desktop builds released before coordinated scanner delivery
                // still emit a valid image but do not expose its reservation
                // IPC methods. Let those builds use the established renderer
                // OCR path instead of silently dropping the capture.
                if (!supportsCoordinatedScannerCapture(api)) {
                    await processCapturedImageRef.current(data.imageData);
                    return;
                }

                // Reserve both renderer and main-process state before ACKing.
                // Without this ordering a quick second scanner action can be
                // accepted while the first image is still waiting to start OCR.
                if (captureProcessingRef.current) return;
                captureProcessingRef.current = true;
                try {
                    const processing = await api.setScannerProcessing(true);
                    if (!processing?.success) {
                        captureProcessingRef.current = false;
                        return;
                    }
                    // Confirm that the current interview renderer has received the
                    // image before the native process closes the selection frame.
                    if (data.id) {
                        const acknowledged = await api.acknowledgeScannerCapture(data.id);
                        if (!acknowledged?.success) {
                            captureProcessingRef.current = false;
                            void api.setScannerProcessing(false);
                            return;
                        }
                    }
                    await processCapturedImageRef.current(data.imageData, { reserved: true });
                } catch (captureError) {
                    console.error('[Scanner] Could not reserve the native capture:', captureError);
                    captureProcessingRef.current = false;
                    void api.setScannerProcessing(false);
                }
            })();
        });
    }, []);

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
            try {
                try {
                    await interviewAccess.finish(sessionIdRef.current);
                } catch (finishError) {
                    console.warn("Session close will retry from the dashboard:", finishError);
                    localStorage.setItem("allyx_pending_finish", sessionIdRef.current);
                }
                sessionStorage.removeItem("allyx_access_session");
                localStorage.removeItem('interview_draft');
                router.push("/dashboard");
            } finally {
                isSavingRef.current = false;
                setIsSaving(false);
            }
            return;
        }

        try {
            const title = interviewContext.type
                ? `${interviewContext.type} Interview`
                : "Interview Session";

            // Calculate interview duration in minutes
            const durationMinutes = Math.round((new Date().getTime() - interviewStartTime.getTime()) / 60000);

            // Format transcript with Q&A pairs for better history display
            const formattedTranscript = [
                allQAPairs.map((qa, idx) => `Q${idx + 1}: ${qa.question}\n\nA${idx + 1}: ${qa.answer}`).join('\n\n---\n\n'),
                remainingTranscript ? `Transcript:\n${remainingTranscript}` : '',
            ].filter(Boolean).join('\n\n---\n\n');

            if (!historySavedRef.current) {
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
                historySavedRef.current = true;
                showToast("Interview saved to history", "success");
            }
            try {
                await interviewAccess.finish(sessionIdRef.current);
            } catch (finishError) {
                console.warn("Session close will retry from the dashboard:", finishError);
                localStorage.setItem("allyx_pending_finish", sessionIdRef.current);
            }
            sessionStorage.removeItem("allyx_access_session");
            localStorage.removeItem('interview_draft');
            router.push("/dashboard");
        } catch (error) {
            console.error("Failed to save interview:", error);
            sessionEndingRef.current = false;
            const message = "Could not save this interview. Your transcript is still here. Check your connection and press End Interview to retry.";
            setError(message);
            window.electronAPI?.sendOverlayStatus?.(message, "error");
        } finally {
            setIsSaving(false);
            isSavingRef.current = false;
        }
    };
    endInterviewActionRef.current = () => { void handleEndInterview(); };

    useEffect(() => window.electronAPI?.onOverlayToggleListening?.(() => {
        toggleRecordingActionRef.current();
    }), []);

    useEffect(() => window.electronAPI?.onOverlayEndInterview?.(() => {
        endInterviewActionRef.current();
    }), []);

    useEffect(() => {
        window.electronAPI?.sendRecordingState?.({
            listening: isRecording,
            meetingAudio: isScreenAudioActive,
            finalizing: isFinalizingCapture || isSaving,
        });
    }, [isFinalizingCapture, isRecording, isSaving, isScreenAudioActive]);

    return (
        <div className="min-h-screen flex flex-col lg:flex-row gap-4 p-2 sm:p-4 pt-20 transition-colors duration-300 bg-gray-50 dark:bg-zinc-950 overflow-auto">
            {accessRemaining !== null && (
                <div className="fixed top-20 right-4 z-50 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 shadow dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
                    Free trial {Math.floor(accessRemaining / 60)}:{String(accessRemaining % 60).padStart(2, "0")}
                </div>
            )}
            {/* Error Banner */}
            {error && (
                <div className="fixed left-4 right-4 top-24 z-50 mx-auto flex max-w-2xl items-start gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-red-800 shadow-lg dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                    <AlertCircle size={20} />
                    <span>{error}</span>
                    {capturePermissionNeedsRestart && isElectron && (
                        <div className="ml-auto flex shrink-0 flex-wrap gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => { void window.electronAPI?.openScreenRecordingSettings(); }}
                            >
                                Open System Settings
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                onClick={() => window.electronAPI?.relaunchApp()}
                                className="bg-red-700 text-white hover:bg-red-800"
                            >
                                Restart AllyX
                            </Button>
                        </div>
                    )}
                    <Button aria-label="Dismiss message" title="Dismiss" variant="ghost" size="sm" onClick={() => { setError(null); setCapturePermissionNeedsRestart(false); }} className={`${capturePermissionNeedsRestart ? '' : 'ml-auto'} h-7 w-7 shrink-0 rounded-full p-0 hover:bg-red-200 dark:hover:bg-red-900`}>
                        ×
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
                                    title={isScreenAudioActive ? "Stop interviewer audio" : "Start interviewer audio"}
                                >
                                    {isScreenAudioActive ? <Monitor size={26} strokeWidth={2.5} /> : <MonitorOff size={26} strokeWidth={2} />}
                                </button>
                            )}

                            {/* End Interview Button - Far Right */}
                            <button
                                onClick={handleEndInterview}
                                disabled={isSaving}
                                className="w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg backdrop-blur-sm bg-red-500 hover:bg-red-600 text-white disabled:opacity-50"
                                title="End Interview"
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
                                disabled={!isScreenAudioActive && !screenPermissionReady}
                                className={cn(
                                    "w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-md disabled:cursor-not-allowed disabled:opacity-45",
                                    isScreenAudioActive
                                        ? "bg-blue-500 text-white scale-110 shadow-blue-500/30 ring-4 ring-blue-100 dark:ring-blue-900/30"
                                        : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                                )}
                                title={isScreenAudioActive ? "Stop interviewer audio" : screenPermissionReady ? "Start interviewer audio" : "Complete Screen & System Audio setup first"}
                            >
                                {isScreenAudioActive ? <Monitor size={26} strokeWidth={2.5} /> : <MonitorOff size={26} strokeWidth={2} />}
                            </button>
                        )}

                        {/* End Interview Button - Far Right */}
                        <button
                            onClick={handleEndInterview}
                            disabled={isSaving}
                            className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-md bg-red-500 hover:bg-red-600 text-white disabled:opacity-50"
                            title="End Interview"
                        >
                            {isSaving ? <Loader2 size={26} className="animate-spin" /> : <LogOut size={26} strokeWidth={2} />}
                        </button>
                    </div>
                )}

                {isElectron && (
                    <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <ShieldCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                                    <h3 className="font-semibold text-slate-950 dark:text-white">One-time desktop setup</h3>
                                </div>
                                <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600 dark:text-slate-400">Set permissions once after installing AllyX. The app will not send you back to Settings while they are active.</p>
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={() => void refreshDesktopPermissions()} disabled={isCheckingDesktopPermissions}>
                                {isCheckingDesktopPermissions ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1 h-3.5 w-3.5" />}
                                Check status
                            </Button>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <div className={cn("rounded-xl border p-3", microphonePermissionReady ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20" : "border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20")}>
                                <p className="font-semibold text-slate-900 dark:text-white">Microphone</p>
                                <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">{microphonePermissionReady ? "Ready for your voice." : "Allow it now so Start listening works immediately."}</p>
                                {!microphonePermissionReady && (
                                    <Button type="button" size="sm" className="mt-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => void requestMicrophonePermission()} disabled={isRequestingMicrophonePermission}>
                                        {isRequestingMicrophonePermission ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Mic className="mr-1 h-3.5 w-3.5" />}
                                        Allow microphone
                                    </Button>
                                )}
                            </div>
                            <div className={cn("rounded-xl border p-3", screenPermissionReady ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20" : "border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20")}>
                                <p className="font-semibold text-slate-900 dark:text-white">Screen &amp; system audio</p>
                                <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">{screenPermissionReady ? "Ready for interviewer audio and Screen Capture." : "Enable AllyX once, then restart the app once."}</p>
                                {!screenPermissionReady && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        <Button type="button" size="sm" variant="outline" onClick={() => { void window.electronAPI?.openScreenRecordingSettings(); }}>
                                            Open System Settings
                                        </Button>
                                        <Button type="button" size="sm" onClick={() => window.electronAPI?.relaunchApp()} className="bg-slate-800 text-white hover:bg-slate-700">
                                            Restart AllyX
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                        {!screenPermissionReady && desktopPermissions?.platform === "darwin" && (
                            <p className="mt-3 flex gap-2 text-xs leading-5 text-slate-600 dark:text-slate-400"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />After an AllyX update, macOS may retain approval for an older copy. Open the current AllyX from Applications, enable its AllyX entry, and restart once. Future updates keep the same permission identity.</p>
                        )}
                    </section>
                )}

                {isElectron && (
                    <section className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-sm text-slate-700 dark:border-sky-900/70 dark:bg-sky-950/20 dark:text-slate-200">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <h3 className="font-semibold text-slate-950 dark:text-white">Interviewer audio</h3>
                                <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">Choose the display playing the meeting. Microphone listening remains separate and is used for your own voice.</p>
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={() => void loadMeetingAudioSources()} disabled={isLoadingMeetingAudioSources || isScreenAudioActive}>
                                {isLoadingMeetingAudioSources ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1 h-3.5 w-3.5" />}Refresh displays
                            </Button>
                        </div>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <label className="sr-only" htmlFor="meeting-audio-display">Meeting display</label>
                            <select
                                id="meeting-audio-display"
                                value={selectedMeetingAudioSource}
                                onChange={event => setSelectedMeetingAudioSource(event.target.value)}
                                disabled={isScreenAudioActive || isLoadingMeetingAudioSources || meetingAudioSources.length === 0}
                                className="min-h-10 flex-1 rounded-lg border border-sky-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-sky-900 dark:bg-slate-950 dark:text-white"
                            >
                                <option value="">{meetingAudioSources.length > 1 ? "Choose the display with your meeting" : meetingAudioSources.length === 1 ? "Available meeting display" : "No displays found"}</option>
                                {meetingAudioSources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}
                            </select>
                            <Button type="button" onClick={() => void toggleScreenAudio()} disabled={isLoadingMeetingAudioSources || (!isScreenAudioActive && (!screenPermissionReady || (!selectedMeetingAudioSource && meetingAudioSources.length !== 1)))} className={cn("min-h-10", isScreenAudioActive ? "bg-slate-700 hover:bg-slate-800" : "bg-sky-600 hover:bg-sky-700")}>
                                {isScreenAudioActive ? "Stop interviewer audio" : "Start interviewer audio"}
                            </Button>
                        </div>
                        {!isScreenAudioActive && <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{screenPermissionReady ? "Choose the display playing the interviewer, then start interviewer audio." : "Complete Screen & System Audio setup above before starting interviewer audio."}</p>}
                    </section>
                )}

                {isElectron && isRecording && (
                    <div role="status" className={cn(
                        "rounded-xl border px-4 py-3 text-sm",
                        audioCaptureStatus === "no-signal"
                            ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
                            : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"
                    )}>
                        <p className="font-semibold">
                            {audioCaptureStatus === "transcribing" ? "Transcribing the latest audio…" : audioCaptureStatus === "hearing" ? "Audio detected — transcript is updating." : audioCaptureStatus === "no-signal" ? "No audible signal detected yet." : "Listening for speech…"}
                        </p>
                        <p className="mt-1 text-xs leading-5 opacity-80">
                            {isScreenAudioActive
                                ? "Microphone and the selected meeting display are active. Confirmed captions update in short, ordered segments while the conversation continues; AllyX answers after a natural pause."
                                : "Your microphone is active. To transcribe the interviewer, select their display above and start interviewer audio."}
                        </p>
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
                                    onClick={() => {
                                        const question = retryQuestionRef.current || questionStateRef.current.current() || transcript;
                                        void getAiAnswer(question || undefined);
                                    }}
                                    disabled={isLoading || !(retryQuestion || questionStateRef.current.current().trim() || transcript.trim())}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                    <Sparkles size={14} className="mr-1" /> {retryQuestion ? "Retry answer" : "Get Answer"}
                                </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => {
                                questionStateRef.current.clear();
                                pendingAutoQuestionsRef.current = [];
                                retryQuestionRef.current = "";
                                liveCaptionRef.current = "";
                                setRetryQuestion("");
                                setInterimTranscript("");
                                setTranscript("");
                            }} className="text-gray-400 hover:text-red-500">
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
                            AllyX Assistant
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
                                        if (res.error) {
                                            setError(res.error);
                                            showToast(res.error, "error");
                                        }
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
