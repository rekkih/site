import { NextRequest, NextResponse } from "next/server";
import { clearCanvas, parsePageKey } from "@/lib/server/canvas-store";
import { readSession } from "@/lib/server/canvas-session";
import { canClear } from "@/lib/server/spam-detect";
import { modTokenOk } from "@/lib/server/mod-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const pageKey = parsePageKey(req.nextUrl.searchParams.get("page"));
    const { userId, token } = readSession(req);
    if (!userId || !token) {
        return NextResponse.json({ error: "no session" }, { status: 401 });
    }
    // Canvas session token (CSRF guard) + mod token both required.
    const headerToken = req.headers.get("x-canvas-token");
    if (headerToken !== token) {
        return NextResponse.json({ error: "bad token" }, { status: 401 });
    }
    if (!modTokenOk(req)) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    await clearCanvas(pageKey, userId);
    return NextResponse.json({ ok: true });
}
