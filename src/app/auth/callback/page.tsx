"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { completeAuthCallback } from "@/lib/auth-callback";

export default function AuthCallbackPage() {
    const [status, setStatus] = useState("Processing login...");
    const [error, setError] = useState<string | null>(null);
    const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
    const [approved, setApproved] = useState(false);

    const pending = useRef<Promise<void> | null>(null);
    useEffect(() => {
        const url = new URL(window.location.href);
        if (!approved && (url.searchParams.has('token_hash') || new URLSearchParams(url.hash.slice(1)).has('token_hash'))) {
            // Read the browser URL after hydration without changing the server-rendered page.
            Promise.resolve().then(() => setAwaitingConfirmation(true));
            return;
        }
        if (!pending.current) pending.current = (async () => {
            const destination = await Promise.race([
                completeAuthCallback(new URL(window.location.href), supabase),
                new Promise<never>((_, reject) => window.setTimeout(
                    () => reject(new Error("Sign-in is taking too long. Check your connection and try again.")),
                    15_000,
                )),
            ]);
            window.history.replaceState({}, '', '/auth/callback');
            setStatus("Login successful!");
            window.location.replace(destination);
        })();
        let active = true;
        pending.current.catch(error => { if (active) setError(error instanceof Error ? error.message : "Sign-in failed. Please try again."); });
        return () => { active = false; };
    }, [approved]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-gray-100 dark:from-zinc-900 dark:to-black">
            <div className="bg-white dark:bg-zinc-800 p-8 rounded-2xl shadow-lg text-center max-w-md">
                {awaitingConfirmation && !approved ? (
                    <>
                        <h1 className="text-xl font-semibold mb-3">Continue to AllyX</h1>
                        <p className="text-sm text-gray-500 mb-5">Confirm that you requested this email to continue. This protects your link from automatic email scanners.</p>
                        <button className="rounded-lg bg-teal-600 text-white px-5 py-3" onClick={() => setApproved(true)}>Continue</button>
                    </>
                ) : error ? (
                    <>
                        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                            <span className="text-red-500 text-3xl">✕</span>
                        </div>
                        <p className="text-red-600 dark:text-red-400 text-lg font-medium mb-2">Login Failed</p>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">{error}</p>
                        <a href="/login" className="block text-teal-600 underline mt-4">Return to sign in</a>
                    </>
                ) : (
                    <>
                        <div className="w-16 h-16 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
                        <p className="text-gray-700 dark:text-gray-200 text-lg font-medium">{status}</p>
                        <p className="text-gray-400 text-sm mt-2">Please wait...</p>
                    </>
                )}
            </div>
        </div>
    );
}
