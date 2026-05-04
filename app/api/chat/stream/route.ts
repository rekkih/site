import { NextRequest } from "next/server";
import { COOLDOWN_MS, getMessages, parseChatPageKey, subscribe, handleForUser } from "@/lib/server/chat-store";
import { newId, readSession } from "@/lib/server/canvas-session";
import { colorForUser } from "@/lib/shared/user-color";
import { modTokenOk } from "@/lib/server/mod-auth";
import type { ChatServerEvent } from "@/lib/shared/chat-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-Sent Events for live chat broadcasts (per-page, anonymous).
export async function GET(req: NextRequest) {
    const pageKey = parseChatPageKey(req.nextUrl.searchParams.get("page"));
    const session = readSession(req);
    const userId = session.userId ?? newId();
    const isMod = modTokenOk(req);
    const handle = handleForUser(userId, isMod);
    const color = colorForUser(userId);

    const encoder = new TextEncoder();
    const messages = await getMessages(pageKey);

    let closed = false;
    let keepalive: ReturnType<typeof setInterval> | null = null;
    let unsub: (() => void) | null = null;

    const cleanup = () => {
        if (closed) return;
        closed = true;
        if (keepalive) clearInterval(keepalive);
        if (unsub) unsub();
    };

    const stream = new ReadableStream({
        start(controller) {
            const send = (e: ChatServerEvent) => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
                } catch { /* closed */ }
            };

            send({
                type: "init",
                you: { handle, color },
                messages,
                cooldownMs: COOLDOWN_MS,
                isMod,
            });

            unsub = subscribe(pageKey, send);

            keepalive = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(`: ping\n\n`));
                } catch {
                    cleanup();
                }
            }, 15000);

            const close = () => {
                cleanup();
                try { controller.close(); } catch { /* */ }
            };
            req.signal.addEventListener("abort", close);
        },
        cancel() { cleanup(); },
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
