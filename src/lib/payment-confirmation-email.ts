import nodemailer from "nodemailer";
import { billingAdminClient } from "@/lib/razorpay-server";

type ConfirmationClaim = {
    userId: string;
    orderId: string;
    paymentId: string;
    planId: string;
    amount: number;
    currency: string;
    credits: number;
    creditsRemaining: number;
    receiptNumber: string;
};

function smtpConfiguration() {
    const host = process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com";
    const port = Number(process.env.BREVO_SMTP_PORT || "587");
    const user = process.env.BREVO_SMTP_USER;
    const pass = process.env.BREVO_SMTP_PASS;
    const fromEmail = process.env.ALLYX_EMAIL_FROM;
    if (!user || !pass || !fromEmail || !Number.isInteger(port)) {
        throw new Error("Payment email delivery is not configured");
    }
    return { host, port, user, pass, fromEmail };
}

function escapeHtml(value: string) {
    return value.replace(/[&<>'"]/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    })[character] || character);
}

function planLabel(planId: string, credits: number) {
    if (planId === "starter") return "Starter — 2 interviews";
    if (planId === "growth") return "Growth — 5 interviews";
    if (planId === "pro") return "Pro — 10 interviews";
    return `${credits} interview credits`;
}

function formatAmount(amount: number, currency: string) {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount / 100);
}

export async function sendPaymentConfirmationEmail(orderId: string) {
    const admin = billingAdminClient();
    const { data, error } = await admin.rpc("claim_payment_confirmation_email", { requested_order_id: orderId });
    if (error) throw error;
    if (!data) return { sent: false, alreadyHandled: true };

    const claim = data as ConfirmationClaim;
    try {
        const { data: account, error: accountError } = await admin.auth.admin.getUserById(claim.userId);
        if (accountError || !account.user?.email) throw accountError || new Error("Payment account has no email address");

        const config = smtpConfiguration();
        const transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.port === 465,
            auth: { user: config.user, pass: config.pass },
        });
        const receiptUrl = `https://allyx.vercel.app/dashboard/billing/receipt/${encodeURIComponent(claim.orderId)}`;
        const billingUrl = "https://allyx.vercel.app/dashboard/billing";
        const safeReceipt = escapeHtml(claim.receiptNumber);
        const safePayment = escapeHtml(claim.paymentId);
        const safePlan = escapeHtml(planLabel(claim.planId, claim.credits));
        const amount = escapeHtml(formatAmount(claim.amount, claim.currency));

        await transporter.sendMail({
            from: config.fromEmail,
            to: account.user.email,
            subject: `Payment confirmed — ${claim.credits} interview credits added`,
            messageId: `<payment-${claim.paymentId}@allyx.vercel.app>`,
            text: [
                "Your AllyX payment was successful.",
                `Plan: ${planLabel(claim.planId, claim.credits)}`,
                `Amount: ${formatAmount(claim.amount, claim.currency)}`,
                `Credits added: ${claim.credits}`,
                `Credits now available: ${claim.creditsRemaining}`,
                `Receipt: ${claim.receiptNumber}`,
                `Payment ID: ${claim.paymentId}`,
                `View receipt: ${receiptUrl}`,
                `Billing & Usage: ${billingUrl}`,
            ].join("\n"),
            html: `
                <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033">
                    <h1 style="font-size:24px">Payment confirmed</h1>
                    <p>Your AllyX payment was successful and your interview credits are ready to use.</p>
                    <table style="width:100%;border-collapse:collapse;margin:24px 0">
                        <tr><td style="padding:10px;border-bottom:1px solid #e5e7eb">Plan</td><td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right"><strong>${safePlan}</strong></td></tr>
                        <tr><td style="padding:10px;border-bottom:1px solid #e5e7eb">Amount paid</td><td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right"><strong>${amount}</strong></td></tr>
                        <tr><td style="padding:10px;border-bottom:1px solid #e5e7eb">Credits added</td><td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right"><strong>${claim.credits}</strong></td></tr>
                        <tr><td style="padding:10px;border-bottom:1px solid #e5e7eb">Credits available</td><td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right"><strong>${claim.creditsRemaining}</strong></td></tr>
                        <tr><td style="padding:10px;border-bottom:1px solid #e5e7eb">Receipt</td><td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right">${safeReceipt}</td></tr>
                        <tr><td style="padding:10px">Payment ID</td><td style="padding:10px;text-align:right">${safePayment}</td></tr>
                    </table>
                    <p><a href="${receiptUrl}" style="background:#2563eb;color:white;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block">View receipt</a></p>
                    <p style="font-size:13px;color:#64748b">You can review your credits and purchase history in <a href="${billingUrl}">Billing &amp; Usage</a>.</p>
                </div>`,
        });
        const { error: completeError } = await admin.rpc("complete_payment_confirmation_email", {
            requested_order_id: claim.orderId,
            delivered: true,
            delivery_error: null,
        });
        if (completeError) throw completeError;
        return { sent: true, alreadyHandled: false };
    } catch (error) {
        await admin.rpc("complete_payment_confirmation_email", {
            requested_order_id: claim.orderId,
            delivered: false,
            delivery_error: error instanceof Error ? error.message.slice(0, 500) : "Email delivery failed",
        });
        throw error;
    }
}
