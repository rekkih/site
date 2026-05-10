import { NextRequest } from "next/server";
import { pingConnection as pingCanvas, parsePageKey } from "@/lib/server/canvas-store";
import { pingConnection as pingChat } from "@/lib/server/chat-store";
import { readSession, newId } from "@/lib/server/canvas-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Shared heartbeat endpoint — keeps the user alive in both the canvas and chat
// connection-tracking stores so the online count stays accurate.
export async function POST(req: NextRequest) {
    const pageKey = parsePageKey(req.nextUrl.searchParams.get("page"));
    const session = readSession(req);
    const userId = session.userId ?? newId();

    const canvasCount = pingCanvas(pageKey, userId);
    pingChat(pageKey, userId);

    return Response.json({ count: canvasCount });
}
