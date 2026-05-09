import { NextRequest, NextResponse } from "next/server"

// ─── SSRF blocklist ───────────────────────────────────────────────────────────

const BLOCKED_HOSTNAME_RE =
    /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|::1)$/i

function isRFC1918(hostname: string): boolean {
    if (BLOCKED_HOSTNAME_RE.test(hostname)) return true
    // 172.16.0.0/12 → 172.16.x.x – 172.31.x.x
    const m = hostname.match(/^172\.(\d+)\.\d+\.\d+$/)
    if (m) {
        const second = parseInt(m[1], 10)
        if (second >= 16 && second <= 31) return true
    }
    // 169.254.x.x link-local
    if (/^169\.254\./.test(hostname)) return true
    return false
}

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

    // Only allow https
    if (!rawUrl.startsWith("https://")) {
        return NextResponse.json({ url: rawUrl })
    }

    let parsed: URL
    try {
        parsed = new URL(rawUrl)
    } catch {
        return NextResponse.json({ url: rawUrl })
    }

    // SSRF guard
    if (isRFC1918(parsed.hostname)) {
        return NextResponse.json({ url: rawUrl })
    }

    try {
        const res = await fetch(rawUrl, {
            signal: AbortSignal.timeout(5000),
            headers: { "User-Agent": "Mozilla/5.0 (compatible; bot)" },
        })

        const contentType = res.headers.get("content-type") ?? ""
        if (!contentType.startsWith("text/html")) {
            return NextResponse.json({ url: rawUrl })
        }

        // Read up to 50 KB
        const reader = res.body?.getReader()
        if (!reader) return NextResponse.json({ url: rawUrl })

        const chunks: Uint8Array[] = []
        let totalBytes = 0
        const MAX_BYTES = 50 * 1024

        while (true) {
            const { done, value } = await reader.read()
            if (done || !value) break
            chunks.push(value)
            totalBytes += value.byteLength
            if (totalBytes >= MAX_BYTES) {
                reader.cancel()
                break
            }
        }

        const html = new TextDecoder().decode(
            chunks.reduce((acc, chunk) => {
                const merged = new Uint8Array(acc.length + chunk.length)
                merged.set(acc)
                merged.set(chunk, acc.length)
                return merged
            }, new Uint8Array(0))
        )

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
