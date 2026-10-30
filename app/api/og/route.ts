import { NextRequest, NextResponse } from "next/server"
import { fetchPublicOgHtml, isSafeOgUrl } from "@/lib/server/og-fetch"

export const runtime = "nodejs"

// ─── HTML entity decoder ──────────────────────────────────────────────────────

function decodeEntities(s: string): string {
    return s
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
}

// ─── Meta tag parser ──────────────────────────────────────────────────────────

/**
 * Extract the `content` attribute from a meta tag that contains a given
 * property / name / itemprop value.  Handles both attribute orderings.
 */
function extractMeta(html: string, key: string): string | undefined {
    // Match <meta ... property="key" ... content="value" ...> (or name= / itemprop=)
    // Either attribute can come first.
    const keyEscaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const patterns = [
        // property/name/itemprop comes before content
        new RegExp(
            `<meta[^>]+(?:property|name|itemprop)=["']${keyEscaped}["'][^>]+content=["']([^"']+)["']`,
            "i"
        ),
        // content comes before property/name/itemprop
        new RegExp(
            `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${keyEscaped}["']`,
            "i"
        ),
    ]
    for (const re of patterns) {
        const m = html.match(re)
        if (m?.[1]) return decodeEntities(m[1].trim())
    }
    return undefined
}

function extractTitle(html: string): string | undefined {
    const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    return m?.[1] ? decodeEntities(m[1].trim()) : undefined
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
    const rawUrl = req.nextUrl.searchParams.get("url")

    if (!rawUrl) {
        return NextResponse.json({ error: "Missing url param" }, { status: 400 })
    }

    let parsed: URL
    try {
        parsed = new URL(rawUrl)
    } catch {
        return NextResponse.json({ url: rawUrl })
    }

    if (!isSafeOgUrl(parsed)) {
        return NextResponse.json({ url: rawUrl })
    }

    try {
        const html = await fetchPublicOgHtml(rawUrl)
        if (html === undefined) return NextResponse.json({ url: rawUrl })

        const title =
            extractMeta(html, "og:title") ??
            extractMeta(html, "twitter:title") ??
            extractTitle(html)

        const description =
            extractMeta(html, "og:description") ??
            extractMeta(html, "twitter:description") ??
            extractMeta(html, "description")

        const image =
            extractMeta(html, "og:image") ??
            extractMeta(html, "twitter:image")

        const siteName = extractMeta(html, "og:site_name")

        return NextResponse.json({ title, description, image, siteName, url: rawUrl })
    } catch {
        return NextResponse.json({ url: rawUrl })
    }
}
