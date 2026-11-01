import {it} from 'node:test'
import assert from 'node:assert/strict'
import {NextRequest} from 'next/server'
import {DELETE, GET} from './route'
import {GET as download} from './csv/route'
import {createRankingService, memoryRankingStorage} from '@/lib/server/maimai-store'
import {readCsv} from '@/lib/server/maimai-csv-test-utils'

it('authorizes score deletion, hides players in JSON, and marks their preserved CSV rows', async () => {
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
        const rows = readCsv(csv).filter((row) => row['Record type'] === 'Score')
        assert.equal(rows.length, 2)
        assert.equal(rows[0].Player, 'Deleted player')
        assert.equal(rows[0].Removed, 'true')
        assert.equal(rows[0]['Score (%)'], '300.0000')
        assert.equal(rows[0]['Score (raw)'], '3000000')
        assert.equal(rows[1].Player, 'Remaining player')
        assert.equal(rows[1].Removed, 'false')
        assert.equal(rows[1]['Source rank'], '2')
        assert.equal(rows[1]['Site rank (snapshot)'], '1')
        // A complete audit export can contain removals even without score archives.
        globalStore.__maimaiRankings = createRankingService({storage: memoryRankingStorage(),
            fetchSource: async () => {throw new Error('Download must not collect')}})
        const downloadUrl = url.replace('kop8th?', 'kop8th/csv?')
        assert.equal((await download(new Request(downloadUrl))).status, 404)
        assert.equal((await DELETE(request(body))).status, 200)
        const removalOnly = await download(new Request(downloadUrl))
        assert.equal(removalOnly.status, 200)
        assert.deepEqual(readCsv(await removalOnly.text()).map((row) => row['Record type']), ['Moderator removal'])
    } finally {
        globalStore.__maimaiRankings = previousService
        for (const [key, value] of Object.entries(previousEnv)) {
            if (value === undefined) delete env[key]
            else env[key] = value
        }
    }
})
