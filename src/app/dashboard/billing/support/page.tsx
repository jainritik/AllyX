"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supportContact } from "@/lib/support-contact";

type RequestItem = { id: string; category: string; orderId: string | null; message: string; status: string; createdAt: string };
type Purchase = { orderId: string; status: string; amount: number; createdAt: string };

export default function BillingSupportPage() {
    const [requests, setRequests] = useState<RequestItem[]>([]);
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [category, setCategory] = useState("payment");
    const [orderId, setOrderId] = useState("");
    const [message, setMessage] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        const [supportResponse, billingResponse] = await Promise.all([
            fetch("/api/billing/support", { cache: "no-store" }),
            fetch("/api/billing/account", { cache: "no-store" }),
        ]);
        if (supportResponse.ok) setRequests(await supportResponse.json());
        if (billingResponse.ok) setPurchases((await billingResponse.json()).purchases || []);
    }, []);
    useEffect(() => { void load(); }, [load]);

    const submit = async (event: FormEvent) => {
        event.preventDefault(); setBusy(true); setNotice("");
        try {
            const response = await fetch("/api/billing/support", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, orderId, message }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || "Could not submit the request.");
            setMessage(""); setNotice("Request submitted. You can track its status below."); await load();
        } catch (error) { setNotice(error instanceof Error ? error.message : "Could not submit the request."); }
        finally { setBusy(false); }
    };

    const requiresOrder = category === "payment" || category === "refund";
    return <div className="mx-auto max-w-4xl space-y-8">
        <div><Link href="/dashboard/billing" className="inline-flex items-center text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400"><ArrowLeft className="mr-2 h-4 w-4" />Billing & Credits</Link><h1 className="mt-4 text-3xl font-bold">Payment & refund support</h1><p className="mt-2 text-gray-600 dark:text-gray-400">Send a request linked to your account and track its progress. For direct help, message <a href={supportContact.whatsappUrl} target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">{supportContact.whatsappDisplay} on WhatsApp</a> or <a href={supportContact.emailUrl} target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">open an email draft</a>.</p></div>
        <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900"><h2 className="text-lg font-bold">Refund policy</h2><p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-400">You may request a refund within seven calendar days of purchase when none of the credits from that interview pack have been used. Duplicate charges, successful payments that did not grant credits, and other payment errors are reviewed even after seven days. Approved refunds return to the original payment method and normally appear within 5–7 business days, depending on the bank.</p></section>
        <form onSubmit={submit} className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <label className="block text-sm font-semibold">What do you need help with?<select value={category} onChange={event => setCategory(event.target.value)} className="mt-2 w-full rounded-xl border border-gray-300 bg-transparent px-4 py-3 dark:border-gray-700"><option value="payment">Payment</option><option value="refund">Refund request</option><option value="credits">Missing or incorrect credits</option><option value="technical">Technical problem</option><option value="other">Other</option></select></label>
            <label className="block text-sm font-semibold">Payment order {requiresOrder ? "(required)" : "(optional)"}<select value={orderId} onChange={event => setOrderId(event.target.value)} required={requiresOrder} className="mt-2 w-full rounded-xl border border-gray-300 bg-transparent px-4 py-3 dark:border-gray-700"><option value="">Select an order</option>{purchases.map(purchase => <option key={purchase.orderId} value={purchase.orderId}>{purchase.orderId} · ₹{(purchase.amount / 100).toLocaleString("en-IN")} · {purchase.status}</option>)}</select></label>
            <label className="block text-sm font-semibold">Details<textarea value={message} onChange={event => setMessage(event.target.value)} minLength={10} maxLength={2000} required rows={6} placeholder="Describe what happened and what you expected." className="mt-2 w-full rounded-xl border border-gray-300 bg-transparent px-4 py-3 dark:border-gray-700" /></label>
            <button disabled={busy} className="inline-flex items-center rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-950">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit request</button>
            {notice && <p role="status" className="text-sm text-gray-600 dark:text-gray-300">{notice}</p>}
        </form>
        <section><h2 className="text-xl font-bold">Your requests</h2><div className="mt-4 space-y-3">{requests.length === 0 ? <p className="rounded-xl border border-gray-200 p-5 text-sm text-gray-500 dark:border-gray-800">No support requests yet.</p> : requests.map(item => <article key={item.id} className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900"><div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold capitalize">{item.category} support</p><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold capitalize text-amber-800 dark:bg-amber-950 dark:text-amber-300">{item.status.replaceAll("_", " ")}</span></div><p className="mt-2 text-xs text-gray-500">{new Date(item.createdAt).toLocaleString()}{item.orderId ? ` · ${item.orderId}` : ""}</p><p className="mt-3 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{item.message}</p></article>)}</div></section>
    </div>;
}
