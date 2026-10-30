import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createChatNameStore } from "./chat-names";

test("one session keeps its first name and another cannot claim a lookalike", async () => {
    const store = createChatNameStore({ production: false });
    assert.deepEqual(await store.claim("first", "Maimai"), { status: "claimed", name: "Maimai" });
    assert.deepEqual(await store.claim("first", "Other"), { status: "already_claimed", name: "Maimai" });
    assert.deepEqual(await store.claim("second", "Mаimai"), { status: "taken" }); // Cyrillic а
    assert.deepEqual(await store.claim("second", "MAIMAI"), { status: "taken" });
    assert.deepEqual(await store.claim("second", "Another"), { status: "claimed", name: "Another" });
    assert.equal(await store.get("first"), "Maimai");
    assert.equal(await store.get("second"), "Another");
});

test("concurrent Redis claims reserve both the session and normalized name atomically", async () => {
    const names = new Map<string, string>();
    const owners = new Map<string, string>();
    const commands: string[] = [];
    const fetcher: typeof fetch = async (_url, init) => {
        const parts = JSON.parse(String(init?.body)) as (string | number)[];
        const command = parts[0];
        commands.push(String(command));
        let result: unknown = null;
        if (command === "GET") result = names.get(String(parts[1])) ?? null;
        else if (command === "EVAL") {
            const [, , , userKey, ownerKey, name, userId] = parts;
            if (names.has(String(userKey))) result = [0, names.get(String(userKey))];
            else if (owners.has(String(ownerKey))) result = [2, ""];
            else {
                names.set(String(userKey), String(name));
                owners.set(String(ownerKey), String(userId));
                result = [1, name];
            }
        }
        return new Response(JSON.stringify({ result }));
    };
    const store = createChatNameStore({
        redisUrl: "https://example.test", redisToken: "test", production: true, fetcher,
    });
    const results = await Promise.all([
        store.claim("first", "Maimai"),
        store.claim("second", "Mаimai"),
        store.claim("first", "Other"),
    ]);
    assert.deepEqual(results, [
        { status: "claimed", name: "Maimai" },
        { status: "taken" },
        { status: "already_claimed", name: "Maimai" },
    ]);
    assert.equal(await store.get("first"), "Maimai");
    assert.equal(await store.get("second"), null);
    assert.deepEqual(commands, ["EVAL", "EVAL", "EVAL", "GET", "GET"]);
});

test("production does not fall back to process memory", async () => {
    const store = createChatNameStore({ production: true });
    await assert.rejects(store.get("visitor"), /not configured/);
    await assert.rejects(store.claim("visitor", "Name"), /not configured/);
});
