import { NextRequest, NextResponse } from "next/server";
import { modTokenOk } from "@/lib/server/mod-auth";
import { scoreCandidate } from "@/lib/server/abuse-detect";
import type { Point } from "@/lib/shared/canvas-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    if (!modTokenOk(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
    const strokes = (body as { strokes?: unknown })?.strokes;
    if (!Array.isArray(strokes)) return NextResponse.json({ error: "strokes required" }, { status: 400 });

    const cleaned: Point[][] = [];
    for (const s of strokes) {
        if (!Array.isArray(s)) continue;
        const pts: Point[] = [];
        for (const p of s) {
            const x = (p as { x: number })?.x;
            const y = (p as { y: number })?.y;
            if (typeof x === "number" && typeof y === "number") pts.push({ x, y });
        }
        if (pts.length >= 2) cleaned.push(pts);
    }
    const out = await scoreCandidate(cleaned);
    return NextResponse.json(out);
}
