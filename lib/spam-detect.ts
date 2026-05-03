// Bot & spam detection for the canvas: session tokens, rate limits, UA checks, and geometric heuristics.

import type { Stroke } from "./canvas-types";

type Bucket = {
    strokes: number[]; // timestamps
    points: number;    // points in current window
    windowStart: number;
};

const SESSION_BUCKETS = new Map<string, Bucket>();
const IP_BUCKETS = new Map<string, Bucket>();

const WINDOW_MS = 10_000;
const MAX_STROKES_PER_WINDOW_SESSION = 40;
const MAX_POINTS_PER_WINDOW_SESSION = 4_000;
const MAX_STROKES_PER_WINDOW_IP = 120;

const MAX_POINTS_PER_STROKE = 800;
const MIN_POINTS_PER_STROKE = 2;

function tick(map: Map<string, Bucket>, key: string, addPoints: number, now: number): Bucket {
    let b = map.get(key);
    if (!b || now - b.windowStart > WINDOW_MS) {
        b = { strokes: [], points: 0, windowStart: now };
        map.set(key, b);
    }
    // Drop old strokes outside the window
    b.strokes = b.strokes.filter((t) => now - t <= WINDOW_MS);
    b.strokes.push(now);
    b.points += addPoints;
    return b;
}

export type DetectInput = {
    userId: string;
    ip: string;
    userAgent: string | null;
    sessionToken: string | null;
    expectedSessionToken: string | null;
    body: unknown;
};

export type DetectResult =
    | { ok: true; stroke: Stroke }
    | { ok: false; status: number; reason: string };

function isPlainObject(x: unknown): x is Record<string, unknown> {
    return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function validateAndRateLimit(input: DetectInput): DetectResult {
    const { userId, ip, userAgent, sessionToken, expectedSessionToken, body } = input;

    // Session token must match what we issued.
    if (!sessionToken || !expectedSessionToken || sessionToken !== expectedSessionToken) {
        return { ok: false, status: 401, reason: "bad session" };
    }

    // UA sanity check.
    if (!userAgent || userAgent.length < 8 || /\b(curl|wget|python-requests|httpie|go-http-client|libwww|scrapy)\b/i.test(userAgent)) {
        return { ok: false, status: 403, reason: "bot ua" };
    }

    // Body shape validation.
    if (!isPlainObject(body)) return { ok: false, status: 400, reason: "bad body" };

    // Honeypot: real client never sends `hp`.
    if ("hp" in body && body.hp) return { ok: false, status: 403, reason: "honeypot" };

    const points = body.points;
    const width = body.width;
    if (!Array.isArray(points)) return { ok: false, status: 400, reason: "no points" };
    if (points.length < MIN_POINTS_PER_STROKE || points.length > MAX_POINTS_PER_STROKE) {
        return { ok: false, status: 400, reason: "point count" };
    }
    if (typeof width !== "number" || !Number.isFinite(width) || width < 0.5 || width > 12) {
        return { ok: false, status: 400, reason: "bad width" };
    }

    // Validate every point + geometric heuristics.
    let identicalRun = 0;
    let totalLen = 0;
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (!isPlainObject(p)) return { ok: false, status: 400, reason: "bad pt" };
        const x = p.x, y = p.y;
        if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
            return { ok: false, status: 400, reason: "bad pt num" };
        }
        if (x < 0 || x > 1 || y < 0 || y > 1) {
            return { ok: false, status: 400, reason: "pt range" };
        }
        if (i > 0) {
            const prev = points[i - 1] as { x: number; y: number };
            const dx = x - prev.x, dy = y - prev.y;
            const d = Math.hypot(dx, dy);
            totalLen += d;
            if (d === 0) {
                identicalRun++;
                if (identicalRun > 8) return { ok: false, status: 400, reason: "stuck pts" };
            } else {
                identicalRun = 0;
            }
        }
    }
    // Zero-distance stroke is spam.
    if (totalLen < 0.0005 && points.length > 4) {
        return { ok: false, status: 400, reason: "no motion" };
    }

    // Rate limits.
    const now = Date.now();
    const sb = tick(SESSION_BUCKETS, userId, points.length, now);
    if (sb.strokes.length > MAX_STROKES_PER_WINDOW_SESSION) {
        return { ok: false, status: 429, reason: "stroke rate (session)" };
    }
    if (sb.points > MAX_POINTS_PER_WINDOW_SESSION) {
        return { ok: false, status: 429, reason: "point rate (session)" };
    }
    const ib = tick(IP_BUCKETS, ip, points.length, now);
    if (ib.strokes.length > MAX_STROKES_PER_WINDOW_IP) {
        return { ok: false, status: 429, reason: "stroke rate (ip)" };
    }

    const stroke: Stroke = {
        id: crypto.randomUUID(),
        userId,
        color: "", // filled in by route
        width,
        points: points.map((p) => ({ x: (p as Point).x, y: (p as Point).y })),
        ts: now,
    };
    return { ok: true, stroke };
}

type Point = { x: number; y: number };

// Throttle clears so a malicious user can't wipe the canvas in a loop.
const lastClearByUser = new Map<string, number>();
const CLEAR_COOLDOWN_MS = 30_000;

export function canClear(userId: string): boolean {
    const now = Date.now();
    const last = lastClearByUser.get(userId) ?? 0;
    if (now - last < CLEAR_COOLDOWN_MS) return false;
    lastClearByUser.set(userId, now);
    return true;
}
