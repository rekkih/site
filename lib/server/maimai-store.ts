import { createHash } from 'node:crypto'
import {
    dailyCutoff,
    excludeRankingPlayers,
    DAY_MS,
    RETRY_MS,
    parseRanking,
    sourceUrl,
    type MaimaiServer,
    type RankingHistory,
    type RankingSnapshot,
} from '../shared/maimai'
import { kvConfigured, kvGetStrict, kvListStrict, kvPutStrict } from './cf-kv'
import type {RankingAuditEvent, RankingExport} from './maimai-export'

export interface RankingStorage {
    get(key: string): Promise<unknown | null>
    put(key: string, value: unknown): Promise<void>
    list(prefix: string): Promise<string[]>
}
interface Archive {
    collectedAt: number
    payload: unknown
}
interface CheckState {
    lastCheckedAt: number
    nextCheckAt: number
    status: RankingHistory['status']
    warning: string | null
    auditKey?: string
}
interface Options {
    storage: RankingStorage
    fetchSource?: (url: string) => Promise<unknown>
    now?: () => number
    persistence?: RankingHistory['persistence']
}

interface SourceResponse {
    url: string
    status: number
    statusText: string
    contentType: string | null
    body: string
}

class SourceResponseError extends Error {
    constructor(message: string, readonly response: SourceResponse) {
        super(message)
        this.name = 'SourceResponseError'
    }
}

export const archivePrefix = (server: MaimaiServer) => `maimai:kop8th:${server}:snapshot:`
const stateKey = (server: MaimaiServer) => `maimai:kop8th:${server}:check`
const rosterKey = (server: MaimaiServer) => `maimai:kop8th:${server}:roster`
const deletedPrefix = (server: MaimaiServer) => `maimai:kop8th:${server}:deleted:`
const playerHash = (name: string) => createHash('sha256').update(name).digest('hex')
const valueHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
interface Removal { userName: string; deletedAt?: number }
const removalKey = (server: MaimaiServer, removal: Removal) =>
    `${deletedPrefix(server)}${playerHash(removal.userName)}:${valueHash(removal)}`

function archiveKey(server: MaimaiServer, updatedAt: number, archive: Archive): string {
    const hash = createHash('sha256').update(JSON.stringify(archive)).digest('hex')
    return `${archivePrefix(server)}${updatedAt}:${hash}`
}

function readArchive(server: MaimaiServer, key: string, value: unknown): RankingSnapshot {
    const archive = value as Archive | null
    if (!archive || !Number.isFinite(archive.collectedAt))
        throw new Error('Saved snapshot is unavailable')
    const parsed = parseRanking(archive.payload)
    // Continue reading existing timestamp-only archives without rewriting them.
    if (key !== `${archivePrefix(server)}${parsed.updatedAt}` &&
        key !== archiveKey(server, parsed.updatedAt, archive))
        throw new Error('Invalid snapshot key')
    return { ...parsed, collectedAt: archive.collectedAt }
}

interface Roster {
    updatedAt: number
    checkedAt: number
    names: string[]
    auditKey?: string
}

function readRoster(value: unknown): Roster | null {
    if (value === null) return null
    const roster = value as Roster
    if (!roster || !Number.isFinite(roster.updatedAt) || !Number.isFinite(roster.checkedAt) || !Array.isArray(roster.names) ||
        !roster.names.every((name) => typeof name === 'string')) {
        throw new Error('Invalid saved player roster')
    }
    return roster
}

function readState(value: unknown): CheckState | null {
    if (value === null) return null
    const state = value as CheckState
    if (
        !state ||
        !Number.isFinite(state.lastCheckedAt) ||
        !Number.isFinite(state.nextCheckAt) ||
        !['current', 'waiting', 'error'].includes(state.status) ||
        !(state.warning === null || typeof state.warning === 'string')
    ) {
        throw new Error('Invalid saved check state')
    }
    return state
}

export function createRankingService({
    storage,
    now = Date.now,
    persistence = 'kv',
    fetchSource = async (url) => {
        const response = await fetch(url, {
            cache: 'no-store',
            signal: AbortSignal.timeout(10_000),
        })
        const sourceResponse: SourceResponse = {
            url: response.url || url,
            status: response.status,
            statusText: response.statusText,
            contentType: response.headers.get('content-type'),
            body: await response.text(),
        }
        if (!response.ok) throw new SourceResponseError(`Source returned ${response.status}`, sourceResponse)
        try {
            return JSON.parse(sourceResponse.body)
        } catch {
            throw new SourceResponseError('Source returned invalid JSON', sourceResponse)
        }
    },
}: Options) {
    const histories = new Map<MaimaiServer, { at: number; snapshots: RankingSnapshot[] }>()
    const archives = new Map<MaimaiServer, Map<string, RankingSnapshot>>()
    const states = new Map<MaimaiServer, CheckState>()
    const responses = new Map<MaimaiServer, { at: number; data: RankingHistory }>()
    const flights = new Map<MaimaiServer, Promise<RankingHistory>>()
    const rosters = new Map<MaimaiServer, Roster>()
    const removalKeys = new Map<MaimaiServer, Set<string>>()
    const removals = new Map<MaimaiServer, Map<string, Removal>>()
    const auditKeys = new Map<MaimaiServer, Set<string>>()

    async function saveAudit(server: MaimaiServer, kind: RankingAuditEvent['kind'], data: unknown, recordedAt: number) {
        const event: RankingAuditEvent = {schemaVersion: 1, kind, recordedAt, data}
        const key = `maimai:kop8th:${server}:audit:v1:${kind}:${valueHash(event)}`
        const keys = auditKeys.get(server) ?? new Set<string>()
        if (keys.has(key)) return key
        await storage.put(key, event)
        keys.add(key)
        auditKeys.set(server, keys)
        return key
    }

    async function saveCheck(server: MaimaiServer, state: CheckState, details: object, time: number) {
        // The new event must survive even if reading/preserving the old latest
        // pointer fails. Never overwrite an unreadable legacy record.
        const auditKey = await saveAudit(server, 'check', {...state, ...details}, time)
        const previous = readState(await storage.get(stateKey(server)))
        // Retain the legacy latest-only record before its first replacement.
        if (previous && !previous.auditKey) await saveAudit(server, 'check', previous, previous.lastCheckedAt)
        const saved = {...state, auditKey}
        await storage.put(stateKey(server), saved)
        return saved
    }

    async function savedRoster(server: MaimaiServer) {
        const saved = readRoster(await storage.get(rosterKey(server)))
        const local = rosters.get(server)
        const roster = local && (!saved || local.updatedAt > saved.updatedAt ||
            (local.updatedAt === saved.updatedAt && local.checkedAt >= saved.checkedAt)) ? local : saved
        if (roster) rosters.set(server, roster)
        return roster
    }

    async function removedPlayers(server: MaimaiServer): Promise<string[]> {
        const keys = await storage.list(deletedPrefix(server))
        const known = removalKeys.get(server) ?? new Set<string>()
        for (const key of keys) known.add(key)
        removalKeys.set(server, known)
        const removed = removals.get(server) ?? new Map<string, Removal>()
        removals.set(server, removed)
        const missing = [...known].filter((key) => !removed.has(key))
        // Read legacy markers and immutable removal events in bounded batches.
        for (let start = 0; start < missing.length; start += 6) {
            await Promise.all(missing.slice(start, start + 6).map(async (key) => {
                const marker = await storage.get(key) as Removal | null
                if (typeof marker?.userName !== 'string' ||
                    (marker.deletedAt !== undefined && !Number.isFinite(marker.deletedAt)) ||
                    (key !== `${deletedPrefix(server)}${playerHash(marker.userName)}` && key !== removalKey(server, marker)))
                    throw new Error('Saved player removal is unavailable')
                removed.set(key, marker)
            }))
        }
        return [...new Set([...removed.values()].map((marker) => marker.userName))].sort((a, b) => a.localeCompare(b, 'ja'))
    }

    async function visibleHistory(server: MaimaiServer, snapshots: RankingSnapshot[]) {
        // Apply visibility after cached archive reads. Unreadable moderation
        // state must not expose hidden players in the leaderboard.
        const [roster, removed] = await Promise.all([savedRoster(server), removedPlayers(server)])
        const latest = snapshots.at(-1)
        // A newer roster may propagate before its archive reaches this reader.
        const names = new Set(roster && roster.updatedAt === latest?.updatedAt
            ? roster.names
            : latest?.ranking.map((row) => row.userName) ?? [])
        const removedNames = new Set(removed)
        return {
            snapshots: snapshots.map((snapshot) => excludeRankingPlayers(snapshot, removedNames)),
            currentPlayers: [...names].filter((name) => !removedNames.has(name)),
            removedPlayers: removed,
        }
    }

    function rememberArchives(server: MaimaiServer, entries: [string, RankingSnapshot][], time: number) {
        // Merge against current state: collection may have completed during a read.
        const merged = new Map(archives.get(server))
        for (const [key, snapshot] of entries) merged.set(key, snapshot)
        archives.set(server, merged)
        const ordered = [...merged].sort(([aKey, a], [bKey, b]) => {
            const aLegacy = aKey === `${archivePrefix(server)}${a.updatedAt}`
            const bLegacy = bKey === `${archivePrefix(server)}${b.updatedAt}`
            return Number(bLegacy) - Number(aLegacy) || a.collectedAt - b.collectedAt ||
                (aKey < bKey ? -1 : aKey > bKey ? 1 : 0)
        })
        // Preserve legacy history, otherwise choose the earliest collection with
        // a deterministic key tie-break. Raw competing payloads all remain saved.
        const selected = new Map<number, RankingSnapshot>()
        for (const [, snapshot] of ordered) {
            if (!selected.has(snapshot.updatedAt)) selected.set(snapshot.updatedAt, snapshot)
        }
        const snapshots = [...selected.values()].sort((a, b) => a.updatedAt - b.updatedAt)
        histories.set(server, { at: time, snapshots })
        return snapshots
    }

    async function history(server: MaimaiServer, time: number, force = false): Promise<RankingSnapshot[]> {
        const cached = histories.get(server)
        if (!force && cached && time - cached.at < 60_000) return cached.snapshots
        const keys = await storage.list(archivePrefix(server))
        // Cache by archive key, not timestamp, so late concurrent variants are read.
        const missing = keys.filter((key) => !archives.get(server)?.has(key))
        const entries: [string, RankingSnapshot][] = []
        for (let start = 0; start < missing.length; start += 6) {
            const batch = await Promise.all(
                missing.slice(start, start + 6).map(async (key) => {
                    return [key, readArchive(server, key, await storage.get(key))] as [string, RankingSnapshot]
                }),
            )
            entries.push(...batch)
        }
        return rememberArchives(server, entries, time)
    }

    async function load(server: MaimaiServer): Promise<RankingHistory> {
        const time = now()
        const cached = responses.get(server)
        if (cached && cached.data.status !== 'waiting' && time - cached.at < 60_000 && time < cached.data.nextCheckAt)
            return cached.data
        let snapshots = histories.get(server)?.snapshots ?? []
        let state = states.get(server) ?? null
        let observedSource: {payload: unknown} | undefined
        let observedArchiveKey: string | undefined
        try {
            // Waiting requests must see snapshots saved by other instances too.
            snapshots = await history(server, time, true)
            const saved = readState(await storage.get(stateKey(server)))
            if (saved && (!state || saved.lastCheckedAt > state.lastCheckedAt)) state = saved
            if (
                !state ||
                state.status === 'waiting' ||
                time >= state.nextCheckAt ||
                (!snapshots.length && state.status === 'current')
            ) {
                const payload = await fetchSource(sourceUrl(server))
                observedSource = {payload}
                const parsed = parseRanking(payload)
                if (parsed.updatedAt > time + 5 * 60_000)
                    throw new Error('Source timestamp is in the future')
                const legacyKey = `${archivePrefix(server)}${parsed.updatedAt}`
                const existing = await storage.get(legacyKey)
                if (existing !== null) {
                    snapshots = rememberArchives(server, [[legacyKey, readArchive(server, legacyKey, existing)]], time)
                }
                if (parsed.updatedAt > (snapshots.at(-1)?.updatedAt ?? -Infinity)) {
                    const archive = { collectedAt: time, payload }
                    const key = archiveKey(server, parsed.updatedAt, archive)
                    const original = readArchive(server, key, archive)
                    const entries: [string, RankingSnapshot][] = [[key, original]]
                    // Different payloads have different keys, even when both
                    // writers observed an absent archive or a stale KV listing.
                    // Only a newer source timestamp adds a snapshot.
                    await storage.put(key, archive)
                    observedArchiveKey = key
                    snapshots = rememberArchives(server, entries, time)
                } else {
                    // Keep exports able to find the saved snapshot through the
                    // latest check, even if KV listing entries have not propagated.
                    observedArchiveKey = [...archives.get(server) ?? []]
                        .find(([, snapshot]) => snapshot === snapshots.at(-1))?.[0]
                }
                // New timestamps are durable before publishing membership. Equal
                // timestamps can still report departures from the current roster.
                const roster = await savedRoster(server)
                if (parsed.updatedAt >= Math.max(roster?.updatedAt ?? 0, snapshots.at(-1)?.updatedAt ?? 0)) {
                    const nextRoster = {
                        updatedAt: parsed.updatedAt,
                        checkedAt: time,
                        names: parsed.ranking.map((row) => row.userName),
                    }
                    if (roster && !roster.auditKey) await saveAudit(server, 'roster', roster, roster.checkedAt)
                    const auditKey = await saveAudit(server, 'roster', nextRoster, time)
                    const savedRoster = {...nextRoster, auditKey}
                    await storage.put(rosterKey(server), savedRoster)
                    rosters.set(server, savedRoster)
                }
                const cutoff = dailyCutoff(server, time)
                const current = parsed.updatedAt >= cutoff
                state = {
                    lastCheckedAt: time,
                    nextCheckAt: current ? cutoff + DAY_MS : time,
                    status: current ? 'current' : 'waiting',
                    warning: current
                        ? null
                        : 'SEGA has not published this daily update yet. Showing the latest saved rankings.',
                }
                state = await saveCheck(server, state, observedArchiveKey ? {archiveKey: observedArchiveKey} : {}, time)
            }
        } catch (error) {
            console.error(
                `[maimai:${server}] Collection failed:`,
                error instanceof Error ? error.message : 'Unknown error',
            )
            state = {
                lastCheckedAt: time,
                nextCheckAt: time + RETRY_MS,
                status: 'error',
                warning:
                    'Rankings could not be refreshed. Saved history is preserved; another visit can retry in 30 minutes.',
            }
            // Retain local backoff even when KV itself is unavailable.
            try {
                state = await saveCheck(server, state, {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    ...(observedSource ? {sourcePayload: observedSource.payload} : {}),
                    ...(observedArchiveKey ? {archiveKey: observedArchiveKey} : {}),
                    ...(error instanceof SourceResponseError ? {sourceResponse: error.response} : {}),
                }, time)
            } catch {
                /* storage outage */
            }
        }
        states.set(server, state!)
        const data: RankingHistory = {
            server,
            snapshots,
            currentPlayers: [],
            removedPlayers: [],
            latestSourceUpdate: snapshots.at(-1)?.sourceUpdate ?? null,
            ...state!,
            persistence,
        }
        responses.set(server, { at: time, data })
        return data
    }

    return {
        visibilityVersion: 9,
        async deletePlayer(server: MaimaiServer, userName: string): Promise<void> {
            const marker = { userName, deletedAt: now() }
            const key = removalKey(server, marker)
            // The audit event is the removal itself: one durable write, no
            // separate log that can disagree with the applied moderation state.
            await storage.put(key, marker)
            const known = removalKeys.get(server) ?? new Set<string>()
            known.add(key)
            removalKeys.set(server, known)
            const removed = removals.get(server) ?? new Map<string, Removal>()
            removed.set(key, marker)
            removals.set(server, removed)
        },

        async getCached(server: MaimaiServer): Promise<RankingSnapshot[]> {
            return (await visibleHistory(server, await history(server, now()))).snapshots
        },

        async getExport(server: MaimaiServer): Promise<RankingExport> {
            await removedPlayers(server)
            // Export all persisted records, including non-selected source revisions
            // and legacy metadata. Downloads never fetch upstream or write storage.
            const keys = new Set([
                ...await storage.list(`maimai:kop8th:${server}:`),
                ...archives.get(server)?.keys() ?? [],
                ...removalKeys.get(server) ?? [],
                ...auditKeys.get(server) ?? [],
            ])
            const required = new Set(keys)
            // These stable keys can reveal references even when their listing
            // entries have not propagated. Missing unlisted roots are normal.
            keys.add(stateKey(server))
            keys.add(rosterKey(server))
            const records: RankingExport['records'] = []
            const ordered = [...keys].sort()
            const auditPrefix = `maimai:kop8th:${server}:audit:v1:`
            function addReference(value: unknown, expectedPrefix: string) {
                if (value === undefined) return
                if (typeof value !== 'string' || !value.startsWith(expectedPrefix))
                    throw new Error('Invalid saved export reference')
                required.add(value)
                if (!keys.has(value)) {
                    keys.add(value)
                    ordered.push(value)
                }
            }
            for (let start = 0; start < ordered.length;) {
                const batchKeys = ordered.slice(start, start + 6)
                start += batchKeys.length
                const batch = await Promise.all(batchKeys.map(async (key) => {
                    const value = await storage.get(key)
                    if (value === null) {
                        if (required.has(key)) throw new Error('Saved export record is unavailable')
                        return null
                    }
                    if (key.startsWith(archivePrefix(server))) readArchive(server, key, value)
                    return {key, value}
                }))
                for (const record of batch) {
                    if (!record) continue
                    records.push(record)
                    const data = record.value as Record<string, unknown> | null
                    if (record.key === stateKey(server) || record.key === rosterKey(server)) {
                        addReference(data?.auditKey, auditPrefix)
                    } else if (record.key.startsWith(auditPrefix)) {
                        const eventData = data?.data as Record<string, unknown> | null
                        // Only schema-defined links are followed; original source
                        // JSON must never cause reads of arbitrary database keys.
                        addReference(eventData?.auditKey, auditPrefix)
                        addReference(eventData?.archiveKey, archivePrefix(server))
                    }
                }
            }
            records.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
            return {server, records}
        },

        async get(server: MaimaiServer): Promise<RankingHistory> {
            let pending = flights.get(server)
            if (!pending) {
                pending = load(server).finally(() => flights.delete(server))
                flights.set(server, pending)
            }
            const data = await pending
            return { ...data, ...await visibleHistory(server, data.snapshots) }
        },
    }
}

export function memoryRankingStorage(): RankingStorage {
    const values = new Map<string, unknown>()
    return {
        get: async (key) => (values.has(key) ? structuredClone(values.get(key)) : null),
        put: async (key, value) => {
            values.set(key, structuredClone(value))
        },
        list: async (prefix) => [...values.keys()].filter((key) => key.startsWith(prefix)).sort(),
    }
}

const globalStore = globalThis as typeof globalThis & {
    __maimaiRankings?: ReturnType<typeof createRankingService>
}
export function getRankingService() {
    if (!kvConfigured && process.env.NODE_ENV !== 'development')
        throw new Error('Ranking persistence is not configured')

    // Rebuild outdated services retained by HMR when collection behavior changes.
    if (
        globalStore.__maimaiRankings &&
        globalStore.__maimaiRankings.visibilityVersion !== 9
    ) {
        globalStore.__maimaiRankings = undefined
    }

    return (globalStore.__maimaiRankings ??= createRankingService({
        storage: kvConfigured
            ? { get: kvGetStrict, put: kvPutStrict, list: kvListStrict }
            : memoryRankingStorage(),
        persistence: kvConfigured ? 'kv' : 'memory',
    }))
}
