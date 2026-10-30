import {
    MAIMAI_SERVERS,
    isLcqPlace,
    type MaimaiServer,
    type RankingEntry,
    type RankingSnapshot,
} from './maimai'

// Both official schedules end on 23 November 2026 at 23:59 JST.
// Use the following midnight as the exclusive end of the qualifying period.
export const QUALIFIERS_CLOSE_AT = Date.parse('2026-11-24T00:00:00+09:00')

export const QUALIFIER_RULES = {
    international: 'https://maimai.sega.com/kop8th/maimai_itr_en/',
    japan: 'https://maimai.sega.jp/kop8th/maimai/',
} as const

export type QualifierOutcome =
    | { status: 'ongoing' }
    | { status: 'awaiting-final-update' }
    | {
          status: 'complete'
          snapshot: RankingSnapshot
          players: RankingEntry[]
          lcqPlayers: RankingEntry[]
      }

export function qualifierOutcome(
    server: MaimaiServer,
    snapshots: RankingSnapshot[],
    now: number,
): QualifierOutcome {
    if (now < QUALIFIERS_CLOSE_AT) {
        return { status: 'ongoing' }
    }

    const snapshot = snapshots
        .filter((entry) => entry.updatedAt >= QUALIFIERS_CLOSE_AT && entry.updatedAt <= now)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0]
    const places = MAIMAI_SERVERS[server].invitationPlaces

    if (!snapshot || snapshot.ranking.length < places) {
        return { status: 'awaiting-final-update' }
    }

    // SEGA's feed order resolves equal ranks by DX score and achievement time.
    // Keep that order for ties and select places, rather than every tied rank.
    const standings = [...snapshot.ranking].sort((a, b) => a.rank - b.rank)
    const players = standings.slice(0, places)
    const lcqPlayers = standings.filter((player) => isLcqPlace(server, player.rank)).slice(0, 8)

    // Do not promote a truncated feed with missing leading places to final results.
    if (players[0].rank !== 1 || players.some((player) => player.rank > places)) {
        return { status: 'awaiting-final-update' }
    }

    return { status: 'complete', snapshot, players, lcqPlayers }
}
