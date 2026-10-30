import { it } from "node:test";
import assert from "node:assert/strict";
import { contactCaller, reserveContactSend } from "./contact-limit";

it("rejects a fourth submission from the same caller in local development", async () => {
    const previous = {
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
        mode: process.env.NODE_ENV,
    };
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.NODE_ENV = "test";
    try {
        const caller = `test-${crypto.randomUUID()}`;
        for (let i = 0; i < 3; i++) assert.equal((await reserveContactSend(caller)).allowed, true);
        const blocked = await reserveContactSend(caller);
        assert.equal(blocked.allowed, false);
        assert.ok(blocked.retryAfter > 0);
    } finally {
        for (const [key, value] of [
            ["UPSTASH_REDIS_REST_URL", previous.url],
            ["UPSTASH_REDIS_REST_TOKEN", previous.token],
            ["NODE_ENV", previous.mode],
        ]) {
            if (value === undefined) delete process.env[key!];
            else process.env[key!] = value;
        }
    }
});

it("requires a shared quota in production and rejects quota service errors", async () => {
    const previous = {
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
        mode: process.env.NODE_ENV,
        fetch: globalThis.fetch,
    };
    process.env.NODE_ENV = "production";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    try {
        await assert.rejects(reserveContactSend("test"));
        process.env.UPSTASH_REDIS_REST_URL = "https://example.test";
        process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
        globalThis.fetch = (async (_input, init) => {
            const command = JSON.parse(String(init?.body));
            assert.equal(command[0], "EVAL");
            assert.equal(command[2], 2);
            return Response.json({ result: [0, 90] });
        }) as typeof fetch;
        assert.deepEqual(await reserveContactSend("test"), { allowed: false, retryAfter: 90 });
        globalThis.fetch = (async () => Response.json({ error: "unavailable" }, { status: 503 })) as typeof fetch;
        await assert.rejects(reserveContactSend("test"));
    } finally {
        globalThis.fetch = previous.fetch;
        for (const [key, value] of [
            ["UPSTASH_REDIS_REST_URL", previous.url],
            ["UPSTASH_REDIS_REST_TOKEN", previous.token],
            ["NODE_ENV", previous.mode],
        ]) {
            if (value === undefined) delete process.env[key!];
            else process.env[key!] = value;
        }
    }
});

it("hashes the caller address before using it as a quota key", () => {
    const caller = contactCaller(new Request("https://example.test", { headers: { "x-real-ip": "203.0.113.7" } }));
    assert.match(caller, /^[a-f0-9]{64}$/);
    assert.equal(caller, contactCaller(new Request("https://example.test", { headers: { "x-real-ip": "203.0.113.7" } })));
});
