import type { NextRequest } from "next/server";

export const USER_COOKIE = "cv_uid";
export const TOKEN_COOKIE = "cv_tok";

export function readSession(req: NextRequest): { userId: string | null; token: string | null } {
    return {
        userId: req.cookies.get(USER_COOKIE)?.value ?? null,
        token: req.cookies.get(TOKEN_COOKIE)?.value ?? null,
    };
}

export function newId(): string {
    return crypto.randomUUID();
}

export function clientIp(req: NextRequest): string {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
    return req.headers.get("x-real-ip") ?? "0.0.0.0";
}
