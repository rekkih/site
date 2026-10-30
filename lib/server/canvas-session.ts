import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { NextRequest } from "next/server";

export const USER_COOKIE = "cv_uid";
export const TOKEN_COOKIE = "cv_tok";

const SESSION_VERSION = "v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NONCE = /^[0-9a-f]{32}$/;
const SIGNATURE = /^[0-9a-f]{64}$/;
const globalSession = globalThis as typeof globalThis & { __canvasSessionSecret?: string };

function sessionSecret(): string {
    const configured = process.env.CANVAS_SESSION_SECRET;
    if (configured && configured.length >= 32) return configured;
    if (process.env.NODE_ENV === "production") {
        throw new Error("CANVAS_SESSION_SECRET must contain at least 32 characters");
    }
    return (globalSession.__canvasSessionSecret ??= randomBytes(32).toString("hex"));
}

function signature(payload: string): Buffer {
    return createHmac("sha256", sessionSecret()).update(payload).digest();
}

export function issueSession(): { userId: string; token: string } {
    const userId = newId();
    const payload = `${SESSION_VERSION}.${userId}.${randomBytes(16).toString("hex")}`;
    return { userId, token: `${payload}.${signature(payload).toString("hex")}` };
}

export function readSession(req: NextRequest): { userId: string | null; token: string | null } {
    const token = req.cookies.get(TOKEN_COOKIE)?.value;
    if (!token) return { userId: null, token: null };

    const parts = token.split(".");
    if (parts.length !== 4 || parts[0] !== SESSION_VERSION || !UUID.test(parts[1])
        || !NONCE.test(parts[2]) || !SIGNATURE.test(parts[3])) {
        return { userId: null, token: null };
    }
    const expected = signature(parts.slice(0, 3).join("."));
    if (!timingSafeEqual(expected, Buffer.from(parts[3], "hex"))) {
        return { userId: null, token: null };
    }

    // The signed token is authoritative. cv_uid is only a client-visible hint.
    return { userId: parts[1], token };
}

export function newId(): string {
    return crypto.randomUUID();
}

export function abuseNetworkKey(req: NextRequest): string | null {
    if (process.env.NODE_ENV === "production" && !process.env.VERCEL && !process.env.CANVAS_TRUSTED_IP_HEADER) {
        return null;
    }
    const ip = clientIp(req);
    if (ip === "0.0.0.0") return null;
    return `ip:${createHmac("sha256", sessionSecret()).update(`abuse-ip:${ip}`).digest("hex")}`;
}

export function clientIp(req: NextRequest): string {
    // Production network bans require a header set by the ingress proxy.
    const trustedHeader = process.env.VERCEL ? "x-vercel-forwarded-for" : process.env.CANVAS_TRUSTED_IP_HEADER;
    const value = trustedHeader
        ? req.headers.get(trustedHeader)
        : req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip");
    const ip = value?.split(",")[0].trim() ?? "";
    return isIP(ip) ? ip : "0.0.0.0";
}

export function streamAdmissionIp(req: NextRequest): string | null {
    // A caller-supplied forwarded header must not bypass the stream quota.
    if (process.env.NODE_ENV === "production" && !process.env.VERCEL && !process.env.CANVAS_TRUSTED_IP_HEADER) {
        return null;
    }
    return clientIp(req);
}
