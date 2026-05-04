import { NextRequest, NextResponse } from "next/server";
import { modTokenOk } from "@/lib/server/mod-auth";
import { addTemplate, getTemplates, removeTemplate } from "@/lib/server/abuse-templates";
import { normalize, type ShapeTemplate } from "@/lib/shared/shape-recognizer";
import type { Point } from "@/lib/shared/canvas-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function deny() {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

export async function GET(req: NextRequest) {
    if (!modTokenOk(req)) return deny();
    const templates = await getTemplates(true);
    // Don't ship the heavy normalized vector to the UI -- only the raw
    // points (for preview) and metadata.
    return NextResponse.json({
        templates: templates.map((t) => ({ id: t.id, name: t.name, raw: t.raw })),
    });
}

export async function POST(req: NextRequest) {
    if (!modTokenOk(req)) return deny();
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
    if (!body || typeof body !== "object") return NextResponse.json({ error: "bad body" }, { status: 400 });

    const { name, strokes } = body as { name?: unknown; strokes?: unknown };
    if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    if (!Array.isArray(strokes) || strokes.length === 0) {
        return NextResponse.json({ error: "strokes required" }, { status: 400 });
    }
    const cleaned: Point[][] = [];
    for (const s of strokes) {
        if (!Array.isArray(s)) return NextResponse.json({ error: "bad stroke" }, { status: 400 });
        const pts: Point[] = [];
        for (const p of s) {
            if (!p || typeof p !== "object") return NextResponse.json({ error: "bad point" }, { status: 400 });
            const x = (p as { x: number }).x;
            const y = (p as { y: number }).y;
            if (typeof x !== "number" || typeof y !== "number") return NextResponse.json({ error: "bad point" }, { status: 400 });
            pts.push({ x, y });
        }
        if (pts.length >= 2) cleaned.push(pts);
    }
    if (cleaned.length === 0) return NextResponse.json({ error: "empty" }, { status: 400 });

    const vector = normalize(cleaned);
    if (!vector) return NextResponse.json({ error: "could not normalize" }, { status: 400 });

    const flat: Point[] = [];
    for (const s of cleaned) for (const p of s) flat.push(p);

    const tpl: ShapeTemplate = {
        id: crypto.randomUUID(),
        name: name.trim().slice(0, 64),
        vector,
        raw: flat,
    };
    const ok = await addTemplate(tpl);
    return NextResponse.json({ ok, id: tpl.id, persisted: ok });
}

export async function DELETE(req: NextRequest) {
    if (!modTokenOk(req)) return deny();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const ok = await removeTemplate(id);
    return NextResponse.json({ ok });
}
