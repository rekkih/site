import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"
import { GET } from "../../app/api/og/route"
import {
    fetchPublicOgHtml,
    createPublicLookup,
    isPublicAddress,
    isSafeOgUrl,
    resolveOgRedirect,
    resolvePublicAddresses,
} from "./og-fetch"

describe("OG outbound boundary", () => {
    test("accepts ordinary public IPv4 and IPv6 addresses", () => {
        assert.equal(isPublicAddress("8.8.8.8"), true)
        assert.equal(isPublicAddress("2606:4700:4700::1111"), true)
        assert.equal(isSafeOgUrl(new URL("https://example.com/article")), true)
    })

    test("rejects nonpublic address forms", () => {
        for (const address of [
            "127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1",
            "169.254.169.254", "0.0.0.0", "100.64.0.1", "192.0.2.1",
            "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1",
            "2001:db8::1", "2002:c0a8:101::1",
        ]) assert.equal(isPublicAddress(address), false, address)
    })

    test("rejects private literal targets before opening a socket", async () => {
        assert.equal(isSafeOgUrl(new URL("https://127.0.0.1/")), false)
        assert.equal(isSafeOgUrl(new URL("https://2130706433/")), false)
        assert.equal(isSafeOgUrl(new URL("https://[::1]/")), false)
        assert.equal(isSafeOgUrl(new URL("https://[::ffff:127.0.0.1]/")), false)
        assert.equal(isSafeOgUrl(new URL("https://user:pass@example.com/")), false)
        await assert.rejects(fetchPublicOgHtml("https://127.0.0.1/"))
        const response = await GET(new NextRequest(
            "https://rek.lol/api/og?url=https%3A%2F%2F127.0.0.1%2Fsecret"
        ))
        assert.deepEqual(await response.json(), { url: "https://127.0.0.1/secret" })
    })

    test("rejects DNS answers if any address is nonpublic", async () => {
        await assert.rejects(resolvePublicAddresses("example.com", async () => [
            { address: "8.8.8.8", family: 4 },
            { address: "10.0.0.1", family: 4 },
        ]))
        await assert.rejects(resolvePublicAddresses("example.com", async () => [
            { address: "fc00::1", family: 6 },
        ]))
        await assert.rejects(resolvePublicAddresses("example.com", async () => []))
        assert.deepEqual(await resolvePublicAddresses("example.com", async () => [
            { address: "2606:4700:4700::1111", family: 6 },
            { address: "8.8.8.8", family: 4 },
        ]), [
            { address: "2606:4700:4700::1111", family: 6 },
            { address: "8.8.8.8", family: 4 },
        ])
    })

    test("pins every address handed to Node's dual-stack connector", async () => {
        const addresses = [
            { address: "2606:4700:4700::1111", family: 6 },
            { address: "8.8.8.8", family: 4 },
        ]
        const publicLookup = createPublicLookup(async () => addresses)
        const returned = await new Promise<unknown>((resolve, reject) => {
            publicLookup("example.com", { all: true }, (error, result) => {
                if (error) reject(error)
                else resolve(result)
            })
        })
        assert.deepEqual(returned, addresses)

        const privateLookup = createPublicLookup(async () => [
            { address: "8.8.8.8", family: 4 },
            { address: "127.0.0.1", family: 4 },
        ])
        await assert.rejects(new Promise((resolve, reject) => {
            privateLookup("example.com", { all: true }, (error, result) => {
                if (error) reject(error)
                else resolve(result)
            })
        }))
    })

    test("rejects private and non-HTTPS redirect hops", () => {
        const current = new URL("https://example.com/article")
        assert.throws(() => resolveOgRedirect(current, "https://127.0.0.1/secret"))
        assert.throws(() => resolveOgRedirect(current, "https://[fc00::1]/secret"))
        assert.throws(() => resolveOgRedirect(current, "http://example.com/"))
        assert.throws(() => resolveOgRedirect(current, "https://example.com:8443/"))
        assert.equal(resolveOgRedirect(current, "/next").href, "https://example.com/next")
    })
})
