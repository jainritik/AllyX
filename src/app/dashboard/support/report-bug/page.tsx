"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Bug, FileVideo, Image as ImageIcon, Loader2, Paperclip, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { supportContact } from "@/lib/support-contact";

type ReportItem = { id: string; title: string; description: string; attachmentName: string | null; status: string; createdAt: string };
const attachmentTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "video/mp4", "video/webm", "video/quicktime"];

export default function ReportBugPage() {
    const [reports, setReports] = useState<ReportItem[]>([]);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [attachment, setAttachment] = useState<File | null>(null);
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        const response = await fetch("/api/support/bug-reports", { cache: "no-store" });
        if (response.ok) setReports(await response.json());
    }, []);

    useEffect(() => {
        void load();
        void supabase.auth.getUser().then(({ data }) => {
            if (!data.user) return;
            setEmail(data.user.email || "");
            setName(typeof data.user.user_metadata?.full_name === "string" ? data.user.user_metadata.full_name : "");
        });
    }, [load]);

    const chooseAttachment = (file: File | null) => {
        setNotice("");
        if (!file) { setAttachment(null); return; }
        if (!attachmentTypes.includes(file.type)) { setNotice("Attach a JPG, PNG, WebP, GIF, HEIC, MP4, MOV or WebM file."); return; }
        if (file.size > 25 * 1024 * 1024) { setNotice("The attachment must be 25 MB or smaller."); return; }
        setAttachment(file);
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true); setNotice("");
        let uploadedPath: string | null = null;
        try {
            const { data: auth, error: authError } = await supabase.auth.getUser();
            if (authError || !auth.user) throw new Error("Please sign in again.");
            let uploaded: { path: string; name: string; type: string } | null = null;
            if (attachment) {
                const safeName = attachment.name.replace(/[^A-Za-z0-9._-]/g, "-").slice(-120);
                uploadedPath = `${auth.user.id}/${crypto.randomUUID()}-${safeName}`;
                const { error: uploadError } = await supabase.storage.from("bug-report-attachments")
                    .upload(uploadedPath, attachment, { upsert: false, contentType: attachment.type });
                if (uploadError) throw new Error("The attachment could not be uploaded. Please try again.");
                uploaded = { path: uploadedPath, name: attachment.name, type: attachment.type };
            }
            const response = await fetch("/api/support/bug-reports", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, phone, title, description, attachment: uploaded }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || "Could not submit the bug report.");
            setTitle(""); setDescription(""); setAttachment(null);
            setNotice(payload.emailSent
                ? "Bug report submitted and emailed to AllyX support."
                : "Bug report saved. Email delivery is queued and will retry automatically.");
            await load();
        } catch (error) {
            if (uploadedPath) await supabase.storage.from("bug-report-attachments").remove([uploadedPath]).catch(() => undefined);
            setNotice(error instanceof Error ? error.message : "Could not submit the bug report.");
        } finally { setBusy(false); }
    };

    return <div className="mx-auto max-w-4xl space-y-8">
        <div><div className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300"><Bug className="h-4 w-4" />Report a product issue</div><h1 className="mt-4 text-3xl font-bold">Help us fix a bug</h1><p className="mt-2 max-w-2xl text-gray-600 dark:text-gray-400">Tell us what happened, what you expected, and how to reproduce it. Your report is saved to your account and sent directly to AllyX support. For urgent help, <a href={supportContact.emailUrl} target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">open an email draft</a>.</p></div>
        <form onSubmit={submit} className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Your name<input value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={120} required className="mt-2 w-full rounded-xl border border-gray-300 bg-transparent px-4 py-3 dark:border-gray-700" /></label><label className="text-sm font-semibold">Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-gray-300 bg-transparent px-4 py-3 dark:border-gray-700" /></label></div>
            <label className="block text-sm font-semibold">Phone or WhatsApp <span className="font-normal text-gray-500">(optional when email is provided)</span><input value={phone} onChange={event => setPhone(event.target.value)} maxLength={30} className="mt-2 w-full rounded-xl border border-gray-300 bg-transparent px-4 py-3 dark:border-gray-700" /></label>
            <label className="block text-sm font-semibold">Short title<input value={title} onChange={event => setTitle(event.target.value)} minLength={5} maxLength={160} required placeholder="Example: Screen capture stays on Analyzing" className="mt-2 w-full rounded-xl border border-gray-300 bg-transparent px-4 py-3 dark:border-gray-700" /></label>
            <label className="block text-sm font-semibold">What happened?<textarea value={description} onChange={event => setDescription(event.target.value)} minLength={20} maxLength={5000} required rows={7} placeholder="Steps to reproduce, what you expected, what appeared, and your browser or computer type." className="mt-2 w-full rounded-xl border border-gray-300 bg-transparent px-4 py-3 dark:border-gray-700" /></label>
            <div><p className="text-sm font-semibold">Screenshot or video <span className="font-normal text-gray-500">(optional, maximum 25 MB)</span></p>{attachment ? <div className="mt-2 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30"><span className="flex min-w-0 items-center gap-2">{attachment.type.startsWith("video/") ? <FileVideo className="h-4 w-4 shrink-0" /> : <ImageIcon className="h-4 w-4 shrink-0" />}<span className="truncate">{attachment.name}</span></span><button type="button" onClick={() => setAttachment(null)} aria-label="Remove attachment"><X className="h-4 w-4" /></button></div> : <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-7 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"><Paperclip className="h-4 w-4" />Add screenshot or video<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,video/mp4,video/webm,video/quicktime" onChange={event => chooseAttachment(event.target.files?.[0] || null)} className="sr-only" /></label>}</div>
            <button disabled={busy} className="inline-flex items-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit bug report</button>
            {notice && <p role="status" className="text-sm text-gray-700 dark:text-gray-300">{notice}</p>}
        </form>
        <section><h2 className="text-xl font-bold">Your bug reports</h2><div className="mt-4 space-y-3">{reports.length === 0 ? <p className="rounded-xl border border-gray-200 p-5 text-sm text-gray-500 dark:border-gray-800">No bug reports submitted yet.</p> : reports.map(report => <article key={report.id} className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900"><div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold">{report.title}</p><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold capitalize text-amber-800 dark:bg-amber-950 dark:text-amber-300">{report.status.replaceAll("_", " ")}</span></div><p className="mt-2 text-xs text-gray-500">{new Date(report.createdAt).toLocaleString()}{report.attachmentName ? ` · ${report.attachmentName}` : ""}</p><p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{report.description}</p></article>)}</div></section>
    </div>;
}
