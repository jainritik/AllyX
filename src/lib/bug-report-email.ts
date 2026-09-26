import nodemailer from "nodemailer";
import { billingAdminClient } from "@/lib/razorpay-server";
import { supportContact } from "@/lib/support-contact";

type BugReportClaim = {
    id: string;
    userId: string;
    name: string;
    email: string | null;
    phone: string | null;
    title: string;
    description: string;
    attachmentPath: string | null;
    attachmentName: string | null;
    attachmentType: string | null;
    createdAt: string;
};

function configuration() {
    const host = process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com";
    const port = Number(process.env.BREVO_SMTP_PORT || "587");
    const user = process.env.BREVO_SMTP_USER;
    const pass = process.env.BREVO_SMTP_PASS;
    const fromEmail = process.env.ALLYX_EMAIL_FROM;
    const toEmail = process.env.BUG_REPORT_EMAIL_TO || supportContact.email;
    if (!user || !pass || !fromEmail || !toEmail || !Number.isInteger(port)) {
        throw new Error("Bug report email delivery is not configured");
    }
    return { host, port, user, pass, fromEmail, toEmail };
}

function escapeHtml(value: string) {
    return value.replace(/[&<>'"]/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    })[character] || character);
}

export async function sendPublicBugReportEmail(report: {
    name: string;
    email: string;
    phone: string;
    title: string;
    description: string;
    page: string;
    attachment?: { filename: string; content: Buffer; contentType: string };
}) {
    const config = configuration();
    const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465,
        auth: { user: config.user, pass: config.pass },
    });
    const contact = [report.email, report.phone].filter(Boolean).join(" · ");
    await transporter.sendMail({
        from: config.fromEmail,
        to: config.toEmail,
        replyTo: report.email,
        subject: `[AllyX public bug] ${report.title}`,
        text: [
            `Bug report: ${report.title}`,
            `Reporter: ${report.name}`,
            `Contact: ${contact}`,
            `Affected page: ${report.page || "Not supplied"}`,
            "Account: Signed out or not identified",
            "",
            report.description,
        ].join("\n"),
        html: `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#172033">
            <h1 style="font-size:24px">${escapeHtml(report.title)}</h1>
            <p><strong>Reporter:</strong> ${escapeHtml(report.name)}</p>
            <p><strong>Contact:</strong> ${escapeHtml(contact)}</p>
            <p><strong>Affected page:</strong> ${escapeHtml(report.page || "Not supplied")}</p>
            <p><strong>Account:</strong> Signed out or not identified</p>
            <div style="white-space:pre-wrap;background:#f8fafc;padding:16px;border-radius:10px">${escapeHtml(report.description)}</div>
        </div>`,
        attachments: report.attachment ? [{
            filename: report.attachment.filename,
            content: report.attachment.content,
            contentType: report.attachment.contentType,
        }] : undefined,
    });
}

export async function sendBugReportEmail(reportId: string) {
    const admin = billingAdminClient();
    const { data, error } = await admin.rpc("claim_bug_report_email", { requested_report_id: reportId });
    if (error) throw error;
    if (!data) return { sent: false, alreadyHandled: true };
    const report = data as BugReportClaim;
    try {
        let attachmentUrl: string | null = null;
        if (report.attachmentPath) {
            const { data: signed, error: signedError } = await admin.storage
                .from("bug-report-attachments")
                .createSignedUrl(report.attachmentPath, 60 * 60 * 24 * 7);
            if (signedError) throw signedError;
            attachmentUrl = signed.signedUrl;
        }
        const config = configuration();
        const transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.port === 465,
            auth: { user: config.user, pass: config.pass },
        });
        const contact = [report.email, report.phone].filter(Boolean).join(" · ");
        const attachmentText = attachmentUrl
            ? `Attachment (${report.attachmentName || report.attachmentType || "file"}): ${attachmentUrl}`
            : "Attachment: None";
        await transporter.sendMail({
            from: config.fromEmail,
            to: config.toEmail,
            replyTo: report.email || undefined,
            subject: `[AllyX bug] ${report.title}`,
            messageId: `<bug-${report.id}@allyx.vercel.app>`,
            text: [
                `Bug report: ${report.title}`,
                `Reporter: ${report.name}`,
                `Contact: ${contact}`,
                `Account ID: ${report.userId}`,
                `Submitted: ${report.createdAt}`,
                "",
                report.description,
                "",
                attachmentText,
                "The attachment link is private and expires after seven days.",
            ].join("\n"),
            html: `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#172033">
                <h1 style="font-size:24px">${escapeHtml(report.title)}</h1>
                <p><strong>Reporter:</strong> ${escapeHtml(report.name)}</p>
                <p><strong>Contact:</strong> ${escapeHtml(contact)}</p>
                <p><strong>Account ID:</strong> ${escapeHtml(report.userId)}</p>
                <p><strong>Submitted:</strong> ${escapeHtml(report.createdAt)}</p>
                <div style="white-space:pre-wrap;background:#f8fafc;padding:16px;border-radius:10px">${escapeHtml(report.description)}</div>
                ${attachmentUrl ? `<p><a href="${escapeHtml(attachmentUrl)}" style="display:inline-block;background:#059669;color:white;padding:11px 16px;border-radius:8px;text-decoration:none">Open ${escapeHtml(report.attachmentName || "attachment")}</a></p><p style="font-size:12px;color:#64748b">This private link expires after seven days.</p>` : "<p>No attachment supplied.</p>"}
            </div>`,
        });
        const { error: completeError } = await admin.rpc("complete_bug_report_email", {
            requested_report_id: report.id,
            delivered: true,
            delivery_error: null,
        });
        if (completeError) throw completeError;
        return { sent: true, alreadyHandled: false };
    } catch (sendError) {
        await admin.rpc("complete_bug_report_email", {
            requested_report_id: report.id,
            delivered: false,
            delivery_error: sendError instanceof Error ? sendError.message.slice(0, 500) : "Email delivery failed",
        });
        throw sendError;
    }
}

export async function retryBugReportEmailsForUser(userId: string) {
    const admin = billingAdminClient();
    const retryBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data, error } = await admin.from("bug_reports")
        .select("id,email_status,email_last_attempt_at")
        .eq("user_id", userId)
        .is("email_sent_at", null)
        .lt("email_attempts", 5)
        .order("created_at", { ascending: false })
        .limit(3);
    if (error) throw error;
    for (const report of data || []) {
        const retryable = report.email_status !== "sending" || !report.email_last_attempt_at
            || report.email_last_attempt_at < retryBefore;
        if (retryable) await sendBugReportEmail(report.id).catch(emailError => {
            console.error("[Bug report email retry]", emailError instanceof Error ? emailError.message : emailError);
        });
    }
}
