import nodemailer from "nodemailer";
import { supportContact } from "@/lib/support-contact";

type ErrorAlert = {
    signature: string;
    name: string;
    message: string;
    stack: string | null;
    route: string;
    release: string;
    runtime: string;
    occurrences: number;
};

function escapeHtml(value: string) {
    return value.replace(/[&<>'"]/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    })[character] || character);
}

export async function sendProductionErrorAlert(error: ErrorAlert) {
    const host = process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com";
    const port = Number(process.env.BREVO_SMTP_PORT || "587");
    const user = process.env.BREVO_SMTP_USER;
    const pass = process.env.BREVO_SMTP_PASS;
    const from = process.env.ALLYX_EMAIL_FROM;
    const to = process.env.ERROR_ALERT_EMAIL_TO || process.env.BUG_REPORT_EMAIL_TO || supportContact.email;
    if (!user || !pass || !from || !to || !Number.isInteger(port)) return false;

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
    });
    const summary = `${error.name}: ${error.message}`;
    await transporter.sendMail({
        from,
        to,
        subject: `[AllyX production error] ${error.name} on ${error.route}`,
        messageId: `<client-error-${error.signature}-${error.occurrences}@allyx.vercel.app>`,
        text: [
            summary,
            `Route: ${error.route}`,
            `Runtime: ${error.runtime}`,
            `Release: ${error.release}`,
            `Occurrences: ${error.occurrences}`,
            `Signature: ${error.signature}`,
            "",
            error.stack || "No stack trace supplied.",
        ].join("\n"),
        html: `<div style="font-family:Arial,sans-serif;max-width:720px;margin:auto;color:#172033">
            <h1 style="font-size:22px">${escapeHtml(summary)}</h1>
            <p><strong>Route:</strong> ${escapeHtml(error.route)}</p>
            <p><strong>Runtime:</strong> ${escapeHtml(error.runtime)} · <strong>Release:</strong> ${escapeHtml(error.release)}</p>
            <p><strong>Occurrences:</strong> ${error.occurrences}</p>
            <pre style="white-space:pre-wrap;background:#f8fafc;padding:16px;border-radius:10px">${escapeHtml(error.stack || "No stack trace supplied.")}</pre>
        </div>`,
    });
    return true;
}
