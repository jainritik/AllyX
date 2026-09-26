"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock3, CreditCard, LifeBuoy, Loader2, RefreshCw } from "lucide-react";
import { BILLING_PLANS, type BillingPlanId } from "@/lib/billing-plans";
import { PurchaseButton } from "@/components/purchase-button";
import { Button } from "@/components/ui/button";

type Purchase = {
    orderId: string;
    planId: BillingPlanId;
    amount: number;
    currency: string;
    credits: number;
    status: "created" | "authorized" | "paid" | "failed" | "refund_pending" | "partially_refunded" | "refunded" | "disputed";
    paymentId: string | null;
    receiptNumber: string | null;
    refundedAmount: number;
    failureReason: string | null;
    createdAt: string;
    paidAt: string | null;
};

type BillingAccount = {
    creditsRemaining: number;
    trialStatus: "available" | "active" | "used";
    trialStartedAt: string | null;
    trialExpiresAt: string | null;
    activeSessionSource: "trial" | "credit" | null;
    purchases: Purchase[];
};

const planIds = Object.keys(BILLING_PLANS) as BillingPlanId[];
const statusLabels: Record<Purchase["status"], string> = {
    created: "Pending", authorized: "Authorized", paid: "Paid", failed: "Failed",
    refund_pending: "Refund pending", partially_refunded: "Partially refunded",
    refunded: "Refunded", disputed: "Disputed",
};

function statusClass(status: Purchase["status"]) {
    if (status === "paid") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
    if (["failed", "refunded", "disputed"].includes(status)) return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
    return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
}

export default function BillingPage() {
    const searchParams = useSearchParams();
    const requestedPlan = searchParams.get("plan");
    const [account, setAccount] = useState<BillingAccount | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const loadAccount = useCallback(async () => {
        setLoading(true); setError("");
        try {
            const response = await fetch("/api/billing/account", { cache: "no-store" });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || "Could not load billing details.");
            setAccount(payload);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Could not load billing details.");
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { void loadAccount(); }, [loadAccount]);

    const trialLabel = account?.trialStatus === "available" ? "10-minute trial available"
        : account?.trialStatus === "active" ? "Trial currently active" : "Free trial used";

    return <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div><h1 className="text-3xl font-bold text-gray-950 dark:text-white">Billing & Credits</h1><p className="mt-2 text-gray-600 dark:text-gray-400">Manage interview access and review your purchases.</p></div>
            <div className="flex flex-wrap gap-2"><Link href="/dashboard/billing/support" className="inline-flex items-center rounded-md border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"><LifeBuoy className="mr-2 h-4 w-4" />Payment support</Link><Button variant="outline" onClick={loadAccount} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button></div>
        </div>

        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
        {loading && !account ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div> : account && <>
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900"><div className="flex items-center gap-3 text-gray-500"><CreditCard className="h-5 w-5" /><span className="text-sm font-medium">Interview credits</span></div><p className="mt-4 text-5xl font-bold text-gray-950 dark:text-white">{account.creditsRemaining}</p><p className="mt-2 text-sm text-gray-500">One credit is reserved when a paid interview starts.</p></div>
                <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900"><div className="flex items-center gap-3 text-gray-500"><Clock3 className="h-5 w-5" /><span className="text-sm font-medium">Free trial</span></div><p className="mt-4 text-xl font-bold text-gray-950 dark:text-white">{trialLabel}</p>{account.trialExpiresAt && account.trialStatus === "active" && <p className="mt-2 text-sm text-gray-500">Ends {new Date(account.trialExpiresAt).toLocaleString()}</p>}</div>
            </div>

            <p className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                Service protection limits reset daily at 00:00 UTC: up to 300 AI answers and 1,200 transcription requests per account. Interview credits control session access and are separate from these daily limits.
            </p>

            <section><h2 className="text-xl font-bold text-gray-950 dark:text-white">Buy interview credits</h2><div className="mt-4 grid gap-4 lg:grid-cols-3">{planIds.map(planId => { const plan = BILLING_PLANS[planId]; return <article key={planId} className="flex min-h-56 flex-col rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900"><p className="font-semibold text-emerald-600 dark:text-emerald-400">{plan.name}</p><p className="mt-4 text-3xl font-bold">{plan.displayPrice}</p><p className="mt-2 text-sm text-gray-500">{plan.credits} interview credits</p><PurchaseButton planId={planId} autoStart={requestedPlan === planId} onSuccess={loadAccount} className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-950" /></article>; })}</div></section>

            <section><h2 className="text-xl font-bold text-gray-950 dark:text-white">Purchase history</h2><div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">{account.purchases.length === 0 ? <p className="p-8 text-center text-gray-500">No interview packs purchased yet.</p> : <div className="divide-y divide-gray-200 dark:divide-gray-800">{account.purchases.map(purchase => <div key={purchase.orderId} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{BILLING_PLANS[purchase.planId]?.name || purchase.planId}</p><p className="mt-1 text-xs text-gray-500">{new Date(purchase.createdAt).toLocaleString()} · {purchase.orderId}</p>{purchase.failureReason && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{purchase.failureReason}</p>}{purchase.refundedAmount > 0 && <p className="mt-2 text-xs text-gray-500">Refunded ₹{(purchase.refundedAmount / 100).toLocaleString("en-IN")}</p>}</div><div className="flex flex-wrap items-center gap-3"><span className="font-semibold">₹{(purchase.amount / 100).toLocaleString("en-IN")}</span><span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${statusClass(purchase.status)}`}>{purchase.status === "paid" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}{statusLabels[purchase.status]}</span>{purchase.paymentId && <a href={`/dashboard/billing/receipt/${encodeURIComponent(purchase.orderId)}`} className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400">View receipt</a>}</div></div>)}</div>}</div></section>
        </>}
    </div>;
}
