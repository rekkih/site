import { it } from 'node:test'
import assert from 'node:assert/strict'
import { rankingsCsv } from './maimai-csv'
import {
    archivePrefix,
    createRankingService,
    getRankingService,
    memoryRankingStorage,
} from './maimai-store'
import { parseJstTimestamp, type RankingSnapshot } from '../shared/maimai'

const sourceUpdate = '2026/10/30 02:00:00 (JST)'
const updatedAt = parseJstTimestamp(sourceUpdate)

it('replaces a service retained by HMR when it lacks the download method', () => {
    const state = globalThis as typeof globalThis & {
        __maimaiRankings?: ReturnType<typeof createRankingService>
    }
    const previousService = state.__maimaiRankings
    const environment: Record<string, string | undefined> = process.env
    const previousEnvironment = environment.NODE_ENV

    try {
        environment.NODE_ENV = 'development'
        state.__maimaiRankings = { get: async () => {} } as unknown as ReturnType<
            typeof createRankingService
        >

        assert.equal(typeof getRankingService().getExport, 'function')
    } finally {
        state.__maimaiRankings = previousService
        if (previousEnvironment === undefined) {
            delete environment.NODE_ENV
        } else {
            environment.NODE_ENV = previousEnvironment
        }
    }
})

function snapshot(name: string): RankingSnapshot {
    return {
        sourceUpdate,
        updatedAt,
        collectedAt: updatedAt,
        ranking: [
            {
                rank: 1,
                userName: name,
                score: 3029466,
                subScore: 9367,
                recordDate: '2026/10/29 20:22:23',
            },
        ],
    }
}

it('exports all snapshots and versions with Unicode, CSV escaping and spreadsheet-safe names', () => {
    const csv = rankingsCsv([
        { server: 'international', snapshots: [snapshot('名前,"quoted"\nnext'), snapshot('=1+1')], removedPlayers: ['=1+1'] },
        { server: 'japan', snapshots: [snapshot('日本')], removedPlayers: [] },
    ])

    assert.ok(csv.startsWith('\uFEFF"server"'))
    assert.ok(csv.includes('"sub_score"'))
    assert.ok(csv.includes('"3029466","9367"'))
    assert.ok(csv.includes('"名前,""quoted""\nnext"'))
    assert.ok(csv.includes('"\'=1+1"'))
    assert.ok(csv.includes('"japan"'))
    assert.ok(csv.includes('"日本"'))
    assert.ok(csv.includes('"2026-10-29T17:00:00.000Z"'))
    assert.equal(csv.match(/"international"/g)?.length, 2)
    assert.ok(csv.endsWith('\r\n'))
})

it('reads saved snapshots without upstream fetches or storage writes', async () => {
    const storage = memoryRankingStorage()
    await storage.put(`${archivePrefix('international')}${updatedAt}`, {
        collectedAt: updatedAt,
        payload: {
            update: sourceUpdate,
            ranking: [
                {
                    rank: '1',
                    userName: '名前',
                    score: '3029466',
                    subScore: '9367',
                    recordDate: '2026/10/29 20:22:23',
                },
            ],
        },
    })

    const service = createRankingService({
        storage: {
            ...storage,
            put: async () => {
                throw new Error('Download must not write')
            },
        },
        fetchSource: async () => {
            throw new Error('Download must not fetch upstream')
        },
    })

    const saved = await service.getExport('international')
    assert.equal(saved.snapshots[0].ranking[0].userName, '名前')
    assert.equal(saved.snapshots[0].ranking[0].subScore, 9367)
    assert.ok(rankingsCsv([saved]).includes('"3029466","9367"'))
    assert.deepEqual((await service.getExport('japan')).snapshots, [])
})

it('exports all removed scores with version-scoped flags while keeping the leaderboard filtered', async () => {
    const storage = memoryRankingStorage()
    for (const server of ['international', 'japan'] as const) {
        for (const day of [29, 30]) {
            const update = `2026/10/${day} 02:00:00`
            await storage.put(`${archivePrefix(server)}${parseJstTimestamp(update)}`, {
                collectedAt: parseJstTimestamp(update),
                payload: {update, ranking: [
                    {userName: 'Removed', rank: '1', score: '3029466', subScore: '9367', recordDate: update},
                    {userName: 'Remaining', rank: '2', score: '3000000', subScore: '9000', recordDate: update},
                    ...(day === 29 ? [{userName: 'Dropped out', rank: '3', score: '2990000', subScore: '8000', recordDate: update}] : []),
                ]},
            })
        }
    }
    const keys = await storage.list(archivePrefix('international'))
    const originals = await Promise.all(keys.map((key) => storage.get(key)))
    const service = createRankingService({storage})
    await service.getExport('international') // Warm the archive cache before deletion.
    await service.deletePlayer('international', 'Removed')
    const restarted = createRankingService({storage: {
        ...storage,
        put: async () => {throw new Error('Export must not write')},
    }, fetchSource: async () => {throw new Error('Export must not collect')}})

    for (const reader of [service, restarted]) {
        const international = await reader.getExport('international')
        const japan = await reader.getExport('japan')
        const csv = rankingsCsv([international, japan])
        const rows = csv.split('\r\n').filter(Boolean).slice(1)
        assert.equal(rows.length, 10)
        const removed = rows.filter((row) => row.startsWith('"international"') && row.includes('"Removed"'))
        assert.equal(removed.length, 2)
        assert.ok(removed.every((row) => row.includes('"1","Removed","3029466","9367"') && row.endsWith(',"true"')))
        assert.ok(rows.filter((row) => !removed.includes(row)).every((row) => row.endsWith(',"false"')))
        assert.deepEqual(international.snapshots.map((entry) => entry.ranking[1].rank), [2, 2])
        const visible = await reader.getCached('international')
        assert.ok(visible.every((entry) => entry.ranking.every((row) => row.userName !== 'Removed')))
        assert.deepEqual(visible.map((entry) => entry.ranking[0].rank), [1, 1])
    }
    assert.deepEqual(await Promise.all(keys.map((key) => storage.get(key))), originals)
})
