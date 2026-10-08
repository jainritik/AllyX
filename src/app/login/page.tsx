"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Mail, RefreshCw, Shield, Trophy, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { safeReturnPath } from "@/lib/auth-navigation";
import { authErrorMessage } from "@/lib/auth-errors";

export default function LoginPage() {
    const { sendEmailOtp, verifyOtp, signInWithGoogle } = useAuth();
    const [step, setStep] = useState<"choice" | "email" | "otp">("choice");
    const [email, setEmail] = useState("");
    const [otp, setOtp] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [resendSeconds, setResendSeconds] = useState(0);
    const [isDesktop, setIsDesktop] = useState(false);
    const destination = () => safeReturnPath(new URLSearchParams(window.location.search).get("from"));

    useEffect(() => {
        setIsDesktop(Boolean(window.electronAPI?.isElectron));
        let active = true;
        void supabase.auth.getSession().then(({ data }) => {
            if (!active) return;
            if (data.session?.user) window.location.replace(destination());
        }).catch(() => undefined);
        return () => { active = false; };
    }, []);

    useEffect(() => {
        if (!resendSeconds) return;
        const timer = window.setTimeout(() => setResendSeconds(value => value - 1), 1000);
        return () => window.clearTimeout(timer);
    }, [resendSeconds]);

    async function sendCode(event?: FormEvent) {
        event?.preventDefault();
        if (busy || resendSeconds > 0) return;
        setBusy(true); setError(""); setNotice("");
        try {
            await sendEmailOtp(email);
            setStep("otp"); setResendSeconds(60);
            setNotice(`We sent a one-time code to ${email.trim().toLowerCase()}.`);
        } catch (sendError) { setError(authErrorMessage(sendError)); }
        finally { setBusy(false); }
    }

    async function confirmCode(event: FormEvent) {
        event.preventDefault();
        if (busy) return;
        setBusy(true); setError("");
        try {
            await verifyOtp(email, otp);
            window.location.replace(destination());
        } catch (verifyError) { setError(authErrorMessage(verifyError)); }
        finally { setBusy(false); }
    }

    async function continueWithGoogle() {
        setBusy(true); setError("");
        try { await signInWithGoogle(); }
        catch (googleError) { setError(authErrorMessage(googleError)); setBusy(false); }
    }

    return <div className="grid min-h-screen w-full md:grid-cols-2">
        <section className="relative hidden overflow-hidden bg-gradient-to-br from-emerald-950 to-teal-950 p-8 text-white md:flex md:flex-col md:justify-between lg:p-12">
            <div className="absolute right-[-10%] top-[-10%] h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
            <Link href="/" className="relative z-10 inline-flex w-fit items-center"><Image src="/allyx-logo.png" alt="AllyX" width={87} height={87} className="h-20 w-20 object-contain" /></Link>
            <div className="relative z-10 max-w-xl">
                <h2 className="text-5xl font-extrabold leading-tight tracking-tight">Prepare and practice with real-time AI notes.</h2>
                <div className="mt-9 space-y-6">
                    <div className="flex gap-4"><Zap className="mt-1 shrink-0 text-emerald-400" /><div><h3 className="font-bold">Live transcription</h3><p className="mt-1 text-gray-400">Capture speech when you enable microphone or desktop audio.</p></div></div>
                    <div className="flex gap-4"><Trophy className="mt-1 shrink-0 text-emerald-400" /><div><h3 className="font-bold">Answers with your context</h3><p className="mt-1 text-gray-400">Use your resume, target role, and preferred answer style.</p></div></div>
                    <div className="flex gap-4"><Shield className="mt-1 shrink-0 text-emerald-400" /><div><h3 className="font-bold">One secure account</h3><p className="mt-1 text-gray-400">Access your setup, credits, and session history from one place.</p></div></div>
                </div>
            </div>
            <div className="relative z-10 flex gap-5 text-sm text-gray-400"><span>© 2026 AllyX</span><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>
        </section>

        <main className="flex items-center justify-center bg-white p-6 text-gray-950 dark:bg-zinc-950 dark:text-white sm:p-10">
            <div className="w-full max-w-sm">
                <Link href="/" className="mb-8 inline-flex items-center text-sm text-gray-500 hover:text-gray-950 dark:hover:text-white"><ArrowLeft className="mr-2 h-4 w-4" />Back to AllyX</Link>
                <div className="mb-7 md:hidden"><Image src="/allyx-logo.png" alt="AllyX" width={64} height={64} className="h-14 w-14 object-contain" /></div>
                <h1 className="text-3xl font-bold tracking-tight">{step === "choice" ? "Sign in to AllyX" : step === "email" ? "Continue with email" : "Enter your code"}</h1>
                <p className="mt-3 text-sm leading-6 text-gray-500">{step === "choice" ? "Sign in or create your account in one step." : step === "email" ? "No password required. New email addresses automatically create an account." : <>We sent a one-time code to <strong className="text-gray-800 dark:text-gray-200">{email}</strong>.</>}</p>

                {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
                {notice && <p role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{notice}</p>}

                {step === "choice" ? <div className="mt-7 space-y-4">
                    <Button type="button" disabled={busy} onClick={continueWithGoogle} className="h-14 w-full rounded-2xl bg-[#171719] text-base font-semibold text-white shadow-sm hover:bg-black">
                            <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09A6.5 6.5 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.56 10.56 0 0 0 12 1C7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
                            Continue with Google
                    </Button>
                    <div className="flex items-center gap-3 text-xs uppercase text-gray-400"><span className="h-px flex-1 bg-gray-200 dark:bg-zinc-800" />or<span className="h-px flex-1 bg-gray-200 dark:bg-zinc-800" /></div>
                    <Button type="button" variant="outline" onClick={() => setStep("email")} className="h-14 w-full rounded-2xl border-gray-300 bg-white text-base font-semibold text-gray-950 shadow-sm hover:bg-gray-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white">Continue with Email</Button>
                    {isDesktop && <p className="text-center text-xs leading-5 text-gray-500">Google sign-in and email codes both create or open the same AllyX account.</p>}
                </div> : step === "email" ? <>
                    <form onSubmit={sendCode} className="mt-7">
                        <label htmlFor="login-email" className="text-sm font-semibold">Email address</label>
                        <div className="relative mt-2"><Mail className="absolute left-4 top-3.5 h-5 w-5 text-gray-400" /><input id="login-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" className="h-12 w-full rounded-xl border border-gray-300 bg-transparent pl-12 pr-4 outline-none focus:border-emerald-600 dark:border-zinc-700" /></div>
                        <Button disabled={busy || resendSeconds > 0} className="mt-4 h-12 w-full rounded-xl bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700">{busy && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}{resendSeconds ? `Send another code in ${resendSeconds}s` : "Continue with email"}</Button>
                    </form>
                    <button type="button" onClick={() => { setStep("choice"); setError(""); }} className="mt-5 w-full text-sm text-gray-500 hover:underline">Back to sign-in options</button>
                </> : <form onSubmit={confirmCode} className="mt-7">
                    <label htmlFor="otp" className="text-sm font-semibold">One-time code</label>
                    <input id="otp" type="text" inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={8} pattern="[0-9]{6,8}" value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="123456" className="mt-2 h-14 w-full rounded-xl border border-gray-300 bg-transparent px-4 text-center font-mono text-2xl tracking-[.4em] outline-none focus:border-emerald-600 dark:border-zinc-700" />
                    <Button disabled={busy || otp.length < 6} className="mt-4 h-12 w-full rounded-xl bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700">{busy && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}Verify and continue</Button>
                    <div className="mt-5 flex items-center justify-between text-sm"><button type="button" onClick={() => { setStep("email"); setOtp(""); setNotice(""); setError(""); }} className="text-gray-500 hover:underline">Change email</button><button type="button" disabled={busy || resendSeconds > 0} onClick={() => void sendCode()} className="font-semibold text-emerald-700 disabled:text-gray-400 dark:text-emerald-400">{resendSeconds ? `Resend in ${resendSeconds}s` : "Resend code"}</button></div>
                </form>}

                <p className="mt-8 text-center text-xs leading-5 text-gray-500">By continuing, you agree to the AllyX <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.</p>
            </div>
        </main>
    </div>;
}
