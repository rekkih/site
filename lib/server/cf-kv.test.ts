import { it } from 'node:test'
import assert from 'node:assert/strict'

it('strict KV operations paginate, distinguish missing keys, and surface errors', async () => {
    // Isolate the module's environment constants; no real network or KV access.
    const old = {
        account: process.env.CF_ACCOUNT_ID,
        namespace: process.env.CF_KV_NAMESPACE_ID,
        token: process.env.CF_API_TOKEN,
    }
    process.env.CF_ACCOUNT_ID = 'test-account'
    process.env.CF_KV_NAMESPACE_ID = 'test-namespace'
    process.env.CF_API_TOKEN = 'test-token'
    const originalFetch = globalThis.fetch
    try {
        // A query suffix gives this test a fresh module instance under Bun.
        const modulePath = './cf-kv.ts?strict-kv-test'
        const { kvListStrict, kvGetStrict, kvPutStrict } = await import(modulePath)
        const requested: string[] = []
        globalThis.fetch = (async (input: string | URL | Request) => {
            const url = String(input)
            requested.push(url)
            const cursor = new URL(url).searchParams.get('cursor')
            return Response.json({
                success: true,
                result: cursor ? [{ name: 'prefix:two' }] : [],
                result_info: { cursor: cursor ? '' : 'next-page' },
            })
        }) as typeof fetch
        assert.deepEqual(await kvListStrict('prefix:'), ['prefix:two'])
        assert.equal(requested.length, 2)
        assert.ok(requested[1].includes('cursor=next-page'))
        globalThis.fetch = (async () => new Response(null, { status: 404 })) as typeof fetch
        assert.equal(await kvGetStrict('missing'), null)
        globalThis.fetch = (async () => new Response(null, { status: 503 })) as typeof fetch
        await assert.rejects(kvGetStrict('unavailable'))
        await assert.rejects(kvListStrict('prefix:'))
        await assert.rejects(kvPutStrict('key', {}))
    } finally {
        globalThis.fetch = originalFetch
        for (const [key, value] of [
            ['CF_ACCOUNT_ID', old.account],
            ['CF_KV_NAMESPACE_ID', old.namespace],
            ['CF_API_TOKEN', old.token],
        ]) {
            if (value === undefined) delete process.env[key!]
            else process.env[key!] = value
        }
    }
})
