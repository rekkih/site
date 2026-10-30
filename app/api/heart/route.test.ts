import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { admitStream, hasActiveStream } from "@/lib/server/sse-limits";
import { pingConnection, removeConnection, subscribe } from "@/lib/server/canvas-store";
import { issueSession } from "@/lib/server/canvas-session";

function request(page: string, cookies = ""): NextRequest {
    return new NextRequest(`http://localhost/api/heart?page=${page}`, {
        method: "POST",
        headers: cookies ? { cookie: cookies } : {},
    });
}

describe("heartbeat admission", () => {
    test("rejects a sessionless heartbeat without allocating connections", async () => {
        const connections = (globalThis as { __canvasPageConnections?: Map<string, Map<string, unknown>> }).__canvasPageConnections;
        const before = connections?.get("home")?.size ?? 0;
        assert.equal((await POST(request("home"))).status, 401);
        assert.equal(connections?.get("home")?.size ?? 0, before);
    });

    test("requires the matching active stream and refreshes without another broadcast", async () => {
        const { userId, token } = issueSession();
        const cookies = `cv_uid=${userId}; cv_tok=${token}`;
        assert.equal((await POST(request("home", cookies))).status, 204);

        const release = admitStream(token, "test-ip", "home", userId);
        assert.ok(release);
        let broadcasts = 0;
        const unsubscribe = subscribe("home", event => {
            if (event.type === "count") broadcasts++;
        });
        try {
            assert.equal((await POST(request("home", cookies))).status, 204);
            pingConnection("home", userId);
            assert.equal(broadcasts, 1);
            assert.equal((await POST(request("home", cookies))).status, 200);
            assert.equal(broadcasts, 1);
            assert.equal((await POST(request("other-page", cookies))).status, 404);
        } finally {
            unsubscribe();
            release();
            removeConnection("home", userId);
        }
        assert.equal(hasActiveStream(token, userId, "home"), false);
        assert.equal((await POST(request("home", cookies))).status, 204);
    });

    test("a chat stream cannot refresh a stale canvas connection", async () => {
        const { userId, token } = issueSession();
        pingConnection("home", userId);
        const release = admitStream(token, "test-ip", "home", userId, "chat");
        assert.ok(release);
        try {
            const response = await POST(request("home", `cv_uid=${userId}; cv_tok=${token}`));
            assert.equal(response.status, 204);
        } finally {
            release();
            removeConnection("home", userId);
        }
    });
});
