import {it} from 'node:test'
import assert from 'node:assert/strict'
import {createRankingService, memoryRankingStorage, archivePrefix} from './maimai-store'
import {rankingsCsv} from './maimai-csv'
import {readCsv} from './maimai-csv-test-utils'

const now = Date.parse('2026-10-30T03:00:00+09:00')
const prefix = 'maimai:kop8th:international:'
const payload = {update: '2026/10/30 02:00:00', ranking: [
    {userName: 'A', rank: '1', score: '3029910', subScore: '9000', recordDate: '2026/10/30 01:00:00'},
]}

it('saves check audit events despite a check-state read outage without overwriting legacy state', async () => {
    const base = memoryRankingStorage()
    const legacy = {lastCheckedAt: now - 86400000, nextCheckAt: now, status: 'current', warning: null, extra: 'preserve me'}
    await base.put(prefix + 'check', legacy)
    let failCheckReads = false
    const service = createRankingService({storage: {...base, get: async (key) => {
        if (failCheckReads && key === prefix + 'check') throw new Error('Check-state reads unavailable')
        return base.get(key)
    }}, now: () => now, fetchSource: async () => {failCheckReads = true; return payload}})
    const result = await service.get('international')
    assert.equal(result.status, 'error')
    assert.equal((await base.list(archivePrefix('international'))).length, 1)
    assert.deepEqual(await base.get(prefix + 'check'), legacy)
    const events = await Promise.all((await base.list(prefix + 'audit:v1:check:')).map((key) => base.get(key))) as {data: {status: string; error?: string}}[]
    assert.equal(events.length, 2)
    assert.ok(events.some((event) => event.data.status === 'current'))
    assert.ok(events.some((event) => event.data.status === 'error' && event.data.error === 'Check-state reads unavailable'))
    const restarted = createRankingService({storage: base})
    assert.equal(readCsv(rankingsCsv([await restarted.getExport('international')])).filter((row) => row['Record type'] === 'Collection check').length, 2)
})

it('follows readable audit and archive references when the namespace listing omits their records', async () => {
    const base = memoryRankingStorage()
    await createRankingService({storage: base, now: () => now, fetchSource: async () => payload}).get('international')
    const allKeys = await base.list(prefix)
    for (const listing of ['latest-only', 'empty'] as const) {
        const exported = await createRankingService({storage: {...base, list: async (keyPrefix) =>
            listing === 'empty' ? [] : (await base.list(keyPrefix)).filter((key) => !key.includes(':snapshot:') && !key.includes(':audit:'))
        }}).getExport('international')
        assert.deepEqual(exported.records.map(({key}) => key).sort(), allKeys)
        const csv = readCsv(rankingsCsv([exported]))
        assert.equal(csv.filter((row) => row['Record type'] === 'Score').length, 1)
        for (const record of exported.records) assert.deepEqual(JSON.parse(csv.find((row) => row['Record ID'] === record.key)!['Record data (JSON)']), record.value)
    }
})

it('retains the archive reference after equal and older timestamps are skipped', async () => {
    const base = memoryRankingStorage()
    let clock = now
    let source = payload
    const service = createRankingService({storage: base, now: () => clock, fetchSource: async () => source})
    await service.get('international')
    clock += 86400000
    await service.get('international')
    clock++
    source = {...payload, update: '2026/10/29 02:00:00'}
    await service.get('international')
    assert.equal((await base.list(archivePrefix('international'))).length, 1)
    const exported = await createRankingService({storage: {...base, list: async () => []}}).getExport('international')
    assert.equal(exported.records.filter(({key}) => key.startsWith(archivePrefix('international'))).length, 1)
    assert.equal(readCsv(rankingsCsv([exported])).filter((row) => row['Record type'] === 'Score').length, 1)
})

it('retains malformed JSON and HTTP error response bodies in durable audit and CSV records', async () => {
    const originalFetch = globalThis.fetch
    try {
        for (const fixture of [
            {status: 200, type: 'application/json', body: '{"incomplete": "日本語"'},
            {status: 503, type: 'text/html', body: '<h1>Upstream error</h1>\nDetails: "busy", try again'},
            {status: 502, type: 'text/plain', body: ''},
        ]) {
            const base = memoryRankingStorage()
            globalThis.fetch = (async () => new Response(fixture.body, {status: fixture.status, headers: {'content-type': fixture.type}})) as typeof fetch
            const result = await createRankingService({storage: base, now: () => now}).get('international')
            assert.equal(result.status, 'error')
            assert.equal(result.snapshots.length, 0)
            const keys = await base.list(prefix + 'audit:v1:check:')
            assert.equal(keys.length, 1)
            const event = await base.get(keys[0]) as {data: {sourceResponse: {body: string; status: number; contentType: string; url: string}}}
            assert.equal(event.data.sourceResponse.body, fixture.body)
            assert.equal(event.data.sourceResponse.status, fixture.status)
            assert.equal(event.data.sourceResponse.contentType, fixture.type)
            assert.ok(event.data.sourceResponse.url.startsWith('https://maimai.sega.jp/'))
            const exported = await createRankingService({storage: base}).getExport('international')
            const auditRow = readCsv(rankingsCsv([exported])).find((row) => row['Record ID'] === keys[0])!
            assert.deepEqual(JSON.parse(auditRow['Record data (JSON)']), event)
        }
    } finally {globalThis.fetch = originalFetch}
})

it('records the failure when the initial check-state read fails before any source fetch', async () => {
    const base = memoryRankingStorage()
    let fetched = false
    const service = createRankingService({storage: {...base, get: async (key) => {
        if (key === prefix + 'check') throw new Error('Check read failed before collection')
        return base.get(key)
    }}, now: () => now, fetchSource: async () => {fetched = true; return payload}})
    assert.equal((await service.get('international')).status, 'error')
    assert.equal(fetched, false)
    const keys = await base.list(prefix + 'audit:v1:check:')
    assert.equal(keys.length, 1)
    const event = await base.get(keys[0]) as {data: {error: string}}
    assert.equal(event.data.error, 'Check read failed before collection')
})

it('fails an export when a referenced record is missing, and rejects cross-version references', async () => {
    const base = memoryRankingStorage()
    await createRankingService({storage: base, now: () => now, fetchSource: async () => payload}).get('international')
    const check = await base.get(prefix + 'check') as {auditKey: string}
    const broken = createRankingService({storage: {...base,
        list: async () => [],
        get: async (key) => key === check.auditKey ? null : base.get(key),
    }})
    await assert.rejects(broken.getExport('international'), /Saved export record is unavailable/)

    const otherVersionKey = 'maimai:kop8th:japan:audit:v1:check:foreign'
    await base.put(prefix + 'check', {...check, auditKey: otherVersionKey})
    const reads: string[] = []
    const invalid = createRankingService({storage: {...base, list: async () => [], get: async (key) => {
        reads.push(key)
        return base.get(key)
    }}})
    await assert.rejects(invalid.getExport('international'), /Invalid saved export reference/)
    assert.ok(!reads.includes(otherVersionKey))
})

it('deduplicates cyclic audit references, bounds reads, and ignores links inside source evidence', async () => {
    const base = memoryRankingStorage()
    const auditKey = prefix + 'audit:v1:check:cycle'
    const foreignKey = 'private:unrelated'
    await base.put(prefix + 'check', {auditKey})
    await base.put(auditKey, {schemaVersion: 1, kind: 'check', recordedAt: now,
        data: {auditKey, sourcePayload: {archiveKey: foreignKey, auditKey: foreignKey}}})
    for (let index = 0; index < 15; index++) await base.put(prefix + `metadata:${index}`, {index})
    let active = 0, maxActive = 0
    const reads = new Map<string, number>()
    const exported = await createRankingService({storage: {...base, get: async (key) => {
        reads.set(key, (reads.get(key) ?? 0) + 1)
        active++
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 1))
        try {return await base.get(key)} finally {active--}
    }}}).getExport('international')
    assert.equal(exported.records.length, 17)
    assert.equal(reads.get(auditKey), 1)
    assert.ok(maxActive <= 6)
    assert.equal(reads.has(foreignKey), false)
})
