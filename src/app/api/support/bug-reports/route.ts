import { NextRequest, NextResponse } from "next/server";
import { apiClient } from "@/lib/api-access";
import { retryBugReportEmailsForUser, sendBugReportEmail } from "@/lib/bug-report-email";

async function authenticatedClient(request: NextRequest) {
    const client = apiClient(request);
    if (!client) return { error: NextResponse.json({ error: "Authentication is not configured" }, { status: 503 }) };
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return { error: NextResponse.json({ error: "Please sign in again" }, { status: 401 }) };
    return { client, user: data.user };
}

export async function GET(request: NextRequest) {
    const auth = await authenticatedClient(request);
    if (auth.error) return auth.error;
    const { data, error } = await auth.client.rpc("get_bug_reports");
    if (error) return NextResponse.json({ error: "Bug reports are temporarily unavailable" }, { status: 503 });
    await retryBugReportEmailsForUser(auth.user.id).catch(retryError => {
        console.error("[Bug report email retry]", retryError instanceof Error ? retryError.message : retryError);
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
    const auth = await authenticatedClient(request);
    if (auth.error) return auth.error;
    if (Number(request.headers.get("content-length")) > 30_000) {
        return NextResponse.json({ error: "Report details are too large" }, { status: 413 });
    }
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    const attachment = body?.attachment && typeof body.attachment === "object" ? body.attachment : null;
    const attachmentPath = typeof attachment?.path === "string" ? attachment.path : null;
    const attachmentName = typeof attachment?.name === "string" ? attachment.name : null;
    const attachmentType = typeof attachment?.type === "string" ? attachment.type : null;
    if (name.length < 2 || name.length > 120 || title.length < 5 || title.length > 160
        || description.length < 20 || description.length > 5000 || (!email && !phone)) {
        return NextResponse.json({ error: "Enter your name, contact details, a short title, and at least 20 characters of detail" }, { status: 400 });
    }
    const { data, error } = await auth.client.rpc("create_bug_report", {
        requested_name: name,
        requested_email: email,
        requested_phone: phone,
        requested_title: title,
        requested_description: description,
        requested_attachment_path: attachmentPath,
        requested_attachment_name: attachmentName,
        requested_attachment_type: attachmentType,
    });
    if (error) {
        const message = error.message.includes("limit reached")
            ? "You have reached the daily bug-report limit. Please email support directly."
            : "Could not submit the bug report. Please check the details and try again.";
        return NextResponse.json({ error: message }, { status: 400 });
    }
    const emailResult = await sendBugReportEmail(data).catch(emailError => {
        console.error("[Bug report email]", emailError instanceof Error ? emailError.message : emailError);
        return { sent: false, alreadyHandled: false };
    });
    return NextResponse.json({ id: data, emailSent: emailResult.sent }, {
        status: 201,
        headers: { "Cache-Control": "no-store" },
    });
}
