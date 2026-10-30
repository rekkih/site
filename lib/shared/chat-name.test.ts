import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseChatName } from "./chat-name";

test("chat names are optional, normalized, and bounded", () => {
    assert.deepEqual(parseChatName(undefined), { valid: true, name: null });
    assert.deepEqual(parseChatName("   "), { valid: true, name: null });
    assert.deepEqual(parseChatName("  Ｍａｉｍａｉ   fan  "), { valid: true, name: "Maimai fan" });
    assert.equal(parseChatName("x".repeat(25)).valid, false);
    assert.equal(parseChatName("x".repeat(100_000)).valid, false);
    assert.equal(parseChatName("a\nb").valid, false);
    assert.equal(parseChatName("a\u202eb").valid, false);
    assert.equal(parseChatName("Rek").valid, false);
    assert.equal(parseChatName("Rеk").valid, false); // Cyrillic е
    assert.equal(parseChatName("Rék").valid, false); // accented e
    assert.equal(parseChatName("Μod").valid, false); // Greek capital mu
    assert.equal(parseChatName("Rе𝓴").valid, false); // Cyrillic е and mathematical k
    assert.equal(parseChatName("ｍоd").valid, false); // fullwidth m and Cyrillic o
    assert.equal(parseChatName("adｍin").valid, false); // m maps to the same skeleton as rn
    assert.deepEqual(parseChatName("Maimai fan"), { valid: true, name: "Maimai fan" });
    assert.equal(parseChatName({ name: "Rek" }).valid, false);
});
