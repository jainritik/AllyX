"use client";

import { FormEvent, useState } from "react";
import { Bug, Loader2, Paperclip } from "lucide-react";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { supportContact } from "@/lib/support-contact";

const accepted = "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,video/mp4,video/webm,video/quicktime";

export default function PublicReportBugPage() {
    const [startedAt] = useState(() => Date.now());
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState("");
    const [sent, setSent] = useState(false);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const formElement = event.currentTarget;
        setBusy(true); setNotice("");
        try {
            const form = new FormData(formElement);
            form.set("startedAt", String(startedAt));
            const file = form.get("attachment");
            if (file instanceof File && file.size > 10 * 1024 * 1024) throw new Error("The attachment must be 10 MB or smaller.");
            const response = await fetch("/api/support/public-bug-reports", { method: "POST", body: form });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || "Could not submit the report.");
            setSent(true);
            setNotice("Your report was sent to AllyX support. We will contact you using the email provided if we need more information.");
            formElement.reset();
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "Could not submit the report.");
        } finally { setBusy(false); }
    }

    return <div className="min-h-screen bg-white text-gray-950 dark:bg-black dark:text-white">
        <Navbar />
        <main className="mx-auto max-w-3xl px-5 pb-20 pt-32 sm:px-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300"><Bug className="h-4 w-4" />No login required</div>
            <h1 className="mt-5 text-4xl font-bold tracking-tight">Report a bug</h1>
            <p className="mt-3 text-gray-600 dark:text-gray-400">Tell us what happened and how to reproduce it. You can report login and signup problems without an AllyX account.</p>
            <form onSubmit={submit} className="mt-8 space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-950">
                <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-semibold">Your name<input name="name" minLength={2} maxLength={120} required className="mt-2 w-full rounded-xl border border-gray-300 bg-transparent px-4 py-3 dark:border-gray-700" /></label>
                    <label className="text-sm font-semibold">Email<input name="email" type="email" maxLength={254} required className="mt-2 w-full rounded-xl border border-gray-300 bg-transparent px-4 py-3 dark:border-gray-700" /></label>
                </div>
                <label className="block text-sm font-semibold">Phone or WhatsApp <span className="font-normal text-gray-500">(optional)</span><input name="phone" maxLength={30} className="mt-2 w-full rounded-xl border border-gray-300 bg-transparent px-4 py-3 dark:border-gray-700" /></label>
                <label className="block text-sm font-semibold">Affected page <span className="font-normal text-gray-500">(optional)</span><input name="page" maxLength={500} placeholder="Example: Login or payment page" className="mt-2 w-full rounded-xl border border-gray-300 bg-transparent px-4 py-3 dark:border-gray-700" /></label>
                <label className="block text-sm font-semibold">Short title<input name="title" minLength={5} maxLength={160} required placeholder="Example: Confirmation link returns to login" className="mt-2 w-full rounded-xl border border-gray-300 bg-transparent px-4 py-3 dark:border-gray-700" /></label>
                <label className="block text-sm font-semibold">What happened?<textarea name="description" minLength={20} maxLength={5000} required rows={7} placeholder="What did you do, what did you expect, and what happened instead?" className="mt-2 w-full rounded-xl border border-gray-300 bg-transparent px-4 py-3 dark:border-gray-700" /></label>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-7 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"><Paperclip className="h-4 w-4" />Add screenshot or short video (optional, maximum 10 MB)<input name="attachment" type="file" accept={accepted} className="sr-only" /></label>
                <button disabled={busy || sent} className="inline-flex items-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{sent ? "Report sent" : "Submit bug report"}</button>
                {notice && <p role="status" className="text-sm text-gray-700 dark:text-gray-300">{notice}</p>}
                <p className="text-xs text-gray-500">Do not include passwords, API keys, payment card details, or other secrets. For urgent assistance, email <a className="font-semibold underline" href={`mailto:${supportContact.email}`}>{supportContact.email}</a>.</p>
            </form>
        </main>
        <Footer />
    </div>;
}
