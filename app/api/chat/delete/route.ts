import { NextRequest, NextResponse } from "next/server";
import { parseChatPageKey, deleteMessage } from "@/lib/server/chat-store";
import { modTokenOk } from "@/lib/server/mod-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest) {
    if (!modTokenOk(req)) {
        return NextResponse.json({ error: "unauthorized" }, { status: 403 });
    }

    const pageKey = parseChatPageKey(req.nextUrl.searchParams.get("page"));
    if (pageKey === null) return NextResponse.json({ error: "page not found" }, { status: 404 });
    const { id } = await req.json() as { id?: string };

    if (!id || typeof id !== "string") {
        return NextResponse.json({ error: "missing id" }, { status: 400 });
    }

    const deleted = await deleteMessage(pageKey, id);
    if (!deleted) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
}
