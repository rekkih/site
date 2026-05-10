import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { z } from "zod";

const schema = z.object({
    email: z.string().email(),
    title: z.string().min(1),
    message: z.string().min(1),
});

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { email, title, message } = schema.parse(body);

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT),
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });

        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: process.env.CONTACT_EMAIL_TO,
            replyTo: email,
            subject: `Contact Form: ${title}`,
            text: message,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to send email:", error);
        return NextResponse.json({ success: false, error: "Failed to send email" }, { status: 500 });
    }
}
