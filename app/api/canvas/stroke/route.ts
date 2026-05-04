import { NextRequest, NextResponse } from "next/server";
import { addStroke, parsePageKey } from "@/lib/server/canvas-store";
import { clientIp, readSession } from "@/lib/server/canvas-session";
import { validateAndRateLimit } from "@/lib/server/spam-detect";
import { colorForUser } from "@/lib/shared/user-color";
import { checkStrokeForAbuse } from "@/lib/server/abuse-detect";
import { isBanned, recordStrike } from "@/lib/server/abuse-bans";
import { modTokenOk } from "@/lib/server/mod-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const pageKey = parsePageKey(req.nextUrl.searchParams.get("page"));
    const { userId, token } = readSession(req);
    if (!userId || !token) {
        return NextResponse.json({ error: "no session" }, { status: 401 });
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "bad json" }, { status: 400 });
    }

    // Erase stroke (mod-only). Checked before spam-detect so eraser width doesn't trip limits.
    const bodyObj = body as Record<string, unknown>;
    if (bodyObj.erase === true) {
        if (!modTokenOk(req)) {
            return NextResponse.json({ error: "forbidden" }, { status: 403 });
        }
        const rawPts = bodyObj.points;
        const rawW = bodyObj.width;
        if (!Array.isArray(rawPts) || rawPts.length < 2) {
            return NextResponse.json({ error: "bad points" }, { status: 400 });
        }
        const points: Array<{ x: number; y: number }> = [];
        for (const p of rawPts) {
            if (!p || typeof p !== "object") continue;
            const x = (p as { x: number }).x;
            const y = (p as { y: number }).y;
            if (typeof x === "number" && typeof y === "number"
                && x >= 0 && x <= 1 && y >= 0 && y <= 1) {
                points.push({ x, y });
            }
        }
        if (points.length < 2) {
            return NextResponse.json({ error: "bad points" }, { status: 400 });
        }
        const eraseStroke = {
            id: crypto.randomUUID(),
            userId,
            color: colorForUser(userId),
            width: typeof rawW === "number" ? Math.max(5, Math.min(150, rawW)) : 30,
            points,
            ts: Date.now(),
            erase: true as const,
        };
        await addStroke(pageKey, eraseStroke);
        return NextResponse.json({ ok: true, id: eraseStroke.id });
    }

    // Normal stroke: spam/bot detection, rate limits, abuse check.
    const headerToken = req.headers.get("x-canvas-token");
    const result = validateAndRateLimit({
        userId,
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
        sessionToken: headerToken,
        expectedSessionToken: token,
        body,
    });

    if (!result.ok) {
        return NextResponse.json({ error: result.reason }, { status: result.status });
    }

    const stroke = { ...result.stroke, color: colorForUser(userId) };

    // Shadowbanned users get a fake success — nothing is broadcast.
    if (await isBanned(userId)) {
        return NextResponse.json({ ok: true, id: stroke.id, suppressed: true });
    }

    // Forbidden-shape check. Flagged strokes are silently dropped;
    // after STRIKE_LIMIT flags the user is shadowbanned.
    const abuse = await checkStrokeForAbuse(userId, stroke.points);
    if (abuse.flagged) {
        const nowBanned = await recordStrike(userId);
        console.warn(
            `[abuse] dropped stroke from ${userId}: matched ${abuse.templateName ?? abuse.templateId} (score ${abuse.score.toFixed(3)})${nowBanned ? " [BANNED]" : ""}`,
        );
        return NextResponse.json({ ok: true, id: stroke.id, suppressed: true });
    }

    await addStroke(pageKey, stroke);
    return NextResponse.json({ ok: true, id: stroke.id });
}
