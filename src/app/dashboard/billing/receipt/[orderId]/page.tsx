"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Printer } from "lucide-react";

type Receipt = {
    receiptNumber: string;
    orderId: string;
    paymentId: string;
    planName: string;
    credits: number;
    amount: number;
    currency: string;
    status: string;
    paidAt: string;
    refundedAmount: number;
};

export default function ReceiptPage() {
    const { orderId } = useParams<{ orderId: string }>();
    const [receipt, setReceipt] = useState<Receipt | null>(null);
    const [error, setError] = useState("");

    useEffect(() => {
        void fetch(`/api/billing/receipt/${encodeURIComponent(orderId)}`, { cache: "no-store" })
            .then(async response => {
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.error || "Could not load receipt");
                setReceipt(payload);
            })
            .catch(loadError => setError(loadError instanceof Error ? loadError.message : "Could not load receipt"));
    }, [orderId]);

    if (error) return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">{error}</div>;
    if (!receipt) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>;

    return <div className="mx-auto max-w-2xl">
        <div className="mb-5 flex justify-end print:hidden"><Button onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print or save PDF</Button></div>
        <article className="rounded-2xl border border-gray-200 bg-white p-8 text-gray-950 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-white print:border-0 print:shadow-none">
            <div className="flex items-start justify-between gap-6 border-b border-gray-200 pb-6 dark:border-gray-800"><div><p className="text-sm font-semibold text-emerald-600">AllyX</p><h1 className="mt-2 text-3xl font-bold">Payment receipt</h1></div><div className="text-right text-sm text-gray-500"><p>{receipt.receiptNumber}</p><p className="mt-1">{new Date(receipt.paidAt).toLocaleString()}</p></div></div>
            <dl className="mt-7 grid gap-5 text-sm sm:grid-cols-2">
                <div><dt className="text-gray-500">Interview pack</dt><dd className="mt-1 font-semibold">{receipt.planName}</dd></div>
                <div><dt className="text-gray-500">Credits</dt><dd className="mt-1 font-semibold">{receipt.credits}</dd></div>
                <div><dt className="text-gray-500">Order ID</dt><dd className="mt-1 break-all font-mono text-xs">{receipt.orderId}</dd></div>
                <div><dt className="text-gray-500">Payment ID</dt><dd className="mt-1 break-all font-mono text-xs">{receipt.paymentId}</dd></div>
                <div><dt className="text-gray-500">Status</dt><dd className="mt-1 font-semibold capitalize">{receipt.status.replaceAll("_", " ")}</dd></div>
                <div><dt className="text-gray-500">Amount paid</dt><dd className="mt-1 text-xl font-bold">₹{(receipt.amount / 100).toLocaleString("en-IN")}</dd></div>
            </dl>
            {receipt.refundedAmount > 0 && <p className="mt-7 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">Refunded amount: ₹{(receipt.refundedAmount / 100).toLocaleString("en-IN")}</p>}
            <p className="mt-8 text-xs leading-5 text-gray-500">This receipt confirms payment recorded by AllyX through Razorpay. It is not a GST tax invoice.</p>
        </article>
    </div>;
}
