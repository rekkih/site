import { NextRequest } from "next/server";
import { COOLDOWN_MS, getMessages, parseChatPageKey, subscribe, handleForUser, pingConnection, removeConnection } from "@/lib/server/chat-store";
import { streamAdmissionIp, readSession } from "@/lib/server/canvas-session";
import { admitStream, awaitSnapshot, boundedSnapshot, hasActiveStream, sseStream } from "@/lib/server/sse-limits";
import { colorForUser } from "@/lib/shared/user-color";
import { modStreamOk } from "@/lib/server/mod-auth";
import { getEntryByPageKey } from "@/lib/server/entries";
import type { ChatServerEvent } from "@/lib/shared/chat-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-Sent Events for live chat broadcasts (per-page, anonymous).
export async function GET(req: NextRequest) {
    const pageKey = parseChatPageKey(req.nextUrl.searchParams.get("page"));
    if (pageKey === null) return new Response("Page not found", { status: 404 });
    const session = readSession(req);
    if (!session.userId || !session.token) {
        return new Response("Session required", { status: 401 });
    }
    const userId = session.userId;
    const releaseAdmission = admitStream(session.token, streamAdmissionIp(req), pageKey, userId, "chat");
    if (!releaseAdmission) return new Response("Too many streams", { status: 429, headers: { "Retry-After": "5" } });
    const release = () => {
        releaseAdmission();
        if (!hasActiveStream(session.token!, userId, pageKey, "chat")) removeConnection(pageKey, userId);
    };
    const isMod = modStreamOk(req);
    const handle = handleForUser(userId, isMod);
    const color = colorForUser(userId);

    // Get channel name: entry title if on an entry page, otherwise "Comments"
    const entry = getEntryByPageKey(pageKey);
    const channel = entry?.title ?? "Comments";

    let messages;
    try { messages = await awaitSnapshot(req.signal, getMessages(pageKey)); }
    catch (error) { release(); throw error; }
    if (!messages) {
        release();
        return new Response(null, { status: req.signal.aborted ? 499 : 503, headers: { "Retry-After": "5" } });
    }
    const init = (items: typeof messages): ChatServerEvent => ({
        type: "init", you: { handle, color }, messages: items,
        cooldownMs: COOLDOWN_MS, isMod, channel,
    });
    const stream = sseStream<ChatServerEvent>({
        signal: req.signal,
        release,
        init: init(boundedSnapshot(messages, init)),
        subscribe: send => {
            pingConnection(pageKey, userId);
            return subscribe(pageKey, send);
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}
