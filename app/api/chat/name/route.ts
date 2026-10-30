import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/server/canvas-session";
import { claimChatName } from "@/lib/server/chat-names";
import { checkDeterministicMessageSafety, looksLikeUrl } from "@/lib/server/chat-safety";
import { parseChatName } from "@/lib/shared/chat-name";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const { userId } = readSession(req);
    if (!userId) return NextResponse.json({ error: "no session" }, { status: 401 });

    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
    const parsed = parseChatName((body as { name?: unknown } | null)?.name);
    if (!parsed.valid) return NextResponse.json({ error: parsed.error }, { status: 400 });
    if (!parsed.name) return NextResponse.json({ error: "Choose a name first." }, { status: 400 });
    if (looksLikeUrl(parsed.name) || !checkDeterministicMessageSafety(parsed.name).safe) {
        return NextResponse.json({ error: "name blocked as spam" }, { status: 400 });
    }

    try {
        const result = await claimChatName(userId, parsed.name);
        if (result.status === "taken") {
            return NextResponse.json({ error: "That name is already taken." }, { status: 409 });
        }
        return NextResponse.json({ displayName: result.name, claimed: result.status === "claimed" }, {
            status: result.status === "claimed" ? 200 : 409,
        });
    } catch (error) {
        console.error("[chat-name] claim failed", error);
        return NextResponse.json({ error: "Name store unavailable. Try again later." }, { status: 503 });
    }
}
