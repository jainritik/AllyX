"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
    Mic,
    Monitor,
    Scan,
    LogOut,
    Sparkles,
    ArrowRight,
    CheckCircle2,
    Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { loadInterviewContext } from "@/lib/interview-context";
import { useAuth } from "@/lib/auth";
import { interviewAccess } from "@/lib/interview-access";

export default function HowToUsePage() {
    const router = useRouter();
    const accountId = useAuth(state => state.user?.id);
    const [isElectron, setIsElectron] = useState(false);
    const [setupReady, setSetupReady] = useState(false);
    const [setupError, setSetupError] = useState("");
    const [isStarting, setIsStarting] = useState(false);
    const [hasActiveSession, setHasActiveSession] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setIsElectron(Boolean(window.electronAPI?.isElectron));
            try {
                const ready = Boolean(accountId && await loadInterviewContext(accountId));
                if (cancelled) return;
                setSetupReady(ready);
                setSetupError(ready ? "" : "Interview context is missing. Return to setup to add AI context, answer style, and a resume.");
            } catch {
                if (cancelled) return;
                setSetupError("Interview setup could not be read on this device. Return to setup and try again.");
            }
        };
        void load();
        return () => { cancelled = true; };
    }, [accountId]);

    useEffect(() => {
        if (!accountId) return;
        let cancelled = false;
        void interviewAccess.status().then(access => {
            if (!cancelled) setHasActiveSession(Boolean(access.allowed && access.sessionId));
        }).catch(() => { /* The start action will surface access errors. */ });
        return () => { cancelled = true; };
    }, [accountId]);

    const instructions = [
        {
            title: "Smart Mic Control",
            description: "Listen when the interviewer asks, then STOP the mic when you start answering. This prevents the AI from hearing your own voice and getting confused.",
            icon: <Mic className="w-8 h-8" />,
            color: "from-emerald-500 to-green-500",
            bg: "bg-emerald-500/10",
            border: "border-emerald-500/20"
        },
        {
            title: isElectron ? "Meeting Audio" : "Interview Context",
            description: isElectron
                ? "Listen to sound from your computer so the interviewer's voice can be transcribed clearly."
                : "The AI uses your role context, answer style, and resume to tailor its suggestions.",
            icon: isElectron ? <Monitor className="w-8 h-8" /> : <Info className="w-8 h-8" />,
            color: "from-teal-500 to-emerald-600",
            bg: "bg-teal-500/10",
            border: "border-teal-500/20"
        },
        {
            title: isElectron ? "Capture Text or Code" : "Text and Code Input",
            description: isElectron
                ? "Select an area of your screen to extract text or code, then generate an answer from it."
                : "Paste a question or code directly into the session when speech input is not suitable.",
            icon: <Scan className="w-8 h-8" />,
            color: "from-green-600 to-emerald-700",
            bg: "bg-green-600/10",
            border: "border-green-600/20"
        },
        {
            title: "AI Auto Answer",
            description: "Auto Answer waits for a pause after the question, then generates a suggestion. Turn it off when you want manual control.",
            icon: <Sparkles className="w-8 h-8" />,
            color: "from-lime-500 to-emerald-500",
            bg: "bg-lime-500/10",
            border: "border-lime-500/20"
        },
        {
            title: "End Session",
            description: "Always use the End Interview button to safely clean up and save your session data.",
            icon: <LogOut className="w-8 h-8" />,
            color: "from-red-500 to-rose-500",
            bg: "bg-red-500/10",
            border: "border-red-500/20"
        }
    ];

    const handleStart = async () => {
        if (isStarting) return;
        if (!window.electronAPI?.isElectron) {
            router.push("/download");
            return;
        }
        if (!setupReady) {
            setSetupError("Complete your resume and AI instructions in setup before starting.");
            return;
        }
        try {
            if (!accountId || !await loadInterviewContext(accountId)) {
                setSetupReady(false);
                setSetupError("Interview context is missing. Return to setup to add AI context, answer style, and a resume.");
                return;
            }
        } catch {
            setSetupError("Interview setup could not be read on this device. Return to setup and try again.");
            return;
        }
        setIsStarting(true);
        setSetupError("");
        try {
            // Reuse a server-authorized session after a refresh, renderer restart,
            // or accidental return to setup. Starting a second UUID here could
            // otherwise reserve another paid interview credit.
            const currentAccess = await interviewAccess.status();
            const sessionId = currentAccess.allowed && currentAccess.sessionId
                ? currentAccess.sessionId
                : crypto.randomUUID();
            const access = currentAccess.allowed && currentAccess.sessionId
                ? currentAccess
                : await interviewAccess.start(sessionId);
            if (!access.allowed) {
                setSetupError(access.reason || "Your free trial has ended. Choose an interview pack to continue.");
                return;
            }
            sessionStorage.setItem("allyx_access_session", access.sessionId || sessionId);
            router.push("/interview");
        } catch (error) {
            setSetupError(error instanceof Error ? error.message : "Could not start the interview. Try again.");
        } finally {
            setIsStarting(false);
        }
    };

    return (
        <div className="min-h-screen bg-white dark:bg-black text-foreground relative overflow-hidden flex flex-col items-center justify-center px-6 py-12">
            {/* Background Orbs */}
            <div className="fixed inset-0 pointer-events-none z-0 hidden sm:block">
                <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px]"></div>
            </div>

            <div className="relative z-10 max-w-4xl w-full flex flex-col items-center">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-8 sm:mb-16 px-4"
                >
                    <h1 className="text-4xl sm:text-6xl md:text-7xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-gray-900 via-emerald-600 to-gray-900 dark:from-white dark:via-emerald-400 dark:to-white pb-4 leading-[1.2] sm:leading-tight">
                        Mastering the Copilot
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 text-base sm:text-xl max-w-2xl mx-auto">
                        A quick guide to the controls used during your session.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8 mb-12 w-full">
                    {instructions.map((item, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className={cn(
                                "p-6 sm:p-8 rounded-[32px] border transition-all duration-500 hover:scale-[1.02] bg-white dark:bg-[#111] shadow-xl dark:shadow-none flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-6",
                                item.border
                            )}
                        >
                            <div className={cn(
                                "p-5 rounded-2xl flex items-center justify-center text-white bg-gradient-to-br shadow-lg shrink-0",
                                item.color
                            )}>
                                {item.icon}
                            </div>
                            <div className="flex-1">
                                <h3 className="text-xl sm:text-2xl font-bold mb-3 dark:text-white uppercase tracking-tight">{item.title}</h3>
                                <p className="text-gray-600 dark:text-gray-400 leading-relaxed text-sm sm:text-base italic">
                                    {item.description}
                                </p>
                            </div>
                        </motion.div>
                    ))}
                </div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.6 }}
                    className="flex w-full max-w-xl flex-col items-center gap-6"
                >
                    {setupError && <p role="alert" className="max-w-xl text-center text-red-600 dark:text-red-400">{setupError}</p>}
                    <Button
                        onClick={handleStart}
                        disabled={isElectron && (!setupReady || isStarting)}
                        className="w-full min-w-0 h-auto min-h-16 whitespace-normal px-5 py-4 text-base sm:text-xl font-bold bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white rounded-2xl shadow-2xl shadow-emerald-500/30 transition-all hover:scale-105 active:scale-95 group"
                    >
                        {isStarting ? "Opening securely…" : !isElectron ? "Download the desktop app" : hasActiveSession ? "Resume Active Interview" : "Got it, Start Interview!"}
                        <ArrowRight className="ml-2 shrink-0 group-hover:translate-x-1 transition-transform" />
                    </Button>

                    {!setupReady && <Button variant="outline" onClick={() => router.push("/dashboard/new")}>Return to setup</Button>}
                    {!isElectron && <p className="text-center text-sm text-gray-500">Live sessions require the installed Mac or Windows app. Sign in there to use your saved setup.</p>}
                    {setupReady && <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCircle2 size={18} />
                        <span>Interview context ready</span>
                    </div>}
                </motion.div>
            </div>

            <style jsx global>{`
                @keyframes pulse {
                    0%, 100% { opacity: 0.1; transform: scale(1); }
                    50% { opacity: 0.2; transform: scale(1.1); }
                }
            `}</style>
        </div>
    );
}
