import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { issueSession } from "./canvas-session";
import { MOD_STREAM_COOKIE, modStreamOk, modTokenOk } from "./mod-auth";
import { POST } from "../../app/api/canvas/mod-session/route";
import { POST as modTest } from "../../app/api/canvas/mod-test/route";

const previousModToken = process.env.CANVAS_MOD_TOKEN;
const previousSessionSecret = process.env.CANVAS_SESSION_SECRET;

before(() => {
    process.env.CANVAS_MOD_TOKEN = "test-only-moderator-secret";
    process.env.CANVAS_SESSION_SECRET = "test-only-session-secret-with-more-than-32-characters";
});

after(() => {
    if (previousModToken === undefined) delete process.env.CANVAS_MOD_TOKEN;
    else process.env.CANVAS_MOD_TOKEN = previousModToken;
    if (previousSessionSecret === undefined) delete process.env.CANVAS_SESSION_SECRET;
    else process.env.CANVAS_SESSION_SECRET = previousSessionSecret;
});

function request(sessionToken: string, options: { url?: string; modHeader?: string; modCookie?: string } = {}): NextRequest {
    const cookies = [`cv_tok=${sessionToken}`];
    if (options.modCookie) cookies.push(`${MOD_STREAM_COOKIE}=${options.modCookie}`);
    return new NextRequest(options.url ?? "http://localhost/api/canvas/stream?page=home", {
        headers: {
            cookie: cookies.join("; "),
            ...(options.modHeader ? { "x-mod-token": options.modHeader } : {}),
        },
    });
}

describe("moderator stream authentication", () => {
    it("never accepts the shared secret from a URL", async () => {
        const session = issueSession();
        const req = request(session.token, { url: "http://localhost/api/canvas/stream?page=home&token=test-only-moderator-secret" });
        assert.equal(modTokenOk(req), false);
        assert.equal(modStreamOk(req), false);
        assert.equal((await modTest(request(session.token, { url: "http://localhost/api/canvas/mod-test?token=test-only-moderator-secret" }))).status, 403);
    });

    it("issues an HttpOnly stream cookie only for a valid header and signed session", () => {
        const session = issueSession();
        const denied = POST(request(session.token, { url: "http://localhost/api/canvas/mod-session?token=test-only-moderator-secret" }));
        assert.equal(denied.status, 403);
        assert.match(denied.headers.get("set-cookie") ?? "", /Max-Age=0/);

        const granted = POST(request(session.token, { modHeader: "test-only-moderator-secret" }));
        assert.equal(granted.status, 200);
        const cookie = granted.cookies.get(MOD_STREAM_COOKIE);
        assert.ok(cookie);
        assert.equal(cookie.httpOnly, true);
        assert.equal(cookie.sameSite, "strict");
        assert.equal(cookie.path, "/api");
        assert.equal(modStreamOk(request(session.token, { modCookie: cookie.value })), true);
        assert.equal(modTokenOk(request(session.token, { modCookie: cookie.value })), false);
        assert.equal(modStreamOk(request(issueSession().token, { modCookie: cookie.value })), false);
    });

    it("rejects expired, forged, and rotated stream cookies", () => {
        const session = issueSession();
        const cookie = POST(request(session.token, { modHeader: "test-only-moderator-secret" })).cookies.get(MOD_STREAM_COOKIE)!.value;
        assert.equal(modStreamOk(request(session.token, { modCookie: cookie.replace(/^\d+/, "1000000000") })), false);
        assert.equal(modStreamOk(request(session.token, { modCookie: cookie.slice(0, -1) + (cookie.endsWith("0") ? "1" : "0") })), false);
        process.env.CANVAS_MOD_TOKEN = "rotated-moderator-secret";
        assert.equal(modStreamOk(request(session.token, { modCookie: cookie })), false);
        process.env.CANVAS_MOD_TOKEN = "test-only-moderator-secret";
    });
});
