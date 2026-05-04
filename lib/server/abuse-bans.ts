// Shadow bans for users who repeatedly draw forbidden shapes. Banned users get fake success responses.

import { kvConfigured, kvGet, kvPut } from "./cf-kv";

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
    __canvasStrikes?: Map<string, number>;
};

const cache: BanCache = (g.__canvasBans ??= {
    banned: new Set(),
    fetchedAt: 0,
    inflight: null,
});
const strikes: Map<string, number> = (g.__canvasStrikes ??= new Map());

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

export async function isBanned(userId: string): Promise<boolean> {
    const set = await refresh();
    return set.has(userId);
}

/**
 * Record a strike against a user. Returns true if this strike caused
 * (or already saw) them to be banned.
 */
export async function recordStrike(userId: string): Promise<boolean> {
    if (cache.banned.has(userId)) return true;
    const next = (strikes.get(userId) ?? 0) + 1;
    strikes.set(userId, next);
    if (next >= STRIKE_LIMIT) {
        cache.banned.add(userId);
        cache.fetchedAt = Date.now();
        strikes.delete(userId);
        await persist();
        return true;
    }
    return false;
}
