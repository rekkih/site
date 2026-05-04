import { NextRequest, NextResponse } from "next/server";
import { handleForUser, parseChatPageKey, sendMessage, getMessages, deleteMessage } from "@/lib/server/chat-store";
import { clientIp, readSession } from "@/lib/server/canvas-session";
import { colorForUser } from "@/lib/shared/user-color";
import { modTokenOk } from "@/lib/server/mod-auth";
import { checkMessageSafety } from "@/lib/server/chat-safety";
import { isBanned, recordStrike } from "@/lib/server/abuse-bans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const pageKey = parseChatPageKey(req.nextUrl.searchParams.get("page"));
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
    const text = (body as { text?: unknown } | null)?.text;

    if (text === undefined || typeof text !== "string" || text.trim().length === 0) {
        return NextResponse.json({ error: "missing text" }, { status: 400 });
    }

    // too long?
    if (text.length > 500) {
        return NextResponse.json({ error: "text too long" }, { status: 400 });
    }

    // Banned users get a fake-success shadow ban (same pattern as canvas).
    if (await isBanned(userId)) {
        return NextResponse.json({ ok: true, message: null });
    }

    const isMod = modTokenOk(req);
    const result = await sendMessage({
        pageKey,
        userId,
        ip: clientIp(req),
        handle: handleForUser(userId, isMod),
        color: colorForUser(userId),
        text,
    });

    if (!result.ok) {
        const headers: Record<string, string> = {};
        if (result.retryAfterMs !== undefined) {
            headers["Retry-After"] = String(Math.ceil(result.retryAfterMs / 1000));
        }
        return NextResponse.json(
            { error: result.error, retryAfterMs: result.retryAfterMs },
            { status: result.status, headers },
        );
    }

    // Fire-and-forget background safety check; delete the message if it violates.
    const { message } = result;
    void (async () => {
        try {
            const recentMessages = (await getMessages(pageKey))
                .filter((m) => m.id !== message.id)
                .slice(-5)
                .map((m) => m.text);
            const safetyResult = await checkMessageSafety(text, { recentMessages, pageKey });
            if (!safetyResult.safe) {
                await deleteMessage(pageKey, message.id);
                const nowBanned = await recordStrike(userId);
                console.warn(`[chat-safety] deleted message ${message.id} from ${userId}: ${safetyResult.reason}${nowBanned ? " [BANNED]" : ""}`);
            }
        } catch (err) {
            console.error("[chat-safety] background check error:", err);
        }
    })();

    return NextResponse.json({ ok: true, message });
}
