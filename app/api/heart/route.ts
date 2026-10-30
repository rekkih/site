import { NextRequest } from "next/server";
import { refreshConnection as refreshCanvas, parsePageKey } from "@/lib/server/canvas-store";
import { refreshConnection as refreshChat } from "@/lib/server/chat-store";
import { readSession } from "@/lib/server/canvas-session";
import { hasActiveStream } from "@/lib/server/sse-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Shared heartbeat endpoint — keeps the user alive in both the canvas and chat
// connection-tracking stores so the online count stays accurate.
export async function POST(req: NextRequest) {
    const pageKey = parsePageKey(req.nextUrl.searchParams.get("page"));
    if (pageKey === null) return Response.json({ error: "page not found" }, { status: 404 });
    const session = readSession(req);
    if (!session.userId || !session.token) {
        return new Response("Active session required", { status: 401 });
    }

    const canvasCount = hasActiveStream(session.token, session.userId, pageKey, "canvas")
        ? refreshCanvas(pageKey, session.userId) : null;
    const chatCount = hasActiveStream(session.token, session.userId, pageKey, "chat")
        ? refreshChat(pageKey, session.userId) : null;
    if (canvasCount === null && chatCount === null) {
        return new Response("Active connection required", { status: 401 });
    }

    return Response.json({ count: canvasCount ?? chatCount });
}
