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

        assert.equal(typeof getRankingService().getCached, 'function')
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
        { server: 'international', snapshots: [snapshot('名前,"quoted"\nnext'), snapshot('=1+1')] },
        { server: 'japan', snapshots: [snapshot('日本')] },
    ])

    assert.ok(csv.startsWith('\uFEFF"server"'))
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

    assert.equal((await service.getCached('international'))[0].ranking[0].userName, '名前')
    assert.deepEqual(await service.getCached('japan'), [])
})
