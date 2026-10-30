import { createHash } from "node:crypto";
import { BoundedIdentityMap, isBoundedIdentityMap } from "./bounded-identity-map";

const HOUR = 60 * 60;
const DAY = 24 * HOUR;
const PER_CALLER = 3;
const GLOBAL_DAILY = 100;

// Both counters are checked and incremented in one Redis operation.
const RESERVE_SCRIPT = `
local caller = tonumber(redis.call('GET', KEYS[1]) or '0')
local total = tonumber(redis.call('GET', KEYS[2]) or '0')
if caller >= tonumber(ARGV[1]) then return {0, redis.call('TTL', KEYS[1])} end
if total >= tonumber(ARGV[2]) then return {0, redis.call('TTL', KEYS[2])} end
redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]), 'NX')
redis.call('INCR', KEYS[2])
redis.call('EXPIRE', KEYS[2], tonumber(ARGV[4]), 'NX')
return {1, 0}
`;

type LimitResult = { allowed: boolean; retryAfter: number };
type LocalState = { callers: BoundedIdentityMap<{ count: number; expires: number }>; total: { count: number; expires: number } };

const globalStore = globalThis as typeof globalThis & { __contactLimit?: LocalState };
const local = globalStore.__contactLimit ??= {
    callers: new BoundedIdentityMap(HOUR * 1000 + 60_000, 1000), total: { count: 0, expires: 0 },
};
if (!isBoundedIdentityMap(local.callers)) local.callers = new BoundedIdentityMap(HOUR * 1000 + 60_000, 1000);

export function contactCaller(req: Request): string {
    // The global quota also protects SMTP if a proxy allows spoofed IP headers.
    const ip = req.headers.get("cf-connecting-ip")
        ?? req.headers.get("x-real-ip")
        ?? req.headers.get("x-forwarded-for")?.split(",")[0]
        ?? "unknown";
    return createHash("sha256").update(ip.trim()).digest("hex");
}

export async function reserveContactSend(caller: string): Promise<LimitResult> {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
        const now = Date.now();
        const hour = Math.floor(now / (HOUR * 1000));
        const day = Math.floor(now / (DAY * 1000));
        const response = await fetch(url, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(["EVAL", RESERVE_SCRIPT, 2, `contact:caller:${caller}:${hour}`, `contact:total:${day}`, PER_CALLER, GLOBAL_DAILY, HOUR + 60, DAY + 60]),
            signal: AbortSignal.timeout(5000),
            cache: "no-store",
        });
        if (!response.ok) throw new Error(`Contact quota unavailable (${response.status})`);
        const data: unknown = await response.json();
        if (!data || typeof data !== "object" || !("result" in data) || !Array.isArray(data.result)
            || data.result.length !== 2 || ![0, 1].includes(data.result[0]) || typeof data.result[1] !== "number") {
            throw new Error("Invalid contact quota response");
        }
        return { allowed: data.result[0] === 1, retryAfter: Math.max(1, data.result[1]) };
    }
    // Production must never silently fall back to per-instance memory.
    if (process.env.NODE_ENV === "production") throw new Error("Contact quota is not configured");

    const now = Date.now();
    const hourEnd = (Math.floor(now / (HOUR * 1000)) + 1) * HOUR * 1000;
    const dayEnd = (Math.floor(now / (DAY * 1000)) + 1) * DAY * 1000;
    if (local.total.expires !== dayEnd) local.total = { count: 0, expires: dayEnd };
    const current = local.callers.get(caller);
    const entry = current?.expires === hourEnd ? current : { count: 0, expires: hourEnd };
    if (entry.count >= PER_CALLER) return { allowed: false, retryAfter: Math.ceil((hourEnd - now) / 1000) };
    if (local.total.count >= GLOBAL_DAILY) return { allowed: false, retryAfter: Math.ceil((dayEnd - now) / 1000) };
    entry.count++;
    local.callers.set(caller, entry);
    local.total.count++;
    return { allowed: true, retryAfter: 0 };
}
