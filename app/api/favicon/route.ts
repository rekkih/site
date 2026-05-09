import { NextRequest, NextResponse } from "next/server"
import { LINK_HOSTNAMES } from "@/lib/shared/link-whitelist"

// 1×1 neutral-500 (#737373) PNG fallback
const TRANSPARENT_PNG_B64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mMoLi4GAAK2AVraqyzIAAAAAElFTkSuQmCC"

function isDomainAllowed(domain: string): boolean {
    return LINK_HOSTNAMES.some(
        (allowed) => domain === allowed || domain.endsWith(`.${allowed}`)
    )
}

function transparentPng(): NextResponse {
    const bytes = Buffer.from(TRANSPARENT_PNG_B64, "base64")
    return new NextResponse(bytes, {
        status: 200,
        headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=86400",
        },
    })
}

export async function GET(req: NextRequest) {
    const domain = req.nextUrl.searchParams.get("domain")

    if (!domain) {
        return NextResponse.json({ error: "Missing domain param" }, { status: 400 })
    }

    if (!isDomainAllowed(domain)) {
        return transparentPng()
    }

    try {
        const res = await fetch(`https://icons.duckduckgo.com/ip3/${domain}.ico`, {
            signal: AbortSignal.timeout(4000),
        })

        if (!res.ok || !res.body) {
            return transparentPng()
        }

        const contentType = res.headers.get("content-type") ?? "image/x-icon"

        return new NextResponse(res.body, {
            status: 200,
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=86400",
            },
        })
    } catch {
        return transparentPng()
    }
}
