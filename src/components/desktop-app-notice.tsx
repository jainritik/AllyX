"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Laptop, Smartphone } from "lucide-react";

type Device = "checking" | "mobile" | "browser" | "desktop-app";

export function DesktopAppNotice({ compact = false, showDownload = true }: { compact?: boolean; showDownload?: boolean }) {
    const device = useSyncExternalStore<Device>(
        () => () => undefined,
        () => {
            const agent = navigator.userAgent;
            if (/Electron/i.test(agent)) return "desktop-app";
            return /Android|iPhone|iPad|iPod|Mobile/i.test(agent) ? "mobile" : "browser";
        },
        () => "checking",
    );

    if (device === "desktop-app") return null;
    const mobile = device === "mobile";

    return (
        <aside className={`rounded-2xl border border-sky-200 bg-sky-50 text-sky-950 dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:text-cyan-100 ${compact ? "p-4" : "p-5 sm:p-6"}`}>
            <div className="flex items-start gap-3">
                <span className="mt-0.5 rounded-xl bg-white p-2 text-sky-700 shadow-sm dark:bg-cyan-950 dark:text-cyan-300">
                    {mobile ? <Smartphone className="h-5 w-5" /> : <Laptop className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="font-bold">{mobile ? "AllyX sessions run on a Mac or Windows computer" : "Use the AllyX desktop app for live sessions"}</p>
                    <p className="mt-1 text-sm leading-6 text-sky-800 dark:text-cyan-200/80">
                        {mobile
                            ? "You can use this website on your phone to manage your account, billing, and interview history. Live listening, screen capture, and the answer overlay require the installed desktop app."
                            : "This website is for your account, setup, billing, and history. Live listening, screen capture, and the answer overlay work through the installed Mac or Windows app."}
                    </p>
                    {showDownload && <Link href="/download" className="mt-3 inline-flex rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200">View desktop downloads</Link>}
                </div>
            </div>
        </aside>
    );
}
