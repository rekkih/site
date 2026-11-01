import {MAIMAI_SERVERS, parseJstTimestamp, parseRanking, type RankingSnapshot} from '../shared/maimai'
import type {RankingExport} from './maimai-export'

export const CSV_COLUMNS = [
    'Record type', 'Version', 'Player', 'Score (%)', 'DX score', 'Source rank',
    'Site rank (snapshot)', 'Current status', 'Removed', 'Removal recorded at (UTC)',
    'Source updated at (JST)', 'Score recorded at (JST)', 'Collected at (UTC)',
    'Used in leaderboard history', 'Latest history snapshot', 'Duplicate name in snapshot',
    'Source row number', 'Source updated at (UTC)', 'Score recorded at (UTC)',
    'Roster updated at (JST)', 'Roster checked at (UTC)', 'Roster basis',
    'Collection status', 'Last collection check (UTC)', 'Next collection check (UTC)',
    'Collection warning', 'Record ID', 'Snapshot ID', 'Record data (JSON)',
    'CSV schema version',
] as const

type Column = typeof CSV_COLUMNS[number]
type Cell = string | number

type Row = Partial<Record<Column, Cell>>
const utc = (time: number) => new Date(time).toISOString()
const jst = (time: number) => new Date(time + 9 * 60 * 60_000).toISOString().slice(0, 19).replace('T', ' ')
const yesNo = (value: boolean) => value ? 'Yes' : 'No'

function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid saved export record')
    return value as Record<string, unknown>
}

function timestamp(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isFinite(new Date(value).getTime()))
        throw new Error('Invalid saved export timestamp')
    return value
}

function csvCell(value: Cell): string {
    let text = String(value)
    // Keep player-controlled values as text in spreadsheets. The exact original
    // strings remain available inside the JSON column, including leading symbols.
    if (typeof value === 'string' && /^(?:\s*[=+@-]|[\t\r\n])/.test(value)) text = `'${value}`
    return `"${text.replaceAll('"', '""')}"`
}

/** A flat, filterable export of every stored ranking record and source row. */
export function rankingsCsv(histories: RankingExport[]): string {
    const rows: Row[] = []
    for (const {server, records} of histories) {
        const prefix = `maimai:kop8th:${server}:`
        const snapshotPrefix = `${prefix}snapshot:`
        const snapshots = records.filter(({key}) => key.startsWith(snapshotPrefix)).map(({key, value}) => {
            const archive = object(value)
            const payload = object(archive.payload)
            const snapshot: RankingSnapshot = {...parseRanking(payload), collectedAt: timestamp(archive.collectedAt)}
            return {key, value, payload, snapshot}
        })
        const selected = new Map<number, string>()
        const candidates = [...snapshots].sort((a, b) =>
            Number(b.key === `${snapshotPrefix}${b.snapshot.updatedAt}`) - Number(a.key === `${snapshotPrefix}${a.snapshot.updatedAt}`) ||
            a.snapshot.collectedAt - b.snapshot.collectedAt || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
        for (const entry of candidates) if (!selected.has(entry.snapshot.updatedAt)) selected.set(entry.snapshot.updatedAt, entry.key)
        const latest = snapshots.filter((entry) => selected.get(entry.snapshot.updatedAt) === entry.key)
            .sort((a, b) => b.snapshot.updatedAt - a.snapshot.updatedAt)[0]
        const removed = new Map<string, number | null>()
        for (const {key, value} of records.filter(({key}) => key.startsWith(`${prefix}deleted:`))) {
            const marker = object(value)
            if (typeof marker.userName !== 'string') throw new Error(`Invalid removal record: ${key}`)
            const at = marker.deletedAt === undefined ? null : timestamp(marker.deletedAt)
            const prior = removed.get(marker.userName)
            if (!removed.has(marker.userName) || (at !== null && (prior == null || at < prior))) removed.set(marker.userName, at)
        }
        const savedRoster = records.find(({key}) => key === `${prefix}roster`)
        const roster = savedRoster ? object(savedRoster.value) : null
        if (roster && (!Array.isArray(roster.names) || !roster.names.every((name) => typeof name === 'string')))
            throw new Error('Invalid saved roster')
        const rosterNames = roster ? roster.names as string[] : latest?.snapshot.ranking.map((row) => row.userName)
        const currentNames = rosterNames ? new Set(rosterNames) : null
        const basis = roster ? 'Saved KOP roster' : latest ? 'Latest saved snapshot' : 'Unknown'

        function playerFields(name: string): Row {
            return {
                Player: name,
                Removed: removed.has(name) ? 'true' : 'false',
                'Removal recorded at (UTC)': removed.get(name) == null ? '' : utc(removed.get(name)!),
                'Current status': removed.has(name) ? 'Removed by moderator' : currentNames === null ? 'Unknown' :
                                                                               currentNames.has(name) ? 'Currently listed on KOP' : 'Not currently listed on KOP',
                'Roster basis': basis,
            }
        }

        function base(key: string, value: unknown): Row {
            return {
                Version: MAIMAI_SERVERS[server].label, 'Record ID': key,
                'Record data (JSON)': JSON.stringify(value), 'CSV schema version': 3,
            }
        }

        for (const {key, value, payload, snapshot} of snapshots.sort((a, b) =>
            a.snapshot.updatedAt - b.snapshot.updatedAt || a.snapshot.collectedAt - b.snapshot.collectedAt || a.key.localeCompare(b.key))) {
            const isSelected = selected.get(snapshot.updatedAt) === key
            const isLatest = latest?.key === key
            const common: Row = {
                ...base(key, value), 'Snapshot ID': key,
                'Source updated at (JST)': jst(snapshot.updatedAt), 'Source updated at (UTC)': utc(snapshot.updatedAt),
                'Collected at (UTC)': utc(snapshot.collectedAt), 'Used in leaderboard history': yesNo(isSelected),
                'Latest history snapshot': yesNo(isLatest),
            }
            // Snapshot records preserve the complete stored envelope, including empty
            // rankings and source fields that have no dedicated spreadsheet column.
            rows.push({...common, 'Record type': 'Snapshot'})
            const counts = new Map<string, number>()
            snapshot.ranking.forEach((row) => counts.set(row.userName, (counts.get(row.userName) ?? 0) + 1))
            const rerank = snapshot.ranking.some((row) => removed.has(row.userName))
            const siteRanks = new Map(snapshot.ranking.map((row, index) => ({row, index}))
                .filter(({row}) => !removed.has(row.userName)).sort((a, b) => a.row.rank - b.row.rank)
                .map(({row, index}, rank) => [index, rerank ? rank + 1 : row.rank]))
            snapshot.ranking.forEach((player, index) => {
                const recordAt = parseJstTimestamp(player.recordDate)
                const siteRank = isSelected && !(isLatest && roster && roster.updatedAt === snapshot.updatedAt && !currentNames?.has(player.userName))
                                 ? siteRanks.get(index) ?? '' : ''
                rows.push({
                    ...common, ...playerFields(player.userName), 'Record type': 'Score',
                    'Record ID': `${key}#row-${index + 1}`, 'Source row number': index + 1,
                    'Score (%)': (player.score / 10_000).toFixed(4),
                    'DX score': player.subScore, 'Source rank': player.rank, 'Site rank (snapshot)': siteRank,
                    'Score recorded at (JST)': jst(recordAt), 'Score recorded at (UTC)': utc(recordAt),
                    'Duplicate name in snapshot': yesNo((counts.get(player.userName) ?? 0) > 1),
                    'Record data (JSON)': JSON.stringify((payload.ranking as unknown[])[index]),
                })
            })
        }
        for (const {key, value} of records.filter(({key}) => !key.startsWith(snapshotPrefix)).sort((a, b) => a.key.localeCompare(b.key))) {
            const common = base(key, value)
            if (key.startsWith(`${prefix}deleted:`)) {
                const marker = object(value)
                rows.push({
                    ...common, ...playerFields(marker.userName as string), 'Record type': 'Moderator removal',
                    'Removal recorded at (UTC)': marker.deletedAt === undefined ? '' : utc(timestamp(marker.deletedAt)),
                })
                continue
            }
            const isEvent = key.startsWith(`${prefix}audit:v1:`)
            const event = isEvent ? object(value) : null
            if (event && event.schemaVersion !== 1) throw new Error('Unsupported saved audit version')
            const kind = event?.kind ?? (key === `${prefix}roster` ? 'roster' : key === `${prefix}check` ? 'check' : null)
            const data = kind === 'roster' || kind === 'check' ? object(event ? event.data : value) : null
            if (kind === 'roster' && data) {
                rows.push({
                    ...common, 'Record type': isEvent ? 'Roster observation' : 'Latest roster',
                    'Roster updated at (JST)': jst(timestamp(data.updatedAt)),
                    'Roster checked at (UTC)': utc(timestamp(data.checkedAt)),
                })
            } else if (kind === 'check' && data) {
                if (typeof data.status !== 'string' || !(data.warning === null || typeof data.warning === 'string'))
                    throw new Error('Invalid collection check')
                rows.push({
                    ...common, 'Record type': isEvent ? 'Collection check' : 'Latest collection check',
                    'Collection status': data.status, 'Collection warning': data.warning ?? '',
                    'Last collection check (UTC)': utc(timestamp(data.lastCheckedAt)),
                    'Next collection check (UTC)': utc(timestamp(data.nextCheckAt)),
                })
            } else {
                rows.push({...common, 'Record type': 'Other stored record'})
            }
        }
    }
    return '\uFEFF' + [CSV_COLUMNS.map(csvCell).join(','), ...rows.map((row) =>
        CSV_COLUMNS.map((column) => csvCell(row[column] ?? '')).join(','))].join('\r\n') + '\r\n'
}
