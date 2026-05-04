// Moderation tool gate. Requires CANVAS_MOD_TOKEN via header or query param.

import type { NextRequest } from "next/server";

export function modTokenOk(req: NextRequest): boolean {
    const expected = process.env.CANVAS_MOD_TOKEN;
    if (!expected) return false; // disabled when unset
    const header = req.headers.get("x-mod-token")?.replaceAll(`"`, '');
    const query = new URL(req.url).searchParams.get("token")?.replaceAll(`"`, '');
    return header === expected || query === expected;
}
