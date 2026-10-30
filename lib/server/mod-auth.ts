// Moderator actions require the shared secret in a request header. EventSource
// uses a short-lived cookie bound to the caller's signed canvas session.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { readSession } from "./canvas-session";

export const MOD_STREAM_COOKIE = "cv_mod_stream";
export const MOD_STREAM_AGE_SECONDS = 5 * 60;

export function modTokenOk(req: NextRequest): boolean {
    const expected = process.env.CANVAS_MOD_TOKEN;
    if (!expected) return false; // disabled when unset
    const header = req.headers.get("x-mod-token")?.replaceAll(`"`, '');
    return header === expected;
}

function streamSignature(sessionToken: string, expires: number, secret: string): Buffer {
    return createHmac("sha256", secret)
        .update(`mod-stream:${sessionToken}:${expires}`)
        .digest();
}

export function issueModStreamSession(req: NextRequest): string | null {
    const secret = process.env.CANVAS_MOD_TOKEN;
    const sessionToken = readSession(req).token;
    if (!secret || !sessionToken || !modTokenOk(req)) return null;
    const expires = Math.floor(Date.now() / 1000) + MOD_STREAM_AGE_SECONDS;
    return `${expires}.${streamSignature(sessionToken, expires, secret).toString("hex")}`;
}

export function modStreamOk(req: NextRequest): boolean {
    const secret = process.env.CANVAS_MOD_TOKEN;
    const sessionToken = readSession(req).token;
    const cookie = req.cookies.get(MOD_STREAM_COOKIE)?.value;
    if (!secret || !sessionToken || !cookie) return false;
    const match = /^(\d{10})\.([0-9a-f]{64})$/.exec(cookie);
    if (!match) return false;
    const expires = Number(match[1]);
    if (expires <= Math.floor(Date.now() / 1000) || expires > Math.floor(Date.now() / 1000) + MOD_STREAM_AGE_SECONDS) return false;
    return timingSafeEqual(
        Buffer.from(match[2], "hex"),
        streamSignature(sessionToken, expires, secret),
    );
}
