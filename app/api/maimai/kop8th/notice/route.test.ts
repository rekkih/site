import {it} from 'node:test'
import assert from 'node:assert/strict'
import {NextRequest} from 'next/server'
import {GET, PUT} from './route'
import {createNoticeStore} from '@/lib/server/maimai-notice'
import {NOTICE_MAX_LENGTH, type MaimaiNotice} from '@/lib/shared/maimai-notice'

it('publishes, edits and clears a shared notice; requires a moderator header and validates input', async () => {
    const env: Record<string, string | undefined> = process.env
    const previousEnv = {NODE_ENV: env.NODE_ENV, CANVAS_MOD_TOKEN: env.CANVAS_MOD_TOKEN}
    const globalStore = globalThis as typeof globalThis & {__maimaiNoticeStore?: ReturnType<typeof createNoticeStore>}
    const previousStore = globalStore.__maimaiNoticeStore
    const values = new Map<string, MaimaiNotice | null>()
    const storage = {
        get: async (key: string) => values.get(key) ?? null,
        put: async (key: string, value: MaimaiNotice | null) => {values.set(key, value)},
    }
    const url = 'http://localhost/api/maimai/kop8th/notice'
    const headers = {'x-mod-token': 'test-notice-mod'}
    const put = (body: unknown, token: string | null = headers['x-mod-token'], target = url) => PUT(new NextRequest(target, {
        method: 'PUT', headers: token ? {'x-mod-token': token} : {}, body: JSON.stringify(body),
    }))
    const read = () => GET(new NextRequest(url))
    try {
        env.NODE_ENV = 'development'
        env.CANVAS_MOD_TOKEN = headers['x-mod-token']
        globalStore.__maimaiNoticeStore = createNoticeStore(storage)
        assert.deepEqual(await (await read()).json(), {notice: null, isMod: false})
        assert.equal((await put({message: 'No access'}, null)).status, 403)
        assert.equal((await put({message: 'No access'}, 'wrong')).status, 403)
        assert.equal((await put({message: 'No access'}, null, `${url}?modToken=test-notice-mod`)).status, 403)
        for (const message of [null, 42, {}, 'x'.repeat(NOTICE_MAX_LENGTH + 1)])
            assert.equal((await put({message})).status, 400)
        assert.equal((await PUT(new NextRequest(url, {method: 'PUT', headers, body: '{'}))).status, 400)
        const message = 'Please check the official rankings.\nThanks for your patience!'
        const published = await put({message: `  ${message}  `})
        assert.equal(published.status, 200)
        const {notice} = await published.json()
        assert.equal(notice.message, message)
        assert.ok(Number.isFinite(notice.updatedAt))
        // Recreating the service must still read the persisted value.
        globalStore.__maimaiNoticeStore = createNoticeStore(storage)
        const publicResponse = await read()
        assert.equal(publicResponse.headers.get('Cache-Control'), 'no-store')
        assert.deepEqual((await publicResponse.json()).notice, notice)
        assert.equal((await (await GET(new NextRequest(url, {headers}))).json()).isMod, true)
        assert.equal((await put({message: 'Updated notice'})).status, 200)
        assert.equal((await (await read()).json()).notice.message, 'Updated notice')
        // Plain text is preserved, never interpreted as HTML by the client.
        assert.equal((await put({message: '<script>alert(1)</script>'})).status, 200)
        assert.equal((await (await read()).json()).notice.message, '<script>alert(1)</script>')
        assert.equal((await put({message: '  \n '})).status, 200)
        assert.equal((await (await read()).json()).notice, null)
        globalStore.__maimaiNoticeStore = createNoticeStore({
            get: async () => {throw new Error('offline')},
            put: async () => {throw new Error('offline')},
        })
        assert.equal((await read()).status, 503)
        assert.equal((await put({message: 'Cannot persist'})).status, 503)
    } finally {
        globalStore.__maimaiNoticeStore = previousStore
        for (const [key, value] of Object.entries(previousEnv)) {
            if (value === undefined) delete env[key]
            else env[key] = value
        }
    }
})
