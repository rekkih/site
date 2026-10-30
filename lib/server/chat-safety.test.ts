import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkMessageSafety } from "./chat-safety";

const previousKey = process.env.OPENAI_API_KEY;
const originalFetch = globalThis.fetch;

before(() => { process.env.OPENAI_API_KEY = "test-key"; });
after(() => {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
});

describe("OpenAI chat moderation", () => {
    it("classifies the message and display name separately and blocks either flag", async () => {
        globalThis.fetch = async (_url, init) => {
            assert.deepEqual(JSON.parse(String(init?.body)), {
                model: "omni-moderation-latest",
                input: ["hello", "unsafe name"],
            });
            assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-key");
            return Response.json({ results: [
                { flagged: false, categories: { hate: false } },
                { flagged: true, categories: { hate: true } },
            ] });
        };
        assert.deepEqual(await checkMessageSafety("hello", "unsafe name"), { safe: false, reason: "hate" });
    });

    it("allows an unflagged response and rejects malformed or failed moderation", async () => {
        globalThis.fetch = async () => Response.json({ results: [{ flagged: false, categories: {} }] });
        assert.equal((await checkMessageSafety("hello")).safe, true);

        globalThis.fetch = async () => Response.json({ results: [] });
        await assert.rejects(checkMessageSafety("hello"), /invalid result count/);

        globalThis.fetch = async () => new Response(null, { status: 503 });
        await assert.rejects(checkMessageSafety("hello"), /failed \(503\)/);
    });
});
