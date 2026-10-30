import { NextRequest, NextResponse } from "next/server";
import { issueModStreamSession, MOD_STREAM_AGE_SECONDS, MOD_STREAM_COOKIE } from "@/lib/server/mod-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: NextRequest) {
    const session = issueModStreamSession(req);
    if (!session) return clearModSession(403);

    const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    res.cookies.set(MOD_STREAM_COOKIE, session, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/api",
        maxAge: MOD_STREAM_AGE_SECONDS,
    });
    return res;
}

export function DELETE() {
    return clearModSession(200);
}

function clearModSession(status: number) {
    const res = NextResponse.json(status === 200 ? { ok: true } : { error: "forbidden" }, {
        status,
        headers: { "Cache-Control": "no-store" },
    });
    res.cookies.set(MOD_STREAM_COOKIE, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/api",
        maxAge: 0,
    });
    return res;
}
