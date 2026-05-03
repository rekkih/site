import { NextRequest, NextResponse } from "next/server";
import { clearCanvas } from "@/lib/canvas-store";
import { readSession } from "@/lib/canvas-session";
import { canClear } from "@/lib/spam-detect";
import { modTokenOk } from "@/lib/mod-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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
    if (!canClear(userId)) {
        return NextResponse.json({ error: "clear cooldown" }, { status: 429 });
    }
    await clearCanvas(userId);
    return NextResponse.json({ ok: true });
}
