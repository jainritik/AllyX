"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { authErrorMessage } from "@/lib/auth-errors";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [cooldown, setCooldown] = useState(0);
    useEffect(() => {
        if (!cooldown) return;
        const timer = setTimeout(() => setCooldown(value => value - 1), 1000);
        return () => clearTimeout(timer);
    }, [cooldown]);
    return <main className="min-h-screen flex items-center justify-center p-6">
        <form className="w-full max-w-sm space-y-5" onSubmit={async event => {
            event.preventDefault();
            if (busy || cooldown) return;
            setBusy(true);
            setError("");
            setMessage("");
            try {
                const redirect = new URL("/auth/callback", window.location.origin);
                redirect.searchParams.set("recovery", "1");
                const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect.toString() });
                if (error) throw error;
                setMessage("If this address belongs to an eligible account, a reset email has been requested. Check your inbox and spam folder and open the newest link.");
                setCooldown(60);
            } catch (error) {
                setCooldown(60);
                setError(authErrorMessage(error));
            } finally { setBusy(false); }
        }}>
            <h1 className="text-2xl font-bold">Reset your password</h1>
            <p className="text-sm text-gray-500">Open the newest reset email, press Continue, and choose a new password. If the email opens in your browser, return to the desktop app afterwards and sign in with your new password.</p>
            <label className="block" htmlFor="recovery-email">Email</label>
            <input id="recovery-email" type="email" autoComplete="email" required disabled={busy} value={email} onChange={event => { setEmail(event.target.value); setMessage(""); setError(""); }} className="w-full border rounded-lg p-3" />
            {message && <p role="status" className="text-sm text-emerald-600">{message}</p>}
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <Button className="w-full" disabled={busy || cooldown > 0}>{busy ? "Sending…" : cooldown ? `Resend in ${cooldown}s` : "Send reset link"}</Button>
            <Link className="block text-center underline" href="/login">Return to sign in</Link>
        </form>
    </main>;
}
