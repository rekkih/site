import type {MaimaiServer} from '../shared/maimai'

/** Complete persisted records, before CSV presentation or leaderboard filtering. */
export interface RankingExport {
    server: MaimaiServer
    records: {key: string; value: unknown}[]
}

export interface RankingAuditEvent {
    schemaVersion: 1
    kind: 'roster' | 'check'
    recordedAt: number
    data: unknown
}
