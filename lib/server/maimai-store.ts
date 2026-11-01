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
}
interface Options {
    storage: RankingStorage
    fetchSource?: (url: string) => Promise<unknown>
    now?: () => number
    persistence?: RankingHistory['persistence']
}

export const archivePrefix = (server: MaimaiServer) => `maimai:kop8th:${server}:snapshot:`
const stateKey = (server: MaimaiServer) => `maimai:kop8th:${server}:check`
const rosterKey = (server: MaimaiServer) => `maimai:kop8th:${server}:roster`
const deletedPrefix = (server: MaimaiServer) => `maimai:kop8th:${server}:deleted:`
const playerHash = (name: string) => createHash('sha256').update(name).digest('hex')

interface Roster {
    updatedAt: number
    checkedAt: number
    names: string[]
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
        if (!response.ok) throw new Error(`Source returned ${response.status}`)
        return response.json()
    },
}: Options) {
    const histories = new Map<MaimaiServer, { at: number; snapshots: RankingSnapshot[] }>()
    const states = new Map<MaimaiServer, CheckState>()
    const responses = new Map<MaimaiServer, { at: number; data: RankingHistory }>()
    const flights = new Map<MaimaiServer, Promise<RankingHistory>>()
    const rosters = new Map<MaimaiServer, Roster>()
    const deletions = new Map<MaimaiServer, Set<string>>()
    const removedNames = new Map<MaimaiServer, Map<string, string>>()

    async function savedRoster(server: MaimaiServer) {
        const saved = readRoster(await storage.get(rosterKey(server)))
        const local = rosters.get(server)
        const roster = local && (!saved || local.updatedAt > saved.updatedAt ||
            (local.updatedAt === saved.updatedAt && local.checkedAt >= saved.checkedAt)) ? local : saved
        if (roster) rosters.set(server, roster)
        return roster
    }

    async function visibleHistory(server: MaimaiServer, snapshots: RankingSnapshot[]) {
        // Apply mutable visibility after reading immutable/cached archives, for
        // both JSON and CSV. Unreadable moderation state must not expose scores.
        const [roster, keys] = await Promise.all([
            savedRoster(server),
            storage.list(deletedPrefix(server)),
        ])
        const deleted = deletions.get(server) ?? new Set<string>()
        for (const key of keys) deleted.add(key.slice(deletedPrefix(server).length))
        deletions.set(server, deleted)
        const removed = removedNames.get(server) ?? new Map<string, string>()
        removedNames.set(server, removed)
        const missing = [...deleted].filter((hash) => !removed.has(hash))
        // Deletion markers are immutable; read their names once, in bounded batches.
        for (let start = 0; start < missing.length; start += 6) {
            await Promise.all(missing.slice(start, start + 6).map(async (hash) => {
                const marker = await storage.get(`${deletedPrefix(server)}${hash}`) as {userName?: unknown} | null
                if (typeof marker?.userName !== 'string' || playerHash(marker.userName) !== hash)
                    throw new Error('Saved player removal is unavailable')
                removed.set(hash, marker.userName)
            }))
        }
        const latest = snapshots.at(-1)
        const names = new Set(roster && roster.updatedAt >= (latest?.updatedAt ?? 0)
            ? roster.names
            : latest?.ranking.map((row) => row.userName) ?? [])
        const removedPlayers = new Set(removed.values())
        return {
            snapshots: snapshots.map((snapshot) => excludeRankingPlayers(snapshot, removedPlayers)),
            currentPlayers: [...names].filter((name) => !deleted.has(playerHash(name))),
            removedPlayers: [...removed.values()].sort((a, b) => a.localeCompare(b, 'ja')),
        }
    }

    async function history(server: MaimaiServer, time: number): Promise<RankingSnapshot[]> {
        const cached = histories.get(server)
        if (cached && time - cached.at < 60_000) return cached.snapshots
        const keys = await storage.list(archivePrefix(server))
        // Immutable snapshots already loaded never need another value read.
        const merged = new Map(cached?.snapshots.map((snapshot) => [snapshot.updatedAt, snapshot]))
        const missing = keys.filter(
            (key) => !merged.has(Number(key.slice(archivePrefix(server).length))),
        )
        for (let start = 0; start < missing.length; start += 6) {
            const batch = await Promise.all(
                missing.slice(start, start + 6).map(async (key) => {
                    const archive = (await storage.get(key)) as Archive | null
                    if (!archive || !Number.isFinite(archive.collectedAt))
                        throw new Error('Saved snapshot is unavailable')
                    const parsed = parseRanking(archive.payload)
                    if (key !== `${archivePrefix(server)}${parsed.updatedAt}`)
                        throw new Error('Invalid snapshot key')
                    return { ...parsed, collectedAt: archive.collectedAt }
                }),
            )
            for (const snapshot of batch) merged.set(snapshot.updatedAt, snapshot)
        }
        // Collection may have finished while this archive read was in flight.
        // Retain those newly saved snapshots rather than replacing them with
        // the older key list used at the start of this read.
        for (const snapshot of histories.get(server)?.snapshots ?? []) {
            merged.set(snapshot.updatedAt, snapshot)
        }

        const snapshots = [...merged.values()].sort((a, b) => a.updatedAt - b.updatedAt)
        histories.set(server, { at: time, snapshots })
        return snapshots
    }

    async function load(server: MaimaiServer): Promise<RankingHistory> {
        const time = now()
        const cached = responses.get(server)
        if (cached && time - cached.at < 60_000 && time < cached.data.nextCheckAt)
            return cached.data
        let snapshots = histories.get(server)?.snapshots ?? []
        let state = states.get(server) ?? null
        try {
            snapshots = await history(server, time)
            const saved = readState(await storage.get(stateKey(server)))
            if (saved && (!state || saved.lastCheckedAt > state.lastCheckedAt)) state = saved
            if (
                !state ||
                time >= state.nextCheckAt ||
                (!snapshots.length && state.status === 'current')
            ) {
                const payload = await fetchSource(sourceUrl(server))
                const parsed = parseRanking(payload)
                if (parsed.updatedAt > time + 5 * 60_000)
                    throw new Error('Source timestamp is in the future')
                const roster = await savedRoster(server)
                if (parsed.updatedAt >= Math.max(roster?.updatedAt ?? 0, snapshots.at(-1)?.updatedAt ?? 0)) {
                    const nextRoster = {
                        updatedAt: parsed.updatedAt,
                        checkedAt: time,
                        names: parsed.ranking.map((row) => row.userName),
                    }
                    await storage.put(rosterKey(server), nextRoster)
                    rosters.set(server, nextRoster)
                }
                const key = `${archivePrefix(server)}${parsed.updatedAt}`
                if (!snapshots.some((snapshot) => snapshot.updatedAt === parsed.updatedAt)) {
                    const existing = (await storage.get(key)) as Archive | null
                    // A concurrent writer may already have archived this source timestamp.
                    const archive = existing ?? { collectedAt: time, payload }
                    if (!Number.isFinite(archive.collectedAt))
                        throw new Error('Invalid saved snapshot')
                    const original = parseRanking(archive.payload)
                    if (original.updatedAt !== parsed.updatedAt)
                        throw new Error('Invalid saved snapshot timestamp')
                    if (!existing) await storage.put(key, archive)
                    snapshots = [
                        ...snapshots,
                        { ...original, collectedAt: archive.collectedAt },
                    ].sort((a, b) => a.updatedAt - b.updatedAt)
                    histories.set(server, { at: time, snapshots })
                }
                const cutoff = dailyCutoff(server, time)
                const current = parsed.updatedAt >= cutoff
                state = {
                    lastCheckedAt: time,
                    nextCheckAt: current ? cutoff + DAY_MS : time + RETRY_MS,
                    status: current ? 'current' : 'waiting',
                    warning: current
                        ? null
                        : 'SEGA has not published this daily update yet. Showing the latest saved rankings.',
                }
                await storage.put(stateKey(server), state)
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
                await storage.put(stateKey(server), state)
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
        visibilityVersion: 4,
        async deletePlayer(server: MaimaiServer, userName: string): Promise<void> {
            const hash = playerHash(userName)
            // One immutable key per exact name avoids lost concurrent deletions.
            await storage.put(`${deletedPrefix(server)}${hash}`, { userName, deletedAt: now() })
            const deleted = deletions.get(server) ?? new Set<string>()
            deleted.add(hash)
            deletions.set(server, deleted)
            const removed = removedNames.get(server) ?? new Map<string, string>()
            removed.set(hash, userName)
            removedNames.set(server, removed)
        },

        async getCached(server: MaimaiServer): Promise<RankingSnapshot[]> {
            return (await visibleHistory(server, await history(server, now()))).snapshots
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

    // Rebuild outdated services retained by HMR when visibility data changes.
    if (
        globalStore.__maimaiRankings &&
        globalStore.__maimaiRankings.visibilityVersion !== 4
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
