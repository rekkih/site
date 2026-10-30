import { test } from "node:test";
import assert from "node:assert/strict";
import { BoundedIdentityMap } from "./bounded-identity-map";

test("idle identities expire even when they never return", () => {
    const cache = new BoundedIdentityMap<number>(100, 3);
    cache.set("abandoned", 1, 1_000);
    cache.set("active", 2, 1_050);
    cache.set("active", 3, 1_100);
    cache.prune(1_101);
    assert.equal(cache.size, 1);
    assert.equal(cache.get("abandoned", 1_101), undefined);
    assert.equal(cache.get("active", 1_101), 3);
});

test("identity cardinality stays bounded and least recently written key leaves first", () => {
    const cache = new BoundedIdentityMap<number>(10_000, 3);
    cache.set("one", 1, 1_000);
    cache.set("two", 2, 1_000);
    cache.set("three", 3, 1_000);
    cache.set("one", 4, 1_001);
    cache.set("four", 5, 1_002);
    assert.equal(cache.size, 3);
    assert.equal(cache.get("two", 1_002), undefined);
    assert.equal(cache.get("one", 1_002), 4);
    for (let i = 0; i < 100; i++) cache.set(`rotated-${i}`, i, 1_003);
    assert.equal(cache.size, 3);
});
