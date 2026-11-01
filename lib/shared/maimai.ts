export const MAIMAI_SERVERS = {
    international: {
        label: 'International',
        directory: 'maimai_itr',
        cutoffHour: 2,
        invitationPlaces: 2,
        queryValue: 'ex',
    },
    japan: {
        label: 'Japan Ver.',
        directory: 'maimai',
        cutoffHour: 7,
        invitationPlaces: 7,
        queryValue: 'm',
    },
} as const

export type MaimaiServer = keyof typeof MAIMAI_SERVERS
export type RankingMetric = 'rank' | 'score' | 'subScore'

/** Display the source's ten-thousandths-of-a-percent score. */
export function formatScore(score: number): string {
    return `${(score / 10_000).toFixed(4).padStart(8, '0')}%`
}

export function serverFromQuery(value: string | null): MaimaiServer | null {
    if (value === null || value === 'ex') {
        return 'international'
    }

    if (value === 'm') {
        return 'japan'
    }

    return null
}

export function isInvitationPlace(server: MaimaiServer, rank: number | null): boolean {
    return rank !== null && rank >= 1 && rank <= MAIMAI_SERVERS[server].invitationPlaces
}

export function isLcqPlace(server: MaimaiServer, rank: number | null): boolean {
    return server === 'japan' && rank !== null && rank >= 8 && rank <= 15
}
export const DAY_MS = 86_400_000
export const RETRY_MS = 30 * 60_000
const JST_OFFSET = 9 * 60 * 60_000

export function isMaimaiServer(value: unknown): value is MaimaiServer {
    return value === 'international' || value === 'japan'
}

export function sourceUrl(server: MaimaiServer): string {
    return `https://maimai.sega.jp/kop8th/json/${MAIMAI_SERVERS[server].directory}/maimai_scoreattack_ranking.json`
}

/** SEGA's suffix-less Japan timestamps are also Japan Standard Time. */
export function parseJstTimestamp(value: string): number {
    const match = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})(?: \(JST\))?$/.exec(value)
    if (!match) throw new Error('Invalid source timestamp')
    const [, year, month, day, hour, minute, second] = match
    const time = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}+09:00`)
    if (
        !Number.isFinite(time) ||
        new Date(time + JST_OFFSET).toISOString().slice(0, 19) !==
            `${year}-${month}-${day}T${hour}:${minute}:${second}`
    ) {
        throw new Error('Invalid source timestamp')
    }
    return time
}

export function dailyCutoff(server: MaimaiServer, now: number): number {
    const local = new Date(now + JST_OFFSET)
    const cutoff =
        Date.UTC(
            local.getUTCFullYear(),
            local.getUTCMonth(),
            local.getUTCDate(),
            MAIMAI_SERVERS[server].cutoffHour,
        ) - JST_OFFSET
    return now < cutoff ? cutoff - DAY_MS : cutoff
}

export interface RankingEntry {
    rank: number
    userName: string
    score: number
    subScore: number
    recordDate: string
}

export interface RankingSnapshot {
    updatedAt: number
    sourceUpdate: string
    collectedAt: number
    ranking: RankingEntry[]
}

export interface RankingHistory {
    server: MaimaiServer
    snapshots: RankingSnapshot[]
    currentPlayers: string[]
    removedPlayers: string[]
    latestSourceUpdate: string | null
    lastCheckedAt: number | null
    nextCheckAt: number
    status: 'current' | 'waiting' | 'error'
    warning: string | null
    persistence: 'kv' | 'memory'
}

/** Current standings can change without KOP advancing an archived timestamp. */
export function latestStandings(history?: Pick<RankingHistory, 'snapshots' | 'currentPlayers'>): RankingSnapshot | undefined {
    const latest = history?.snapshots.at(-1)
    if (!latest) return undefined
    const current = new Set(history?.currentPlayers ?? latest.ranking.map((row) => row.userName))
    return {...latest, ranking: latest.ranking.filter((row) => current.has(row.userName))}
}

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numericField(value: unknown, minimum = 0): number {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('Invalid ranking number')
    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed) || parsed < minimum) throw new Error('Invalid ranking number')
    return parsed
}

/** Validate a projection without stripping any fields from the archived payload. */
export function parseRanking(payload: unknown): Omit<RankingSnapshot, 'collectedAt'> {
    if (!record(payload) || typeof payload.update !== 'string' || !Array.isArray(payload.ranking)) {
        throw new Error('Invalid ranking feed')
    }
    const updatedAt = parseJstTimestamp(payload.update)
    const ranking = payload.ranking.map((row): RankingEntry => {
        if (
            !record(row) ||
            typeof row.userName !== 'string' ||
            !row.userName.length ||
            typeof row.recordDate !== 'string'
        ) {
            throw new Error('Invalid ranking entry')
        }
        parseJstTimestamp(row.recordDate)
        return {
            rank: numericField(row.rank, 1),
            userName: row.userName,
            score: numericField(row.score),
            subScore: numericField(row.subScore),
            recordDate: row.recordDate,
        }
    })
    return { updatedAt, sourceUpdate: payload.update, ranking }
}

export function searchableName(name: string): string {
    return name.normalize('NFKC').toLocaleLowerCase()
}

export function uniqueEntries(snapshot: RankingSnapshot): Map<string, RankingEntry> {
    const entries = new Map<string, RankingEntry>()
    const duplicates = new Set<string>()
    for (const row of snapshot.ranking) {
        if (entries.has(row.userName)) duplicates.add(row.userName)
        entries.set(row.userName, row)
    }
    for (const name of duplicates) entries.delete(name)
    return entries
}

export function topTen(snapshot?: RankingSnapshot): string[] {
    return snapshot
        ? [...uniqueEntries(snapshot).values()]
              .sort((a, b) => a.rank - b.rank)
              .slice(0, 10)
              .map((row) => row.userName)
        : []
}

export function filterSnapshots(
    snapshots: RankingSnapshot[],
    days: number | null,
): RankingSnapshot[] {
    const last = snapshots.at(-1)
    return days && last
        ? snapshots.filter((snapshot) => snapshot.updatedAt >= last.updatedAt - days * DAY_MS)
        : snapshots
}

export function playerSeries(
    snapshots: RankingSnapshot[],
    name: string,
    metric: RankingMetric,
): (number | null)[] {
    return snapshots.map((snapshot) => uniqueEntries(snapshot).get(name)?.[metric] ?? null)
}

export const formatJst = (time: number, detailed = false): string =>
    new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Tokyo',
        day: 'numeric',
        month: 'short',
        ...(detailed
            ? { year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const }
            : {}),
    }).format(time)
