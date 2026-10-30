import { lookup } from "node:dns/promises"
import { get, type RequestOptions } from "node:https"
import { BlockList, isIP } from "node:net"

const blockedIpv4 = new BlockList()
for (const [address, prefix] of [
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
    ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
    ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24],
    ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
    ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blockedIpv4.addSubnet(address, prefix, "ipv4")

const publicIpv6 = new BlockList()
publicIpv6.addSubnet("2000::", 3, "ipv6")
const blockedIpv6 = new BlockList()
for (const [address, prefix] of [
    ["2001::", 32], ["2001:10::", 28], ["2001:db8::", 32],
    ["2002::", 16], ["3fff::", 20],
] as const) blockedIpv6.addSubnet(address, prefix, "ipv6")

export function isPublicAddress(address: string): boolean {
    const family = isIP(address)
    if (family === 4) return !blockedIpv4.check(address, "ipv4")
    if (family === 6) {
        return publicIpv6.check(address, "ipv6") && !blockedIpv6.check(address, "ipv6")
    }
    return false
}

export function isSafeOgUrl(url: URL): boolean {
    const hostname = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname
    return url.protocol === "https:" && !url.username && !url.password &&
        (!url.port || url.port === "443") && !!url.hostname &&
        hostname.toLowerCase() !== "localhost" &&
        (!isIP(hostname) || isPublicAddress(hostname))
}

type ResolvedAddress = { address: string; family: number }

export async function resolvePublicAddresses(
    hostname: string,
    resolver: (hostname: string) => Promise<ResolvedAddress[]> =
        (host) => lookup(host, { all: true })
): Promise<ResolvedAddress[]> {
    const addresses = await resolver(hostname)
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
        throw new Error("Unsafe OG address")
    }
    return addresses
}

export function resolveOgRedirect(current: URL, location: string): URL {
    const next = new URL(location, current)
    if (!isSafeOgUrl(next)) throw new Error("Unsafe OG redirect")
    return next
}

export function createPublicLookup(
    resolver: (hostname: string) => Promise<ResolvedAddress[]> =
        (host) => lookup(host, { all: true })
): NonNullable<RequestOptions["lookup"]> {
    return (hostname, lookupOptions, callback) => {
        // Return exactly the vetted addresses Node will connect to, including
        // all public A/AAAA answers when Node requests family fallback.
        resolvePublicAddresses(hostname, resolver).then((addresses) => {
            if (lookupOptions.all) callback(null, addresses)
            else callback(null, addresses[0].address, addresses[0].family)
        }, (error) => callback(error, "", 4))
    }
}

async function requestHop(url: URL, signal: AbortSignal): Promise<{ redirect?: string; html?: string }> {
    if (!isSafeOgUrl(url)) throw new Error("Unsafe OG URL")

    return new Promise((resolve, reject) => {
        const options: RequestOptions = {
            agent: false,
            signal,
            headers: { "User-Agent": "Mozilla/5.0 (compatible; bot)" },
            lookup: createPublicLookup(),
        }

        const req = get(url, options, (res) => {
            const location = res.headers.location
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && location) {
                res.destroy()
                resolve({ redirect: location })
                return
            }
            if (!(res.headers["content-type"] ?? "").startsWith("text/html")) {
                res.destroy()
                resolve({})
                return
            }

            const chunks: Buffer[] = []
            let total = 0
            res.on("data", (chunk: Buffer) => {
                const remaining = 50 * 1024 - total
                if (remaining > 0) {
                    chunks.push(chunk.subarray(0, remaining))
                    total += Math.min(chunk.length, remaining)
                }
                if (total >= 50 * 1024) {
                    res.destroy()
                    resolve({ html: Buffer.concat(chunks).toString("utf8") })
                }
            })
            res.on("end", () => resolve({ html: Buffer.concat(chunks).toString("utf8") }))
            res.on("error", reject)
        })
        req.on("error", reject)
    })
}

export async function fetchPublicOgHtml(rawUrl: string): Promise<string | undefined> {
    let url = new URL(rawUrl)
    const signal = AbortSignal.timeout(5000)
    for (let redirects = 0; redirects <= 5; redirects++) {
        const result = await requestHop(url, signal)
        if (result.redirect === undefined) return result.html
        url = resolveOgRedirect(url, result.redirect)
    }
    return undefined
}
