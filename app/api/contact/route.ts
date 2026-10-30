import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { z } from "zod";
import { contactCaller, reserveContactSend } from "@/lib/server/contact-limit";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 16_384;
const MAX_CONCURRENT_SENDS = 2;
const schema = z.object({
    email: z.string().email().max(254),
    title: z.string().trim().min(1).max(120),
    message: z.string().trim().min(1).max(5_000),
});

const globalStore = globalThis as typeof globalThis & { __contactActiveSends?: number };

async function readBoundedJson(req: Request): Promise<unknown> {
    const reader = req.body?.getReader();
    if (!reader) throw new Error("Empty request");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_BODY_BYTES) throw new Error("Request too large");
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export async function POST(req: Request) {
    const declaredSize = Number(req.headers.get("content-length"));
    if (declaredSize > MAX_BODY_BYTES) {
        return NextResponse.json({ error: "Request too large" }, { status: 413 });
    }

    let parsed: z.infer<typeof schema>;
    try {
        parsed = schema.parse(await readBoundedJson(req));
    } catch (error) {
        const tooLarge = error instanceof Error && error.message === "Request too large";
        return NextResponse.json({ error: tooLarge ? "Request too large" : "Invalid contact form" }, { status: tooLarge ? 413 : 400 });
    }

    if ((globalStore.__contactActiveSends ?? 0) >= MAX_CONCURRENT_SENDS) {
        return NextResponse.json({ error: "Contact form busy" }, { status: 503, headers: { "Retry-After": "30" } });
    }

    let quota: Awaited<ReturnType<typeof reserveContactSend>>;
    try {
        quota = await reserveContactSend(contactCaller(req));
    } catch (error) {
        console.error("Contact quota unavailable:", error);
        return NextResponse.json({ error: "Contact form unavailable" }, { status: 503, headers: { "Retry-After": "60" } });
    }
    if (!quota.allowed) {
        return NextResponse.json({ error: "Too many contact requests" }, { status: 429, headers: { "Retry-After": String(quota.retryAfter) } });
    }

    // Bound SMTP connections per process; the shared daily quota caps all processes.
    if ((globalStore.__contactActiveSends ?? 0) >= MAX_CONCURRENT_SENDS) {
        return NextResponse.json({ error: "Contact form busy" }, { status: 503, headers: { "Retry-After": "30" } });
    }
    globalStore.__contactActiveSends = (globalStore.__contactActiveSends ?? 0) + 1;
    try {

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT),
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
            connectionTimeout: 10_000,
            greetingTimeout: 10_000,
            socketTimeout: 15_000,
        });

        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: process.env.CONTACT_EMAIL_TO,
            replyTo: parsed.email,
            subject: `Contact Form: ${parsed.title}`,
            text: parsed.message,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to send contact email:", error);
        return NextResponse.json({ error: "Failed to send email" }, { status: 502 });
    } finally {
        globalStore.__contactActiveSends!--;
    }
}
