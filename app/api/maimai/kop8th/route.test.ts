import {it} from 'node:test'
import assert from 'node:assert/strict'
import {NextRequest} from 'next/server'
import {DELETE, GET} from './route'
import {GET as download} from './csv/route'
import {createRankingService, memoryRankingStorage} from '@/lib/server/maimai-store'

it('authorizes score deletion by header, validates input, and filters JSON and CSV', async () => {
    const env: Record<string, string | undefined> = process.env
    const previousEnv = {NODE_ENV: env.NODE_ENV, CANVAS_MOD_TOKEN: env.CANVAS_MOD_TOKEN}
    const globalStore = globalThis as typeof globalThis & {__maimaiRankings?: ReturnType<typeof createRankingService>}
    const previousService = globalStore.__maimaiRankings
    const headers = {'x-mod-token': 'test-maimai-mod'}
    const url = 'http://localhost/api/maimai/kop8th?server=ex'
    const request = (body: string, authenticated = true, target = url) => new NextRequest(target, {
        method: 'DELETE', headers: authenticated ? headers : {}, body,
    })
    try {
        env.NODE_ENV = 'development'
        env.CANVAS_MOD_TOKEN = headers['x-mod-token']
        globalStore.__maimaiRankings = createRankingService({
            storage: memoryRankingStorage(),
            now: () => Date.parse('2026-10-31T03:00:00+09:00'),
            fetchSource: async () => ({update: '2026/10/31 02:00:00', ranking: [
                {userName: 'Deleted player', rank: '1', score: '3000000', subScore: '9000', recordDate: '2026/10/30 01:00:00'},
                {userName: 'Remaining player', rank: '2', score: '2990000', subScore: '8000', recordDate: '2026/10/30 01:00:00'},
            ]}),
        })
        const body = JSON.stringify({userName: 'Deleted player'})
        assert.equal((await DELETE(request(body, false))).status, 403)
        assert.equal((await DELETE(request(body, false, `${url}&modToken=test-maimai-mod`))).status, 403)
        assert.equal((await DELETE(new NextRequest(url, {method: 'DELETE', headers: {'x-mod-token': 'wrong'}, body}))).status, 403)
        assert.equal((await DELETE(request('{'))).status, 400)
        assert.equal((await DELETE(request('{}'))).status, 400)
        assert.equal((await DELETE(request(body, true, url.replace('ex', 'bad')))).status, 400)
        const ordinary = await (await GET(new NextRequest(url))).json()
        assert.equal(ordinary.isMod, false)
        assert.deepEqual(ordinary.removedPlayers, [])
        assert.deepEqual(ordinary.currentPlayers, ['Deleted player', 'Remaining player'])
        assert.equal(ordinary.snapshots[0].ranking.length, 2)
        assert.equal((await (await GET(new NextRequest(url, {headers}))).json()).isMod, true)
        assert.equal((await DELETE(request(body))).status, 200)
        const response = await GET(new NextRequest(url))
        assert.equal(response.headers.get('Cache-Control'), 'no-store')
        const result = await response.json()
        assert.deepEqual(result.snapshots[0].ranking.map((row: {userName: string}) => row.userName), ['Remaining player'])
        assert.deepEqual(result.removedPlayers, ['Deleted player'])
        assert.deepEqual(result.currentPlayers, ['Remaining player'])
        assert.equal(result.snapshots[0].ranking[0].rank, 1)
        assert.equal(result.snapshots[0].ranking[0].score, 2990000)
        const csv = await (await download(new Request(`${url.replace('kop8th?', 'kop8th/csv?')}`))).text()
        assert.ok(!csv.includes('Deleted player'))
        assert.ok(csv.includes('Remaining player'))
        assert.ok(csv.includes('"1","Remaining player","2990000","8000"'))
    } finally {
        globalStore.__maimaiRankings = previousService
        for (const [key, value] of Object.entries(previousEnv)) {
            if (value === undefined) delete env[key]
            else env[key] = value
        }
    }
})
