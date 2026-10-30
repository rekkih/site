import { DAY_MS, uniqueEntries, type RankingSnapshot } from './maimai'

export interface DailyRankingChange {
    placement: number
    score: number
}

const JST_OFFSET = 9 * 60 * 60_000
const dayInJapan = (time: number) => Math.floor((time + JST_OFFSET) / DAY_MS)

export function dailyRankingChanges(snapshots: RankingSnapshot[]): Map<string, DailyRankingChange> {
    const ordered = [...snapshots].sort((a, b) => b.updatedAt - a.updatedAt)
    const latest = ordered[0]
    const changes = new Map<string, DailyRankingChange>()

    if (!latest) {
        return changes
    }

    const previousDay = dayInJapan(latest.updatedAt) - 1
    const previous = ordered.find((snapshot) => dayInJapan(snapshot.updatedAt) === previousDay)

    if (!previous) {
        return changes
    }

    const previousPlayers = uniqueEntries(previous)

    for (const [name, current] of uniqueEntries(latest)) {
        const before = previousPlayers.get(name)

        if (before) {
            changes.set(name, {
                placement: before.rank - current.rank,
                score: current.score - before.score,
            })
        }
    }

    return changes
}
