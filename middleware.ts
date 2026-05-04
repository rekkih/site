import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
    // No global gating - per-entry adult content is handled inline
    return NextResponse.next();
}

export const config = {
    matcher: [],
};
