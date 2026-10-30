// Shadow bans for users who repeatedly draw forbidden shapes. Banned users get fake success responses.

import { kvConfigured, kvGet, kvPut } from "./cf-kv";
import { BoundedIdentityMap, isBoundedIdentityMap } from "./bounded-identity-map";

const KV_KEY = "canvas:v1:bans";
const REFRESH_MS = 30_000;
export const STRIKE_LIMIT = 10;

type BanCache = {
    banned: Set<string>;
    fetchedAt: number;
    inflight: Promise<Set<string>> | null;
};

const g = globalThis as unknown as {
    __canvasBans?: BanCache;
    __canvasStrikes?: BoundedIdentityMap<number>;
};

const cache: BanCache = (g.__canvasBans ??= {
    banned: new Set(),
    fetchedAt: 0,
    inflight: null,
});
const strikes = isBoundedIdentityMap<number>(g.__canvasStrikes)
    ? g.__canvasStrikes
    : (g.__canvasStrikes = new BoundedIdentityMap<number>(7 * 24 * 60 * 60_000, 8192));

async function loadFromKv(): Promise<Set<string>> {
    if (!kvConfigured) return new Set();
    const data = await kvGet<{ banned: string[] }>(KV_KEY);
    return new Set(data?.banned ?? []);
}

async function refresh(force = false): Promise<Set<string>> {
    const now = Date.now();
    if (!force && now - cache.fetchedAt < REFRESH_MS) return cache.banned;
    if (cache.inflight) return cache.inflight;
    cache.inflight = (async () => {
        try {
            cache.banned = await loadFromKv();
            cache.fetchedAt = Date.now();
        } finally {
            cache.inflight = null;
        }
        return cache.banned;
    })();
    return cache.inflight;
}

async function persist(): Promise<void> {
    if (!kvConfigured) return;
    await kvPut(KV_KEY, { banned: [...cache.banned] });
}

export async function isBanned(userId: string, networkKey?: string | null): Promise<boolean> {
    const set = await refresh();
    return set.has(userId) || Boolean(networkKey && set.has(networkKey));
}

/**
 * Record a strike against a user. Returns true if this strike caused
 * (or already saw) them to be banned.
 */
export async function recordStrike(userId: string, networkKey?: string | null): Promise<boolean> {
    if (cache.banned.has(userId) || Boolean(networkKey && cache.banned.has(networkKey))) return true;
    const next = (strikes.get(userId) ?? 0) + 1;
    strikes.set(userId, next);
    const networkStrikes = networkKey ? (strikes.get(networkKey) ?? 0) + 1 : 0;
    if (networkKey) strikes.set(networkKey, networkStrikes);
    if (next >= STRIKE_LIMIT || networkStrikes >= STRIKE_LIMIT) {
        cache.banned.add(userId);
        if (networkKey) cache.banned.add(networkKey);
        cache.fetchedAt = Date.now();
        strikes.delete(userId);
        if (networkKey) strikes.delete(networkKey);
        await persist();
        return true;
    }
    return false;
}
