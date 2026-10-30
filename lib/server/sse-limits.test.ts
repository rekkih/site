import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { issueSession } from "./canvas-session";
import { GET as canvasStream } from "../../app/api/canvas/stream/route";
import { GET as chatStream } from "../../app/api/chat/stream/route";
import { admitStream, awaitSnapshot, boundedSnapshot, MAX_SNAPSHOT_BYTES, sseStream } from "./sse-limits";

describe("SSE resource limits", () => {
    test("caps streams per session and releases capacity", () => {
        const releases = Array.from({ length: 4 }, () => admitStream("test-session", "test-ip", "home", "test-user"));
        assert.ok(releases.every(Boolean));
        assert.equal(admitStream("test-session", "test-ip", "home", "test-user"), null);
        releases[0]?.();
        const replacement = admitStream("test-session", "test-ip", "home", "test-user");
        assert.ok(replacement);
        replacement?.();
        releases.forEach(release => release?.());
    });

    test("caps all streams in a process even with distinct sessions and IPs", () => {
        const releases = Array.from({ length: 128 }, (_, i) => admitStream(`session-${i}`, `ip-${i}`, "home", `user-${i}`));
        try {
            assert.ok(releases.every(Boolean));
            assert.equal(admitStream("overflow-session", "overflow-ip", "home", "overflow-user"), null);
        } finally {
            releases.forEach(release => release?.());
        }
    });

    test("the IP cap applies only when an ingress address is trusted", () => {
        const releases = Array.from({ length: 12 }, (_, i) => admitStream(`shared-ip-session-${i}`, "trusted-ip", "home", `user-${i}`));
        try {
            assert.ok(releases.every(Boolean));
            assert.equal(admitStream("extra-session", "trusted-ip", "home", "extra-user"), null);
            const withoutTrustedIp = admitStream("extra-session", null, "home", "extra-user");
            assert.ok(withoutTrustedIp);
            withoutTrustedIp?.();
        } finally {
            releases.forEach(release => release?.());
        }
    });

    test("limits initial snapshots while keeping the newest records", () => {
        const items = Array.from({ length: 8 }, (_, i) => ({ id: i, text: "x".repeat(50_000) }));
        const result = boundedSnapshot(items, records => ({ type: "init", records }));
        assert.ok(result.length < items.length);
        assert.equal(result.at(-1)?.id, 7);
        assert.ok(new TextEncoder().encode(JSON.stringify({ type: "init", records: result })).byteLength <= MAX_SNAPSHOT_BYTES);
    });

    test("disconnects a reader whose queued events exceed the byte budget", () => {
        let send: ((event: string) => void) | undefined;
        let unsubscribed = false;
        let released = false;
        const stream = sseStream({
            signal: new AbortController().signal,
            release: () => { released = true; },
            init: "init",
            subscribe: listener => {
                send = listener;
                return () => { unsubscribed = true; };
            },
        });
        send?.("a".repeat(300_000));
        send?.("b".repeat(300_000));
        assert.ok(unsubscribed);
        assert.ok(released);
        void stream.cancel();
    });

    test("stalled and aborted snapshot loads stop waiting", async () => {
        const stalled = new Promise<string[]>(() => {});
        assert.equal(await awaitSnapshot(new AbortController().signal, stalled, 1), null);
        const controller = new AbortController();
        const result = awaitSnapshot(controller.signal, stalled, 60_000);
        controller.abort();
        assert.equal(await result, null);
        assert.deepEqual(await awaitSnapshot(new AbortController().signal, Promise.resolve(["ok"]), 1), ["ok"]);
    });

    test("both routes reject missing sessions and serve valid visitors", async () => {
        const { token } = issueSession();
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async () => new Response(null, { status: 404 })) as typeof fetch;
        try {
            for (const [path, handler] of [
                ["canvas/stream", canvasStream],
                ["chat/stream", chatStream],
            ] as const) {
                const url = `http://localhost/api/${path}?page=home`;
                assert.equal((await handler(new NextRequest(url))).status, 401);
                const response = await handler(new NextRequest(url, { headers: { cookie: `cv_tok=${token}` } }));
                assert.equal(response.status, 200);
                assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
                const reader = response.body!.getReader();
                const first = await reader.read();
                assert.match(new TextDecoder().decode(first.value), /"type":"init"/);
                await reader.cancel();
            }
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test("a fifth stream for one session is rejected, then capacity returns on cancel", async () => {
        const { token } = issueSession();
        const url = "http://localhost/api/canvas/stream?page=home";
        const request = () => new NextRequest(url, { headers: { cookie: `cv_tok=${token}` } });
        const responses: Response[] = [];
        try {
            for (let i = 0; i < 4; i++) {
                const response = await canvasStream(request());
                assert.equal(response.status, 200);
                responses.push(response);
            }
            assert.equal((await canvasStream(request())).status, 429);
            await responses[0].body!.cancel();
            const replacement = await canvasStream(request());
            assert.equal(replacement.status, 200);
            responses.push(replacement);
        } finally {
            for (const response of responses) await response.body?.cancel();
        }
    });
});
