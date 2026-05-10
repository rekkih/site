import { NextRequest } from "next/server";
import { getSnapshot, subscribe, pingConnection, parsePageKey } from "@/lib/server/canvas-store";
import { readSession, newId } from "@/lib/server/canvas-session";
import { colorForUser } from "@/lib/shared/user-color";
import { modTokenOk } from "@/lib/server/mod-auth";
import type { ServerEvent } from "@/lib/shared/canvas-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-Sent Events for live stroke broadcasts.
export async function GET(req: NextRequest) {
    const pageKey = parsePageKey(req.nextUrl.searchParams.get("page"));
    const session = readSession(req);
    const userId = session.userId ?? newId();
    const color = colorForUser(userId);
    const isMod = modTokenOk(req);

    const encoder = new TextEncoder();
    const strokes = await getSnapshot(pageKey);

    let cleanupCalled = false;
    let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
    let unsubFn: (() => void) | null = null;

    const cleanup = () => {
        if (cleanupCalled) return;
        cleanupCalled = true;
        if (keepaliveTimer) clearInterval(keepaliveTimer);
        if (unsubFn) unsubFn();
    };

    const stream = new ReadableStream({
        start(controller) {
            const send = (e: ServerEvent) => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
                } catch { /* connection closed */ }
            };

            // 1. Initial snapshot.
            send({ type: "init", you: { userId, color }, strokes, isMod });

            // 2. Register connection (broadcasts updated count to existing listeners)
            const currentCount = pingConnection(pageKey, userId);

            // 3. Subscribe for live updates
            unsubFn = subscribe(pageKey, send);

            // 4. Send current count to this new connection
            send({ type: "count", count: currentCount });

            // 5. Periodic comment to keep connection alive through proxies.
            keepaliveTimer = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(`: ping\n\n`));
                } catch {
                    cleanup();
                }
            }, 30_000); // Ping every 30 seconds

            let closed = false;
            const close = () => {
                if (closed) return;
                closed = true;
                cleanup();
                try { controller.close(); } catch { /* */ }
            };

            req.signal.addEventListener("abort", close);
        },
        cancel() {
            cleanup();
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
