import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
    archivePrefix,
    createRankingService,
    memoryRankingStorage,
    type RankingStorage,
} from './maimai-store'
import {
    dailyCutoff,
    DAY_MS,
    filterSnapshots,
    isInvitationPlace,
    isLcqPlace,
    serverFromQuery,
    parseJstTimestamp,
    parseRanking,
    playerSeries,
    RETRY_MS,
    searchableName,
    topTen,
    type RankingSnapshot,
} from '../shared/maimai'

const timestamp = (hour: number, day = 30) =>
    `2026/10/${day} ${String(hour).padStart(2, '0')}:00:00`
const time = (hour: number, day = 30) => parseJstTimestamp(timestamp(hour, day))

it('marks invitation places using the server cutoff, excluding unranked players', () => {
    assert.equal(isInvitationPlace('international', 1), true)
    assert.equal(isInvitationPlace('international', 2), true)
    assert.equal(isInvitationPlace('international', 3), false)
    assert.equal(isInvitationPlace('japan', 7), true)
    assert.equal(isInvitationPlace('japan', 8), false)
    assert.equal(isInvitationPlace('japan', null), false)
    assert.equal(isInvitationPlace('international', 0), false)
})
const row = (name = 'Ａ', rank = '1', score = '3029466') => ({
    userName: name,
    rank,
    score,
    subScore: '9367',
    recordDate: timestamp(1),
})
const feed = (hour = 2, day = 30) => ({ update: timestamp(hour, day), ranking: [row()] })
const snapshot = (day: number, ranking = [row()]): RankingSnapshot => ({
    ...parseRanking({ update: timestamp(2, day), ranking }),
    collectedAt: time(3, day),
})

function setup(hour = 3) {
    let clock = time(hour)
    let payload: unknown = feed()
    let calls = 0
    const storage = memoryRankingStorage()
    const writes: string[] = []
    const service = createRankingService({
        storage: {
            ...storage,
            put: async (key, value) => {
                writes.push(key)
                await storage.put(key, value)
            },
        },
        now: () => clock,
        fetchSource: async () => {
            calls++
            if (payload instanceof Error) throw payload
            return structuredClone(payload)
        },
    })
    return {
        storage,
        service,
        writes,
        advance: (ms: number) => {
            clock += ms
        },
        payload: (value: unknown) => {
            payload = value
        },
        calls: () => calls,
    }
}

describe('JST dates and server cutoffs', () => {
    it('accepts both source timestamp formats and rejects impossible dates', () => {
        assert.equal(parseJstTimestamp(`${timestamp(2)} (JST)`), time(2))
        assert.equal(new Date(time(7)).toISOString(), '2026-10-29T22:00:00.000Z')
        for (const value of [
            '2026/02/30 02:00:00',
            '2026/10/30 24:00:00',
            '2026-10-30',
            '2026/10/30 02:00:00 (UTC)',
        ])
            assert.throws(() => parseJstTimestamp(value))
    })
    it('uses independent cutoffs immediately before, at, and after each boundary', () => {
        for (const [server, hour] of [
            ['international', 2],
            ['japan', 7],
        ] as const) {
            assert.equal(dailyCutoff(server, time(hour) - 1), time(hour) - DAY_MS)
            assert.equal(dailyCutoff(server, time(hour)), time(hour))
            assert.equal(dailyCutoff(server, time(hour) + 1), time(hour))
        }
        assert.equal(dailyCutoff('japan', time(3)), time(7, 29))
    })
})

describe('collection and archival', () => {
    it('archives the complete payload and does not rewrite the same update', async () => {
        const f = setup()
        f.payload({ ...feed(), extra: { untouched: true } })
        const first = await f.service.get('international')
        assert.equal(first.snapshots.length, 1)
        assert.equal(first.status, 'current')
        assert.equal(first.nextCheckAt, time(2) + DAY_MS)
        const key = `${archivePrefix('international')}${time(2)}`
        assert.deepEqual(((await f.storage.get(key)) as { payload: unknown }).payload, {
            ...feed(),
            extra: { untouched: true },
        })
        f.advance(DAY_MS)
        f.payload({ ...feed(), ranking: [row('changed')] })
        const second = await f.service.get('international')
        assert.equal(second.snapshots[0].ranking[0].userName, 'Ａ')
        assert.equal(f.writes.filter((value) => value === key).length, 1)
        assert.equal(second.status, 'waiting')
    })
    it('uses cached data until the next cutoff', async () => {
        const f = setup()
        await f.service.get('international')
        f.advance(22 * 60 * 60_000)
        await f.service.get('international')
        assert.equal(f.calls(), 1)
        f.advance(60 * 60_000)
        await f.service.get('international')
        assert.equal(f.calls(), 2)
    })
    it('retries delayed updates after 30 minutes and saves the new version', async () => {
        const f = setup()
        f.payload(feed(2, 29))
        assert.equal((await f.service.get('international')).status, 'waiting')
        f.advance(RETRY_MS - 1)
        await f.service.get('international')
        assert.equal(f.calls(), 1)
        f.advance(1)
        f.payload(feed())
        const data = await f.service.get('international')
        assert.equal(f.calls(), 2)
        assert.equal(data.snapshots.length, 2)
        assert.equal(data.status, 'current')
    })
    it('isolates identical names and timestamps between versions and coalesces requests', async () => {
        const f = setup(8)
        f.payload(feed(7))
        const [a, b] = await Promise.all([
            f.service.get('international'),
            f.service.get('international'),
        ])
        assert.deepEqual(a, b)
        assert.equal(f.calls(), 1)
        f.payload({ ...feed(7), ranking: [row('Ａ', '8')] })
        const japan = await f.service.get('japan')
        assert.equal(f.calls(), 2)
        assert.equal(a.snapshots[0].ranking[0].rank, 1)
        assert.equal(japan.snapshots[0].ranking[0].rank, 8)
        assert.equal((await f.storage.list(archivePrefix('international'))).length, 1)
        assert.equal((await f.storage.list(archivePrefix('japan'))).length, 1)
        assert.equal(a.nextCheckAt, time(2) + DAY_MS)
        assert.equal(japan.nextCheckAt, time(7) + DAY_MS)
    })
    it('preserves history on invalid input and applies failure backoff', async () => {
        const f = setup()
        await f.service.get('international')
        f.advance(DAY_MS)
        f.payload({ update: timestamp(2), ranking: [row('Ａ', 'NaN')] })
        const failure = await f.service.get('international')
        assert.equal(failure.status, 'error')
        assert.equal(failure.snapshots.length, 1)
        f.advance(RETRY_MS - 1)
        await f.service.get('international')
        assert.equal(f.calls(), 2)
        f.advance(1)
        await f.service.get('international')
        assert.equal(f.calls(), 3)
    })
    it('backs off failed first collections rather than retrying on every visit', async () => {
        const f = setup()
        f.payload(new Error('Network timeout'))
        assert.equal((await f.service.get('japan')).snapshots.length, 0)
        f.advance(5 * 60_000)
        await f.service.get('japan')
        assert.equal(f.calls(), 1)
    })
    it('reuses persisted history and check state after a process restart', async () => {
        const f = setup()
        await f.service.get('international')
        const next = createRankingService({
            storage: f.storage,
            now: () => time(4),
            fetchSource: async () => {
                throw new Error('Must not fetch')
            },
        })
        const result = await next.get('international')
        assert.equal(result.status, 'current')
        assert.equal(result.snapshots.length, 1)
    })
    it('does not claim success or keep an unsaved snapshot when storage writes fail', async () => {
        const storage = memoryRankingStorage()
        const service = createRankingService({
            storage: {
                ...storage,
                put: async () => {
                    throw new Error('KV down')
                },
            },
            now: () => time(3),
            fetchSource: async () => feed(),
        })
        const result = await service.get('international')
        assert.equal(result.status, 'error')
        assert.equal(result.snapshots.length, 0)
    })
    it('distinguishes storage outages from missing history and never fetches over unreadable history', async () => {
        let fetched = false
        const storage: RankingStorage = {
            list: async () => {
                throw new Error('KV down')
            },
            get: async () => null,
            put: async () => {},
        }
        const service = createRankingService({
            storage,
            now: () => time(3),
            fetchSource: async () => {
                fetched = true
                return feed()
            },
        })
        assert.equal((await service.get('international')).status, 'error')
        assert.equal(fetched, false)
    })
    it('retains cached history if KV becomes unavailable', async () => {
        const storage = memoryRankingStorage()
        let fail = false
        let clock = time(3)
        const service = createRankingService({
            storage: {
                ...storage,
                list: async (prefix) => {
                    if (fail) throw new Error('KV down')
                    return storage.list(prefix)
                },
            },
            now: () => clock,
            fetchSource: async () => feed(),
        })
        await service.get('international')
        fail = true
        clock += DAY_MS
        const result = await service.get('international')
        assert.equal(result.status, 'error')
        assert.equal(result.snapshots.length, 1)
    })
    it('bounds archive read concurrency and returns chronological history', async () => {
        const storage = memoryRankingStorage()
        for (let day = 10; day < 30; day++)
            await storage.put(`${archivePrefix('international')}${time(2, day)}`, {
                collectedAt: time(3, day),
                payload: feed(2, day),
            })
        let reads = 0,
            maxReads = 0
        const service = createRankingService({
            storage: {
                ...storage,
                get: async (key) => {
                    reads++
                    maxReads = Math.max(reads, maxReads)
                    await new Promise((resolve) => setTimeout(resolve, 1))
                    const value = await storage.get(key)
                    reads--
                    return value
                },
            },
            now: () => time(3),
            fetchSource: async () => feed(),
        })
        const result = await service.get('international')
        assert.equal(result.snapshots.length, 21)
        assert.ok(maxReads <= 6)
        assert.equal(result.snapshots[0].updatedAt, time(2, 10))
    })
})

describe('chart data', () => {
    it('selects the top ten unique names without merging ambiguous duplicates', () => {
        const data = snapshot(30, [
            row('duplicate'),
            row('duplicate', '2'),
            ...Array.from({ length: 12 }, (_, index) => row(`Player ${index}`, String(index + 3))),
        ])
        assert.deepEqual(topTen(data), [
            'Player 0',
            'Player 1',
            'Player 2',
            'Player 3',
            'Player 4',
            'Player 5',
            'Player 6',
            'Player 7',
            'Player 8',
            'Player 9',
        ])
    })
    it('breaks lines for missing and duplicate names for both metrics', () => {
        const history = [
            snapshot(27),
            snapshot(28, []),
            snapshot(29, [row(), row()]),
            snapshot(30, [row('Ａ', '5', '123')]),
        ]
        assert.deepEqual(playerSeries(history, 'Ａ', 'rank'), [1, null, null, 5])
        assert.deepEqual(playerSeries(history, 'Ａ', 'score'), [3029466, null, null, 123])
        assert.deepEqual(playerSeries(history, 'A', 'rank'), [null, null, null, null])
        assert.equal(searchableName('Ａ'), searchableName('a'))
    })
    it('filters ranges relative to the latest collected source date, including one-point histories', () => {
        const history = [snapshot(10), snapshot(23), snapshot(30)]
        assert.equal(filterSnapshots(history, 7).length, 2)
        assert.equal(filterSnapshots(history, null).length, 3)
        assert.equal(filterSnapshots([history[2]], 7).length, 1)
    })
})

it('marks Japan LCQ places from eighth through fifteenth only', () => {
    assert.equal(isLcqPlace('japan', 7), false)
    assert.equal(isLcqPlace('japan', 8), true)
    assert.equal(isLcqPlace('japan', 15), true)
    assert.equal(isLcqPlace('japan', 16), false)
    assert.equal(isLcqPlace('japan', null), false)
    assert.equal(isLcqPlace('international', 8), false)
    assert.equal(isLcqPlace('international', 15), false)
})

it('maps short public server parameters without changing storage identities', () => {
    assert.equal(serverFromQuery(null), 'international')
    assert.equal(serverFromQuery('ex'), 'international')
    assert.equal(serverFromQuery('m'), 'japan')
    assert.equal(serverFromQuery('invalid'), null)
    assert.equal(serverFromQuery(''), null)
})

it('does not let a slow archive read discard a snapshot saved by concurrent collection', async () => {
    const storage = memoryRankingStorage()
    const oldKey = `${archivePrefix('international')}${time(2, 29)}`
    await storage.put(oldKey, { collectedAt: time(3, 29), payload: feed(2, 29) })

    let releaseRead!: () => void
    let markReadStarted!: () => void
    let reads = 0
    const delayedRead = new Promise<void>((resolve) => {
        releaseRead = resolve
    })
    const readStarted = new Promise<void>((resolve) => {
        markReadStarted = resolve
    })
    const service = createRankingService({
        storage: {
            ...storage,
            get: async (key) => {
                if (key === oldKey && reads++ === 0) {
                    markReadStarted()
                    await delayedRead
                }
                return storage.get(key)
            },
        },
        now: () => time(3),
        fetchSource: async () => feed(),
    })

    const download = service.getCached('international')
    await readStarted
    const collected = await service.get('international')
    assert.equal(collected.snapshots.length, 2)
    releaseRead()

    assert.equal((await download).length, 2)
    assert.equal((await service.getCached('international')).length, 2)
})
