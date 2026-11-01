import type { MaimaiServer, RankingSnapshot } from '../shared/maimai'

interface CachedRankings {
    server: MaimaiServer
    snapshots: RankingSnapshot[]
    removedPlayers: string[]
}

function csvCell(value: string | number): string {
    let text = String(value)

    // Player-controlled names must remain text when opened in a spreadsheet.
    if (typeof value === 'string' && /^(?:\s*[=+@-]|[\t\r\n])/.test(text)) {
        text = `'${text}`
    }

    return `"${text.replaceAll('"', '""')}"`
}

export function rankingsCsv(histories: CachedRankings[]): string {
    const rows: (string | number)[][] = [
        [
            'server',
            'source_update',
            'collected_at_utc',
            'rank',
            'player_name',
            'score',
            'sub_score',
            'record_date_jst',
            'removed',
        ],
    ]

    for (const { server, snapshots, removedPlayers } of histories) {
        const removed = new Set(removedPlayers)
        for (const snapshot of snapshots) {
            for (const player of snapshot.ranking) {
                rows.push([
                    server,
                    snapshot.sourceUpdate,
                    new Date(snapshot.collectedAt).toISOString(),
                    player.rank,
                    player.userName,
                    player.score,
                    player.subScore,
                    player.recordDate,
                    removed.has(player.userName) ? 'true' : 'false',
                ])
            }
        }
    }

    // A UTF-8 BOM lets spreadsheet apps recognize Japanese names correctly.
    return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
