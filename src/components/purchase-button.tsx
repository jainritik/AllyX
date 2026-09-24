"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BillingPlanId } from "@/lib/billing-plans";

declare global {
    interface Window {
        Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void };
    }
}

function loadCheckout() {
    if (window.Razorpay) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
        if (existing) { existing.addEventListener("load", () => resolve(), { once: true }); return; }
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Could not load secure checkout."));
        document.head.appendChild(script);
    });
}

export function PurchaseButton({ planId, className }: { planId: BillingPlanId; className?: string }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");

    const purchase = async () => {
        setBusy(true); setMessage("");
        try {
            const orderResponse = await fetch("/api/billing/order", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId }),
            });
            if (orderResponse.status === 401) { router.push(`/login?from=${encodeURIComponent("/#pricing")}`); return; }
            const order = await orderResponse.json();
            if (!orderResponse.ok) throw new Error(order.error || "Could not start checkout.");
            await loadCheckout();
            if (!window.Razorpay) throw new Error("Secure checkout is unavailable.");
            const checkout = new window.Razorpay({
                key: order.keyId, amount: order.amount, currency: order.currency, name: "ZEDX",
                description: order.planName, order_id: order.orderId,
                prefill: { email: order.accountEmail }, theme: { color: "#0284c7" },
                handler: async (result: Record<string, string>) => {
                    setBusy(true);
                    try {
                        const verification = await fetch("/api/billing/verify", {
                            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(result),
                        });
                        const confirmation = await verification.json();
                        if (!verification.ok) throw new Error(confirmation.error || "Payment confirmation failed.");
                        setMessage(`${confirmation.creditsAdded} interview credits added successfully.`);
                        router.refresh();
                    } catch (error) {
                        setMessage(error instanceof Error ? error.message : "Payment confirmation failed. Your payment will be reconciled automatically.");
                    } finally { setBusy(false); }
                },
            });
            checkout.on("payment.failed", response => { setMessage(response.error?.description || "Payment was not completed."); setBusy(false); });
            checkout.open();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Could not start checkout.");
            setBusy(false);
        }
    };

    return <div className="mt-auto">
        <button type="button" onClick={purchase} disabled={busy} className={className}>{busy ? "Opening checkout…" : "Buy pack"}</button>
        {message && <p role="status" className="mt-3 text-center text-xs">{message}</p>}
    </div>;
}
