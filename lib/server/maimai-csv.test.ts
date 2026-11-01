import {it} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {rankingsCsv} from './maimai-csv'
import {readCsv} from './maimai-csv-test-utils'
import {archivePrefix, createRankingService, getRankingService, memoryRankingStorage} from './maimai-store'
import {parseJstTimestamp, type MaimaiServer} from '../shared/maimai'

const sourceUpdate = '2026/10/30 02:00:00 (JST)'
const updatedAt = parseJstTimestamp(sourceUpdate)
const row = (name: string, rank = '1') => ({rank, userName: name, score: '3029466', subScore: '9367', recordDate: '2026/10/29 20:22:23'})
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

it('replaces a service retained by HMR when it lacks the download method', () => {
    const state = globalThis as typeof globalThis & {__maimaiRankings?: ReturnType<typeof createRankingService>}
    const previousService = state.__maimaiRankings
    const environment: Record<string, string | undefined> = process.env
    const previousEnvironment = environment.NODE_ENV
    try {
        environment.NODE_ENV = 'development'
        state.__maimaiRankings = {get: async () => {}} as unknown as ReturnType<typeof createRankingService>
        assert.equal(typeof getRankingService().getExport, 'function')
    } finally {
        state.__maimaiRankings = previousService
        if (previousEnvironment === undefined) delete environment.NODE_ENV
        else environment.NODE_ENV = previousEnvironment
    }
})

it('exports readable values, safe spreadsheet names, duplicate rows, and exact original JSON', () => {
    const value = {collectedAt: updatedAt, payload: {update: sourceUpdate, extra: {untouched: true}, ranking: [
        {...row('名前,"quoted"\nnext'), extraRowField: 'retained'}, row('=1+1', '2'), row('duplicate', '3'), row('duplicate', '4'),
    ]}}
    const key = `${archivePrefix('international')}${updatedAt}`
    const csv = rankingsCsv([{server: 'international', records: [{key, value}]}])
    const parsed = readCsv(csv)
    const scores = parsed.filter((entry) => entry['Record type'] === 'Score')
    assert.ok(csv.startsWith('\uFEFF"Record type"'))
    assert.ok(csv.endsWith('\r\n'))
    assert.equal(scores.length, 4)
    assert.equal(scores[0].Player, '名前,"quoted"\nnext')
    assert.equal(scores[0]['Score (%)'], '302.9466')
    assert.equal(scores[0]['Score (raw)'], '3029466')
    assert.equal(scores[0]['DX score'], '9367')
    assert.equal(scores[0]['Source updated at (JST)'], '2026-10-30 02:00:00')
    assert.equal(scores[0]['Source updated at (UTC)'], '2026-10-29T17:00:00.000Z')
    assert.equal(scores[1].Player, "'=1+1")
    assert.equal(JSON.parse(scores[1]['Record data (JSON)']).userName, '=1+1')
    assert.ok(scores.slice(2).every((entry) => entry['Duplicate name in snapshot'] === 'Yes'))
    assert.deepEqual(JSON.parse(parsed[0]['Record data (JSON)']), value)
    assert.deepEqual(JSON.parse(scores[0]['Record data (JSON)']), value.payload.ranking[0])
})

it('exports every stored revision, including empty snapshots, without writing or collecting', async () => {
    const storage = memoryRankingStorage()
    const first = {collectedAt: updatedAt, payload: {update: sourceUpdate, ranking: [row('Original')]}}
    const variant = {collectedAt: updatedAt + 1, payload: {update: sourceUpdate, ranking: [row('Revision')], extra: 123}}
    const empty = {collectedAt: updatedAt + 2, payload: {update: sourceUpdate, ranking: []}}
    const values = [first, variant, empty]
    for (const value of values) await storage.put(`${archivePrefix('international')}${updatedAt}:${hash(value)}`, value)
    const service = createRankingService({storage: {...storage, put: async () => {throw new Error('Export must not write')}},
        fetchSource: async () => {throw new Error('Export must not collect')}})
    const exported = await service.getExport('international')
    assert.equal(exported.records.length, 3)
    const parsed = readCsv(rankingsCsv([exported]))
    const snapshots = parsed.filter((entry) => entry['Record type'] === 'Snapshot')
    assert.equal(snapshots.length, 3)
    assert.equal(snapshots.filter((entry) => entry['Used in leaderboard history'] === 'Yes').length, 1)
    assert.deepEqual(snapshots.map((entry) => JSON.parse(entry['Record data (JSON)'])), values)
    assert.equal(parsed.filter((entry) => entry['Record type'] === 'Score').length, 2)
    assert.deepEqual((await service.getExport('japan')).records, [])
})

it('marks all historical removed scores by version and preserves events and current statuses after restart', async () => {
    const storage = memoryRankingStorage()
    for (const server of ['international', 'japan'] as const) {
        for (const day of [29, 30]) {
            const update = `2026/10/${day} 02:00:00`
            await storage.put(`${archivePrefix(server)}${parseJstTimestamp(update)}`, {
                collectedAt: parseJstTimestamp(update), payload: {update, ranking: [row('Removed'), row('Remaining', '2'),
                    ...(day === 29 ? [row('Dropped out', '3')] : [])]},
            })
        }
    }
    const service = createRankingService({storage, now: () => updatedAt + 1000})
    await service.getExport('international')
    await service.deletePlayer('international', 'Removed')
    const restarted = createRankingService({storage})
    for (const reader of [service, restarted]) {
        const histories = await Promise.all((['international', 'japan'] as MaimaiServer[]).map((server) => reader.getExport(server)))
        const parsed = readCsv(rankingsCsv(histories))
        const scores = parsed.filter((entry) => entry['Record type'] === 'Score')
        assert.equal(scores.length, 10)
        const removed = scores.filter((entry) => entry.Version === 'International' && entry.Player === 'Removed')
        assert.equal(removed.length, 2)
        assert.ok(removed.every((entry) => entry.Removed === 'true' && entry['Source rank'] === '1' && entry['Site rank (snapshot)'] === ''))
        assert.ok(removed.every((entry) => entry['Removal recorded at (UTC)'] === utc(updatedAt + 1000)))
        assert.ok(scores.filter((entry) => !removed.includes(entry)).every((entry) => entry.Removed === 'false'))
        assert.ok(scores.filter((entry) => entry.Player === 'Dropped out').every((entry) => entry['Current status'] === 'Not currently listed on KOP'))
        assert.ok(scores.filter((entry) => entry.Version === 'International' && entry.Player === 'Remaining').every((entry) => entry['Site rank (snapshot)'] === '1'))
        assert.equal(parsed.filter((entry) => entry['Record type'] === 'Moderator removal').length, 1)
        assert.ok((await reader.getCached('international')).every((entry) => entry.ranking.every((player) => player.userName !== 'Removed')))
    }
})
const utc = (time: number) => new Date(time).toISOString()

it('retains removal-only records, legacy timestamps, and unknown stored metadata', async () => {
    const storage = memoryRankingStorage()
    const service = createRankingService({storage, now: () => updatedAt})
    await service.deletePlayer('international', 'Never observed')
    const legacyName = 'Legacy removal'
    const legacyKey = `maimai:kop8th:international:deleted:${createHash('sha256').update(legacyName).digest('hex')}`
    await storage.put(legacyKey, {userName: legacyName})
    await storage.put('maimai:kop8th:international:future-field', {arbitrary: [1, 'kept']})
    const exported = await service.getExport('international')
    const parsed = readCsv(rankingsCsv([exported]))
    assert.equal(parsed.find((entry) => entry.Player === legacyName)?.['Removal recorded at (UTC)'], '')
    assert.equal(parsed.find((entry) => entry.Player === 'Never observed')?.Removed, 'true')
    for (const record of exported.records) {
        const csvRecord = parsed.find((entry) => entry['Record ID'] === record.key)!
        assert.deepEqual(JSON.parse(csvRecord['Record data (JSON)']), record.value)
    }
})

it('fails instead of silently dropping an unavailable record during export', async () => {
    const storage = memoryRankingStorage()
    const service = createRankingService({storage: {...storage, list: async (prefix) =>
        prefix.endsWith(':deleted:') ? [] : [`${archivePrefix('international')}${updatedAt}`]}})
    await assert.rejects(service.getExport('international'), /Saved export record is unavailable/)
})
