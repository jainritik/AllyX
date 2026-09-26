"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BillingPlanId } from "@/lib/billing-plans";

declare global {
    interface Window {
        Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void };
    }
}

let checkoutPromise: Promise<void> | null = null;

function loadCheckout() {
    if (window.Razorpay) return Promise.resolve();
    if (checkoutPromise) return checkoutPromise;
    checkoutPromise = new Promise<void>((resolve, reject) => {
        document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]')?.remove();
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.async = true;
        const timeout = window.setTimeout(() => {
            script.remove();
            checkoutPromise = null;
            reject(new Error("Secure checkout took too long to load. Check your connection and try again."));
        }, 12_000);
        script.onload = () => { window.clearTimeout(timeout); resolve(); };
        script.onerror = () => {
            window.clearTimeout(timeout);
            script.remove();
            checkoutPromise = null;
            reject(new Error("Could not load secure checkout. Check your connection and try again."));
        };
        document.head.appendChild(script);
    });
    return checkoutPromise;
}

export function PurchaseButton({ planId, className, onSuccess, autoStart = false }: { planId: BillingPlanId; className?: string; onSuccess?: () => void; autoStart?: boolean }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const autoStartHandled = useRef(false);

    const reconcileOrder = async (orderId: string) => {
        for (let attempt = 0; attempt < 5; attempt++) {
            if (attempt) await new Promise(resolve => setTimeout(resolve, 1500));
            const response = await fetch("/api/billing/account", { cache: "no-store" });
            if (!response.ok) continue;
            const account = await response.json() as { purchases?: Array<{ orderId?: string; status?: string; credits?: number }> };
            const purchase = account.purchases?.find(item => item.orderId === orderId);
            if (purchase && purchase.status !== "created") {
                return purchase;
            }
        }
        return null;
    };

    const purchase = async () => {
        setBusy(true); setMessage("");
        try {
            const orderResponse = await fetch("/api/billing/order", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId }),
            });
            if (orderResponse.status === 401) {
                const returnPath = `/dashboard/billing?plan=${encodeURIComponent(planId)}`;
                router.push(`/login?from=${encodeURIComponent(returnPath)}`);
                return;
            }
            const order = await orderResponse.json();
            if (!orderResponse.ok) throw new Error(order.error || "Could not start checkout.");
            await loadCheckout();
            if (!window.Razorpay) throw new Error("Secure checkout is unavailable.");
            const checkout = new window.Razorpay({
                key: order.keyId, amount: order.amount, currency: order.currency, name: "AllyX",
                description: order.planName, order_id: order.orderId,
                prefill: { email: order.accountEmail }, theme: { color: "#0284c7" },
                modal: { ondismiss: () => { setMessage("Checkout closed. Any completed payment will appear automatically."); setBusy(false); } },
                handler: async (result: Record<string, string>) => {
                    setBusy(true);
                    try {
                        const verification = await fetch("/api/billing/verify", {
                            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(result),
                        });
                        const confirmation = await verification.json();
                        if (!verification.ok) throw new Error(confirmation.error || "Payment confirmation failed.");
                        setMessage(`${confirmation.creditsAdded} interview credits added successfully.`);
                        onSuccess?.();
                        router.refresh();
                    } catch (error) {
                        const reconciled = await reconcileOrder(order.orderId).catch(() => null);
                        if (reconciled?.status === "paid") {
                            setMessage(`${reconciled.credits || order.credits} interview credits added successfully.`);
                            onSuccess?.();
                            router.refresh();
                        } else if (reconciled && ["authorized", "captured"].includes(reconciled.status || "")) {
                            setMessage("Payment received and confirmation is still processing. Refresh Billing & Credits in a moment.");
                        } else if (reconciled && ["refund_pending", "partially_refunded", "refunded", "disputed"].includes(reconciled.status || "")) {
                            setMessage("This payment is under refund or dispute review. Your current credit balance is shown above.");
                            router.refresh();
                        } else {
                            setMessage(error instanceof Error ? `${error.message} Refresh Billing & Credits in a moment; captured payments are reconciled automatically.` : "Payment confirmation is pending. Refresh Billing & Credits in a moment.");
                        }
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

    useEffect(() => {
        if (!autoStart || autoStartHandled.current) return;
        autoStartHandled.current = true;
        window.history.replaceState(null, "", "/dashboard/billing");
        void purchase();
        // The selected plan is immutable for this mounted purchase button.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoStart]);

    return <div className="mt-auto">
        <button type="button" onClick={purchase} disabled={busy} className={className}>{busy ? "Opening checkout…" : "Buy pack"}</button>
        {message && <p role="status" className="mt-3 text-center text-xs">{message}</p>}
    </div>;
}
