import { NextRequest } from "next/server";
import { getSnapshot, subscribe, pingConnection, removeConnection, parsePageKey } from "@/lib/server/canvas-store";
import { readSession, streamAdmissionIp } from "@/lib/server/canvas-session";
import { admitStream, awaitSnapshot, boundedSnapshot, hasActiveStream, sseStream } from "@/lib/server/sse-limits";
import { colorForUser } from "@/lib/shared/user-color";
import { modStreamOk } from "@/lib/server/mod-auth";
import type { ServerEvent } from "@/lib/shared/canvas-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-Sent Events for live stroke broadcasts.
export async function GET(req: NextRequest) {
    const pageKey = parsePageKey(req.nextUrl.searchParams.get("page"));
    if (pageKey === null) return new Response("Page not found", { status: 404 });
    const session = readSession(req);
    if (!session.userId || !session.token) {
        return new Response("Session required", { status: 401 });
    }
    const userId = session.userId;
    const releaseAdmission = admitStream(session.token, streamAdmissionIp(req), pageKey, userId);
    if (!releaseAdmission) return new Response("Too many streams", { status: 429, headers: { "Retry-After": "5" } });
    const release = () => {
        releaseAdmission();
        if (!hasActiveStream(session.token!, userId, pageKey, "canvas")) removeConnection(pageKey, userId);
    };
    const color = colorForUser(userId);
    const isMod = modStreamOk(req);

    let strokes;
    try { strokes = await awaitSnapshot(req.signal, getSnapshot(pageKey)); }
    catch (error) { release(); throw error; }
    if (!strokes) {
        release();
        return new Response(null, { status: req.signal.aborted ? 499 : 503, headers: { "Retry-After": "5" } });
    }
    const init = (items: typeof strokes): ServerEvent => ({ type: "init", you: { userId, color }, strokes: items, isMod });
    const stream = sseStream<ServerEvent>({
        signal: req.signal,
        release,
        init: init(boundedSnapshot(strokes, init)),
        subscribe: send => {
            const count = pingConnection(pageKey, userId);
            const unsubscribe = subscribe(pageKey, send);
            send({ type: "count", count });
            return unsubscribe;
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
