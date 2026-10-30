import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE, USER_COOKIE, issueSession, readSession } from "@/lib/server/canvas-session";
import { colorForUser } from "@/lib/shared/user-color";

// Force Node runtime so we can use long-lived streams elsewhere & process.env.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const existing = readSession(req);
    const { userId, token } = existing.userId && existing.token
        ? { userId: existing.userId, token: existing.token }
        : issueSession();

    const res = NextResponse.json({
        userId,
        token,
        color: colorForUser(userId),
    });

    const oneYear = 60 * 60 * 24 * 365;
    res.cookies.set(USER_COOKIE, userId, {
        httpOnly: false, // client-visible hint; the signed token is authoritative
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: oneYear,
    });
    res.cookies.set(TOKEN_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: oneYear,
    });
    return res;
}
