import { it } from "node:test";
import assert from "node:assert/strict";
import { POST } from "./route";

it("rejects oversized and invalid contact bodies before SMTP", async () => {
    const oversized = new Request("https://example.test/api/contact", {
        method: "POST", body: JSON.stringify({ email: "a@example.test", title: "x", message: "x".repeat(20_000) }),
    });
    assert.equal((await POST(oversized)).status, 413);

    const invalid = new Request("https://example.test/api/contact", {
        method: "POST", body: JSON.stringify({ email: "a@example.test", title: "x".repeat(121), message: "hello" }),
    });
    assert.equal((await POST(invalid)).status, 400);
});
