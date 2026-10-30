import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "../../app/api/canvas/session/route";
import { abuseNetworkKey, issueSession, readSession } from "./canvas-session";

process.env.CANVAS_SESSION_SECRET = "test-only-session-secret-with-more-than-32-characters";

function request(userId?: string, token?: string): NextRequest {
    const cookies = [
        userId === undefined ? null : `cv_uid=${userId}`,
        token === undefined ? null : `cv_tok=${token}`,
    ].filter(Boolean).join("; ");
    return new NextRequest("http://localhost/api/canvas/session", {
        headers: cookies ? { cookie: cookies } : undefined,
    });
}

describe("canvas session identity", () => {
    it("uses the signed token as the enforcement identity even when cv_uid changes", async () => {
        const issued = issueSession();
        const attackerId = crypto.randomUUID();
        assert.equal(readSession(request(attackerId, issued.token)).userId, issued.userId);

        const refreshed = await GET(request(attackerId, issued.token));
        assert.equal((await refreshed.json()).userId, issued.userId);
        assert.equal(refreshed.cookies.get("cv_uid")?.value, issued.userId);
        assert.equal(refreshed.cookies.get("cv_tok")?.value, issued.token);
    });

    it("rejects invented, legacy, and altered tokens", () => {
        const issued = issueSession();
        const other = issueSession();
        assert.deepEqual(readSession(request(issued.userId, crypto.randomUUID())), { userId: null, token: null });
        assert.deepEqual(readSession(request(issued.userId)), { userId: null, token: null });
        assert.deepEqual(readSession(request(issued.userId, issued.token.slice(0, -1) + (issued.token.endsWith("0") ? "1" : "0"))), { userId: null, token: null });
        const forged = issued.token.replace(issued.userId, other.userId);
        assert.deepEqual(readSession(request(other.userId, forged)), { userId: null, token: null });
    });

    it("issues a fresh valid pair for an unverifiable legacy session", async () => {
        const res = await GET(request(crypto.randomUUID(), crypto.randomUUID()));
        const body = await res.json();
        assert.equal(readSession(request(body.userId, body.token)).userId, body.userId);
        assert.notEqual(body.token.length, 36);
    });

    it("uses the trusted Vercel address for a durable network key", () => {
        const previous = process.env.VERCEL;
        process.env.VERCEL = "1";
        try {
            const first = new NextRequest("http://localhost", { headers: {
                "x-vercel-forwarded-for": "203.0.113.7",
                "x-forwarded-for": "198.51.100.1",
            } });
            const changedCallerHeader = new NextRequest("http://localhost", { headers: {
                "x-vercel-forwarded-for": "203.0.113.7",
                "x-forwarded-for": "198.51.100.2",
            } });
            const otherNetwork = new NextRequest("http://localhost", { headers: {
                "x-vercel-forwarded-for": "203.0.113.8",
            } });
            assert.equal(abuseNetworkKey(first), abuseNetworkKey(changedCallerHeader));
            assert.notEqual(abuseNetworkKey(first), abuseNetworkKey(otherNetwork));
        } finally {
            if (previous === undefined) delete process.env.VERCEL;
            else process.env.VERCEL = previous;
        }
    });
});
