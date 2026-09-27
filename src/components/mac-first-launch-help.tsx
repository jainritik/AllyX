'use client';

import { useState } from 'react';
import { Check, Clipboard, Terminal } from 'lucide-react';

const OPEN_ALLYX_COMMAND = 'xattr -dr com.apple.quarantine /Applications/AllyX.app && open /Applications/AllyX.app';

export function MacFirstLaunchHelp() {
    const [copied, setCopied] = useState(false);

    async function copyCommand() {
        await navigator.clipboard.writeText(OPEN_ALLYX_COMMAND);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 4000);
    }

    return <section className="mt-8 rounded-2xl border border-sky-200 bg-sky-50 p-6 text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100">
        <h2 className="text-xl font-semibold">Open AllyX on your Mac</h2>
        <p className="mt-2 text-sm leading-6">
            AllyX is currently distributed outside the Mac App Store. After dragging AllyX into Applications, macOS may say it cannot verify the app. If that happens, follow these steps once.
        </p>

        <ol className="mt-5 grid gap-4 text-sm leading-6 sm:grid-cols-3">
            <li className="rounded-xl bg-white/80 p-4 dark:bg-black/20">
                <p className="font-semibold">1. Keep AllyX installed</p>
                <p className="mt-1">On the Apple warning, select <strong>Done</strong>. Do not select Move to Bin.</p>
            </li>
            <li className="rounded-xl bg-white/80 p-4 dark:bg-black/20">
                <p className="font-semibold">2. Open Terminal</p>
                <p className="mt-1">Press Command + Space, type <strong>Terminal</strong>, then press Return.</p>
            </li>
            <li className="rounded-xl bg-white/80 p-4 dark:bg-black/20">
                <p className="font-semibold">3. Paste and run</p>
                <p className="mt-1">Copy the command below, paste it into Terminal, and press Return. AllyX will open automatically.</p>
            </li>
        </ol>

        <div className="mt-5 rounded-xl border border-sky-200 bg-white p-4 dark:border-sky-900 dark:bg-black/30">
            <div className="flex items-center gap-2 text-sm font-semibold">
                <Terminal className="h-4 w-4" aria-hidden="true" />
                First-launch command
            </div>
            <code className="mt-3 block overflow-x-auto rounded-lg bg-slate-950 px-4 py-3 text-xs leading-5 text-slate-100 sm:text-sm">
                {OPEN_ALLYX_COMMAND}
            </code>
            <button
                type="button"
                onClick={copyCommand}
                className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-sky-700 px-5 py-2.5 font-semibold text-white transition hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
            >
                {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Clipboard className="h-4 w-4" aria-hidden="true" />}
                {copied ? 'Copied — paste it in Terminal' : 'Copy fix command'}
            </button>
        </div>

        <p className="mt-4 text-xs leading-5 text-sky-900/80 dark:text-sky-100/75">
            This command removes the download quarantine only from <code>/Applications/AllyX.app</code>; it does not change security settings for other applications. Only use it for AllyX downloaded from this official page.
        </p>
        <p className="mt-3 text-sm leading-6">
            Prefer Apple&apos;s settings? Open System Settings → Privacy &amp; Security, find the blocked AllyX message, and select Open Anyway. See <a className="font-semibold underline underline-offset-2" href="https://support.apple.com/102445" target="_blank" rel="noreferrer">Apple&apos;s instructions</a>.
        </p>
    </section>;
}
