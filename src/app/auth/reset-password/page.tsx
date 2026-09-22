"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { signOutAndClear } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { authErrorMessage, validateNewPassword } from "@/lib/auth-errors";

export default function ResetPasswordPage() {
    const [ready, setReady] = useState(false);
    const [password, setPassword] = useState("");
    const [confirmation, setConfirmation] = useState("");
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => {
        let active = true;
        supabase.auth.getUser().then(({ data, error }) => {
            if (!active) return;
            if (error || !data.user) setError("This reset session is missing or expired. Request a new reset link.");
            else setReady(true);
        }).catch(() => { if (active) setError("Could not verify your reset session. Check your connection and reload."); });
        return () => { active = false; };
    }, []);
    return <main className="min-h-screen flex items-center justify-center p-6">
        <form className="w-full max-w-sm space-y-5" onSubmit={async event => {
            event.preventDefault();
            if (busy || !ready || saved) return;
            setError("");
            const validation = validateNewPassword(password, confirmation);
            if (validation) { setError(validation); return; }
            setBusy(true);
            try {
                const { error } = await supabase.auth.updateUser({ password });
                if (error) throw error;
                setSaved(true);
                setPassword("");
                setConfirmation("");
                try { await signOutAndClear(); }
                catch { setError("Your password was changed, but this browser could not sign out. Retry signing out from the account menu."); }
            } catch (error) {
                setError(authErrorMessage(error));
            } finally { setBusy(false); }
        }}>
            <h1 className="text-2xl font-bold">Choose a new password</h1>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            {saved ? <p role="status">Password changed. Return to ZEDX-AI and sign in with your new password.</p> : ready ? <>
                <label className="block" htmlFor="new-password">New password</label>
                <input id="new-password" disabled={busy} type="password" autoComplete="new-password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} className="w-full border rounded-lg p-3" />
                <label className="block" htmlFor="confirm-password">Confirm new password</label>
                <input id="confirm-password" disabled={busy} type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={event => setConfirmation(event.target.value)} className="w-full border rounded-lg p-3" />
                <Button className="w-full" disabled={busy}>{busy ? "Saving…" : "Save password"}</Button>
            </> : !error && <p>Verifying reset session…</p>}
            {!saved && <Link className="block underline" href="/auth/forgot-password">Request a new reset link</Link>}
            <Link className="block underline" href="/login">Return to sign in</Link>
        </form>
    </main>;
}
