import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sendPublicBugReportEmail } from "@/lib/bug-report-email";

export const runtime = "nodejs";

const allowedTypes = new Set([
    "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif",
    "video/mp4", "video/webm", "video/quicktime",
]);
const attempts = new Map<string, number[]>();

function value(form: FormData, name: string, maximum: number) {
    const input = form.get(name);
    return typeof input === "string" ? input.trim().slice(0, maximum + 1) : "";
}

function clientKey(request: NextRequest) {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    return createHash("sha256").update(`${forwarded}:${process.env.SUPABASE_SERVICE_ROLE_KEY || "allyx"}`).digest("hex");
}

function isRateLimited(key: string) {
    const cutoff = Date.now() - 60 * 60 * 1000;
    const recent = (attempts.get(key) || []).filter(time => time > cutoff);
    if (recent.length >= 5) return true;
    recent.push(Date.now());
    attempts.set(key, recent);
    if (attempts.size > 2_000) {
        for (const [storedKey, times] of attempts) if (!times.some(time => time > cutoff)) attempts.delete(storedKey);
    }
    return false;
}

export async function POST(request: NextRequest) {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 4_200_000) {
        return NextResponse.json({ error: "The report and attachment must be 4 MB or smaller." }, { status: 413 });
    }
    if (isRateLimited(clientKey(request))) {
        return NextResponse.json({ error: "Too many reports were submitted. Please wait before trying again." }, { status: 429 });
    }
    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "The report could not be read." }, { status: 400 });
    if (value(form, "website", 200)) return NextResponse.json({ ok: true }, { status: 201 });

    const startedAt = Number(value(form, "startedAt", 20));
    if (!Number.isFinite(startedAt) || Date.now() - startedAt < 2_000 || Date.now() - startedAt > 24 * 60 * 60 * 1000) {
        return NextResponse.json({ error: "Please reload the form and try again." }, { status: 400 });
    }
    const name = value(form, "name", 120);
    const email = value(form, "email", 254).toLowerCase();
    const phone = value(form, "phone", 30);
    const title = value(form, "title", 160);
    const description = value(form, "description", 5000);
    const page = value(form, "page", 500);
    if (name.length < 2 || title.length < 5 || description.length < 20
        || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return NextResponse.json({ error: "Enter a valid name, email, title, and at least 20 characters of detail." }, { status: 400 });
    }
    if (phone && (phone.length < 7 || phone.length > 30)) {
        return NextResponse.json({ error: "Enter a valid phone number or leave it empty." }, { status: 400 });
    }

    const uploaded = form.get("attachment");
    let attachment: { filename: string; content: Buffer; contentType: string } | undefined;
    if (uploaded instanceof File && uploaded.size > 0) {
        if (uploaded.size > 4 * 1024 * 1024 || !allowedTypes.has(uploaded.type)) {
            return NextResponse.json({ error: "Attach a supported image or video up to 4 MB." }, { status: 400 });
        }
        attachment = {
            filename: uploaded.name.replace(/[^A-Za-z0-9._-]/g, "-").slice(-120) || "attachment",
            content: Buffer.from(await uploaded.arrayBuffer()),
            contentType: uploaded.type,
        };
    }

    try {
        await sendPublicBugReportEmail({ name, email, phone, title, description, page, attachment });
        return NextResponse.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        console.error("[Public bug report]", error instanceof Error ? error.message : error);
        return NextResponse.json({ error: "Support could not receive the report right now. Please try again shortly." }, { status: 503 });
    }
}
