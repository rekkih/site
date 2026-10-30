import { NextRequest, NextResponse } from "next/server";
import { handleForUser, parseChatPageKey, sendMessage, getMessages, deleteMessage } from "@/lib/server/chat-store";
import { abuseNetworkKey, clientIp, readSession } from "@/lib/server/canvas-session";
import { colorForUser } from "@/lib/shared/user-color";
import { modTokenOk } from "@/lib/server/mod-auth";
import { checkDeterministicMessageSafety, checkMessageSafety } from "@/lib/server/chat-safety";
import { isBanned, recordStrike } from "@/lib/server/abuse-bans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function looksLikeUrl(text: string): boolean {
    const normalized = text
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/gu, "")
        .replace(/\s*[\[({]\s*(?:\.|dot|d0t)\s*[\])}]\s*/giu, ".")
        .replace(/\s+(?:dot|d0t)\s+/giu, ".")
        .replace(/\s*[\[({]\s*(?:\/|slash)\s*[\])}]\s*/giu, "/")
        .replace(/\s+slash\s+/giu, "/");

    const compact = normalized.replace(/\s+/gu, "");
    const urlish = normalized.replace(/\s*([.:,/?#@])\s*/gu, "$1");
    const label = String.raw`[\p{L}\p{N}](?:[\p{L}\p{N}_-]{0,61}[\p{L}\p{N}])?`;

    return (
        /(?:https?|hxxps?|ftp):?\/{0,2}|www\d{0,3}\.|(?:mailto|tel):/iu.test(compact) ||
        new RegExp(String.raw`(?:^|[^\p{L}\p{N}_-])${label}(?:\.${label})+(?::\d{1,5})?(?:[/?#]|$)`, "iu").test(urlish) ||
        /(?:^|[^\d])(?:\d{1,3}[.,]){3}\d{1,3}(?::\d{1,5})?(?:[/?#]|$)/u.test(urlish) ||
        /(?:^|[^\p{L}\p{N}_-])localhost(?::\d{1,5})?(?:[/?#]|$)/iu.test(urlish)
    );
}

export async function POST(req: NextRequest) {
    const pageKey = parseChatPageKey(req.nextUrl.searchParams.get("page"));
    if (pageKey === null) return NextResponse.json({ error: "page not found" }, { status: 404 });
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

    const isMod = modTokenOk(req);
    if (!isMod && looksLikeUrl(text)) {
        return NextResponse.json({ error: "links are not allowed" }, { status: 400 });
    }
    if (!isMod) {
        const deterministicSafety = checkDeterministicMessageSafety(text);
        if (!deterministicSafety.safe) {
            return NextResponse.json({ error: "message blocked as spam" }, { status: 400 });
        }
    }

    // Banned users get a fake-success shadow-ban (same pattern as canvas).
    if (await isBanned(userId, isMod ? null : abuseNetworkKey(req))) {
        return NextResponse.json({ ok: true, message: null });
    }

    const result = await sendMessage({
        pageKey,
        userId,
        ip: clientIp(req),
        handle: handleForUser(userId, isMod),
        color: colorForUser(userId),
        text,
        isMod,
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
                const nowBanned = await recordStrike(userId, isMod ? null : abuseNetworkKey(req));
                console.warn(`[chat-safety] deleted message ${message.id} from ${userId}: ${safetyResult.reason}${nowBanned ? " [BANNED]" : ""}`);
            }
        } catch (err) {
            console.error("[chat-safety] background check error:", err);
        }
    })();

    return NextResponse.json({ ok: true, message });
}
