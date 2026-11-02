'use client'

import {useCallback, useEffect, useMemo, useRef, useState, type ReactNode} from 'react'
import {useTheme} from 'next-themes'
import {useLocalStorage} from 'usehooks-ts'
import {Button} from '@/components/ui/button'
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Tabs} from '@/components/ui/tabs'
import {Input} from '@/components/ui/input'
import {KopCrownIcon} from '@/components/icons/KopCrown'
import {Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu'
import {HugeiconsIcon} from '@hugeicons/react'
import {ArrowDown01Icon, Delete02Icon} from '@hugeicons/core-free-icons'
import {RankingChart} from './RankingChart'
import {displayPlayerName} from './player-name'
import {RankingsLoading} from './RankingsLoading'
import {RemovedPlayersInfo} from './RemovedPlayersInfo'
import {InvitationRank} from './InvitationRank'
import {QualifierCelebration} from './QualifierCelebration'
import {PlacementChange, ScoreChange} from './RankingChange'
import {dailyRankingChanges} from '@/lib/shared/maimai-changes'
import invitationStyles from './invitation.module.css'
import moderatorStyles from './moderator-controls.module.css'
import {rankingColors} from '@/lib/shared/maimai-colors'
import {
    filterSnapshots,
    excludeRankingPlayers,
    formatJst,
    formatScore,
    isInvitationPlace,
    isLcqPlace,
    latestStandings,
    MAIMAI_SERVERS,
    type MaimaiServer,
    type RankingHistory,
    type RankingMetric,
    RETRY_MS,
    searchableName,
    topTen,
    uniqueEntries,
} from '@/lib/shared/maimai'

type SortColumn = 'rank' | 'userName' | 'score'
type SortDirection = 'ascending' | 'descending'

interface StandingsSort {
    column: SortColumn
    direction: SortDirection
}

interface StandingsRow {
    userName: string
    rank: number | null
    score: number | null
    subScore: number | null
}

const METRIC_OPTIONS: { value: RankingMetric; label: string }[] = [
    {value: 'score', label: 'Score'},
    {value: 'subScore', label: 'DX'},
    {value: 'rank', label: 'Placement'},
]

const TABLE_COLUMNS: { column: SortColumn; label: string }[] = [
    {column: 'rank', label: 'Rank'},
    {column: 'userName', label: 'Player'},
    {column: 'score', label: 'Score'},
]

function compareStandings(a: StandingsRow, b: StandingsRow, sort: StandingsSort): number {
    const left = a[sort.column]
    const right = b[sort.column]
    const nameOrder = a.userName.localeCompare(b.userName, 'ja')

    // Missing ranks and scores remain at the end in either direction.
    if (left === null) {
        return right === null ? nameOrder : 1
    }

    if (right === null) {
        return -1
    }

    const valueOrder =
        typeof left === 'string' && typeof right === 'string'
        ? left.localeCompare(right, 'ja', {numeric: true, sensitivity: 'base'})
        : Number(left) - Number(right)
    const direction = sort.direction === 'ascending' ? 1 : -1

    return valueOrder * direction || nameOrder
}

function sortIndicator(column: SortColumn, sort: StandingsSort): string {
    if (sort.column !== column) {
        return '↕'
    }

    return sort.direction === 'ascending' ? '↑' : '↓'
}

export default function RankingsClient({server: selectedServer, initialData, initialError, initialNow, versionNavigation}: {
    server: MaimaiServer | null
    initialData?: RankingHistory
    initialError: string
    initialNow: number
    versionNavigation: ReactNode
}) {
    const {resolvedTheme} = useTheme()
    const [hydrated, setHydrated] = useState(false)
    useEffect(() => setHydrated(true), [])
    const valid = selectedServer !== null
    const server = selectedServer ?? 'international'
    const [histories, setHistories] = useState<Partial<Record<MaimaiServer, RankingHistory & {isMod: boolean}>>>(() =>
        initialData ? {[server]: {...initialData, isMod: false}} : {})
    const [modToken] = useLocalStorage<string | null>('canvas-mod-token', null, {
        initializeWithValue: false,
        // The moderation login stores a plain string, matching the chat reader.
        deserializer: (value) => value,
    })
    const [deleteTarget, setDeleteTarget] = useState<{server: MaimaiServer; userName: string} | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [deleteError, setDeleteError] = useState('')
    const deletedNames = useRef<Partial<Record<MaimaiServer, Set<string>>>>({})
    const deleteTrigger = useRef<HTMLButtonElement | null>(null)
    const cancelDelete = useRef<HTMLButtonElement | null>(null)
    const standingsRegion = useRef<HTMLDivElement | null>(null)
    const [selections, setSelections] = useState<Partial<Record<MaimaiServer, string[]>>>(() =>
        initialData ? {[server]: topTen(latestStandings(initialData))} : {})
    const [metric, setMetric] = useState<RankingMetric>('score')
    const [days, setDays] = useState<number | null>(null)
    const [search, setSearch] = useState('')
    const [sort, setSort] = useState<StandingsSort>({column: 'rank', direction: 'ascending'})
    const [showUnranked, setShowUnranked] = useState(false)
    const [loading, setLoading] = useState<MaimaiServer | null>(null)
    const [errors, setErrors] = useState<Partial<Record<MaimaiServer, string>>>(() => ({[server]: initialError}))
    const refreshRef = useRef<() => void>(() => {
    })

    useEffect(() => {
        if (!valid) {
            return
        }

        let cancelled = false
        let active: AbortController | null = null

        async function refresh() {
            if (active) {
                return
            }

            const controller = new AbortController()
            active = controller
            setLoading(server)

            try {
                const response = await fetch(
                    `/api/maimai/kop8th?server=${MAIMAI_SERVERS[server].queryValue}`,
                    {
                        cache: 'no-store',
                        signal: controller.signal,
                        headers: modToken ? {'x-mod-token': modToken} : {},
                    },
                )
                const data = await response.json()
                if (cancelled) {
                    return
                }

                if (data.server !== server || !Array.isArray(data.snapshots)) {
                    throw new Error(data.error ?? 'Unable to load rankings. Please try again.')
                }

                if (!response.ok && response.status !== 503) {
                    throw new Error('Unable to load rankings. Please try again.')
                }

                // A refresh started before deletion must not restore that player.
                data.snapshots = data.snapshots.map((snapshot: RankingHistory['snapshots'][number]) =>
                    excludeRankingPlayers(snapshot, deletedNames.current[server] ?? new Set()))
                data.removedPlayers = [...new Set<string>([
                    ...(data.removedPlayers ?? []),
                    ...(deletedNames.current[server] ?? []),
                ])].sort((a, b) => a.localeCompare(b, 'ja'))
                setHistories((previous) => ({...previous, [server]: data}))
                setErrors((previous) => ({...previous, [server]: ''}))
                if (data.snapshots.length) {
                    setSelections((previous) =>
                        previous[server] === undefined
                        ? {...previous, [server]: topTen(latestStandings(data))}
                        : previous,
                    )
                }
            } catch (error) {
                if (!cancelled && !controller.signal.aborted) {
                    setErrors((previous) => ({
                        ...previous,
                        [server]:
                            error instanceof Error ? error.message : 'Unable to load rankings.',
                    }))
                }
            } finally {
                active = null
                if (!cancelled) {
                    setLoading(null)
                }
            }
        }

        refreshRef.current = refresh
        // Public data already arrived in the HTML. Only authenticate a moderator
        // on mount; later refreshes still use the protected, uncached API.
        if (modToken) void refresh()
        const visibleRefresh = () => {
            if (document.visibilityState === 'visible') {
                void refresh()
            }
        }
        const interval = setInterval(visibleRefresh, RETRY_MS)
        document.addEventListener('visibilitychange', visibleRefresh)

        return () => {
            cancelled = true
            active?.abort()
            clearInterval(interval)
            document.removeEventListener('visibilitychange', visibleRefresh)
        }
    }, [server, valid, modToken])

    const data = histories[server]
    const latest = useMemo(() => latestStandings(data), [data])
    const currentSnapshots = useMemo(() => data?.snapshots.map((snapshot, index) =>
        index === data.snapshots.length - 1 && latest ? latest : snapshot) ?? [], [data, latest])
    const isMod = Boolean(modToken && data?.isMod)
    const changes = useMemo(() => dailyRankingChanges(currentSnapshots), [currentSnapshots])
    const names = useMemo(
        () =>
            [
                ...new Set(
                    data?.snapshots.flatMap((snapshot) =>
                        snapshot.ranking.map((row) => row.userName),
                    ) ?? [],
                ),
            ].sort((a, b) => a.localeCompare(b, 'ja')),
        [data],
    )
    const colors = useMemo(
        () => rankingColors(names, topTen(latest), hydrated && resolvedTheme === 'dark'),
        [names, latest, hydrated, resolvedTheme],
    )
    const selected = (selections[server] ?? []).filter((name) => names.includes(name))
    const filtered = useMemo(() => filterSnapshots(data?.snapshots ?? [], days), [data, days])
    const latestUnique = useMemo(() => (latest ? uniqueEntries(latest) : new Map()), [latest])
    const standings = useMemo(() => {
        const current = [...(latest?.ranking ?? [])].sort((a, b) => a.rank - b.rank)
        const present = new Set(current.map((row) => row.userName))
        const lastKnown = new Map(data?.snapshots.flatMap((snapshot) =>
            snapshot.ranking.map((row) => [row.userName, row] as const)))
        const historical = [...lastKnown.values()]
            .filter((row) => !present.has(row.userName))
            .map((row) => ({...row, rank: null}))
        return [...current, ...historical]
            .filter((row) => searchableName(row.userName).includes(searchableName(search)))
            .sort((a, b) => compareStandings(a, b, sort))
    }, [data, latest, search, sort])
    const unrankedCount = standings.filter((row) => row.rank === null).length
    const visibleStandings = showUnranked
        ? standings
        : standings.filter((row) => row.rank !== null)
    const toggle = useCallback(
        (name: string) => {
            setSelections((previous) => {
                const current = previous[server] ?? []
                const next = current.includes(name)
                             ? current.filter((value) => value !== name)
                             : [...current, name]

                return {...previous, [server]: next}
            })
        },
        [server],
    )

    function resetPlayers() {
        setSelections((previous) => ({...previous, [server]: topTen(latest)}))
        setSearch('')
    }

    function changeSort(column: SortColumn) {
        setSort((previous) => {
            let direction: SortDirection = column === 'score' ? 'descending' : 'ascending'

            if (previous.column === column) {
                direction = previous.direction === 'ascending' ? 'descending' : 'ascending'
            }

            return {column, direction}
        })
    }

    async function deleteScores() {
        if (!deleteTarget || deleting || !modToken) return
        const {server: targetServer, userName} = deleteTarget
        setDeleting(true)
        setDeleteError('')
        try {
            const response = await fetch(`/api/maimai/kop8th?server=${MAIMAI_SERVERS[targetServer].queryValue}`, {
                method: 'DELETE',
                headers: {'Content-Type': 'application/json', 'x-mod-token': modToken},
                body: JSON.stringify({userName}),
            })
            const result = await response.json()
            if (!response.ok) throw new Error(result.error ?? 'Scores could not be deleted.')
            const deleted = deletedNames.current[targetServer] ??= new Set<string>()
            deleted.add(userName)
            setHistories((previous) => {
                const history = previous[targetServer]
                if (!history) return previous
                return {...previous, [targetServer]: {...history,
                    currentPlayers: history.currentPlayers?.filter((name) => name !== userName) ?? [],
                    removedPlayers: [...new Set([...history.removedPlayers, userName])].sort((a, b) => a.localeCompare(b, 'ja')),
                    snapshots: history.snapshots.map((snapshot) => excludeRankingPlayers(snapshot, deleted)),
                }}
            })
            setDeleteTarget(null)
        } catch (error) {
            setDeleteError(error instanceof Error ? error.message : 'Scores could not be deleted.')
        } finally {
            setDeleting(false)
        }
    }

    return (
        <>
            <Dialog open={deleteTarget !== null} onOpenChange={(open) => {
                if (!open && !deleting) setDeleteTarget(null)
            }}>
                <DialogContent showCloseButton={false}
                    onOpenAutoFocus={(event) => {event.preventDefault(); cancelDelete.current?.focus()}}
                    onCloseAutoFocus={(event) => {
                        event.preventDefault()
                        if (deleteTrigger.current?.isConnected) deleteTrigger.current.focus()
                        else standingsRegion.current?.focus()
                    }}>
                    <DialogHeader>
                        <DialogTitle>Delete all scores for {deleteTarget ? displayPlayerName(deleteTarget.userName) : ''}?</DialogTitle>
                        <DialogDescription>
                            This removes the player from the {deleteTarget && MAIMAI_SERVERS[deleteTarget.server].label} leaderboard and chart history. Their scores remain in CSV downloads, marked as removed. Future updates will not add them back to the leaderboard.
                        </DialogDescription>
                    </DialogHeader>
                    {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
                    <DialogFooter>
                        <Button ref={cancelDelete} variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancel</Button>
                        <Button variant="destructive" disabled={deleting} onClick={deleteScores}>
                            {deleting ? 'Deleting…' : 'Delete all scores'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-8">
                {versionNavigation}
            </div>
            {!valid ? (
                <p role="alert" className="py-16 text-sm">
                    Unknown version. Choose International or Japan Ver. above.
                </p>
            ) : (
                 <>
                     <QualifierCelebration
                         key={server}
                         server={server}
                         snapshots={currentSnapshots}
                         initialNow={initialNow}
                     />
                     {!data && !errors[server] && <RankingsLoading/>}
                     {(errors[server] || data?.warning) && (
                         <div
                             role="status"
                             className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-border py-4 text-sm text-muted-foreground"
                         >
                             <p className="max-w-xl">{errors[server] || data?.warning}</p>
                             <Button
                                 variant="outline"
                                 size="sm"
                                 disabled={loading === server}
                                 onClick={() => refreshRef.current()}
                             >
                                 Try again
                             </Button>
                         </div>
                     )}
                     {data && (
                         <>
                             <section
                                 aria-label={`${MAIMAI_SERVERS[server].label} ranking history`}
                                 className="py-8"
                             >
                                 <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                                     <div>
                                         <h2 className="font-semibold">Ranking history</h2>
                                     </div>
                                     <Tabs
                                         label="Chart metric"
                                         value={metric}
                                         options={METRIC_OPTIONS}
                                         onChange={setMetric}
                                     />
                                 </div>
                                 {latest ? (
                                     <>
                                         <div
                                             className="mb-4 flex min-h-9 flex-wrap gap-2"
                                             aria-label="Selected players"
                                         >
                                             {selected.map((name) => (
                                                 <Button
                                                     key={name}
                                                     variant="ghost"
                                                     size="xs"
                                                     className="px-0 pr-2"
                                                     onClick={() => toggle(name)}
                                                     aria-label={`Remove ${displayPlayerName(name)} from chart`}
                                                 >
                                                    <span
                                                        className="size-2 rounded-full"
                                                        style={{background: colors.get(name)}}
                                                    />
                                                     {displayPlayerName(name)}
                                                     {isInvitationPlace(
                                                         server,
                                                         latestUnique.get(name)?.rank ?? null,
                                                     ) && (
                                                          <KopCrownIcon
                                                              className={`size-3.5 ${invitationStyles.crown}`}
                                                          />
                                                      )}
                                                     {isLcqPlace(
                                                         server,
                                                         latestUnique.get(name)?.rank ?? null,
                                                     ) && (
                                                          <span
                                                              className={`text-[0.625rem] font-semibold ${invitationStyles.lcqMarker}`}
                                                              aria-label="Last Chance Qualifier place"
                                                          >
                                                            LCQ
                                                        </span>
                                                      )}
                                                     <span
                                                         aria-hidden="true"
                                                         className="ml-1 text-muted-foreground"
                                                     >
                                                        ×
                                                    </span>
                                                 </Button>
                                             ))}
                                         </div>
                                         <RankingChart
                                             key={server}
                                             snapshots={filtered}
                                             names={selected}
                                             colors={colors}
                                             metric={metric}
                                         />
                                         <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                                             <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                 <span>Range</span>
                                                 <DropdownMenu>
                                                     <DropdownMenuTrigger asChild>
                                                         <Button
                                                             variant="outline"
                                                             size="sm"
                                                             aria-label={`History range: ${days ? `${days} days` : 'All'}`}
                                                         >
                                                             {days ? `${days} days` : 'All'}
                                                             <HugeiconsIcon
                                                                 icon={ArrowDown01Icon}
                                                                 size={16}
                                                             />
                                                         </Button>
                                                     </DropdownMenuTrigger>
                                                     <DropdownMenuContent align="start">
                                                         {([7, 30, null] as const).map((value) => (
                                                             <DropdownMenuItem
                                                                 key={value ?? 'all'}
                                                                 onSelect={() => setDays(value)}
                                                             >
                                                                 {value ? `${value} days` : 'All'}
                                                                 {days === value && (
                                                                     <span
                                                                         className="ml-auto"
                                                                         aria-label="Selected"
                                                                     >
                                                                        ✓
                                                                    </span>
                                                                 )}
                                                             </DropdownMenuItem>
                                                         ))}
                                                     </DropdownMenuContent>
                                                 </DropdownMenu>
                                             </div>
                                             <span className="text-xs text-muted-foreground">
                                                {loading === server
                                                 ? 'Checking for updates…'
                                                 : `Updated ${formatJst(latest.updatedAt, true)} JST`}
                                            </span>
                                         </div>
                                     </>
                                 ) : (
                                      <div className="py-20 text-center text-sm text-muted-foreground">
                                          No saved history yet. The first successful visit will start
                                          collecting rankings.
                                      </div>
                                  )}
                             </section>

                             {latest && (
                                 <section
                                     className="border-t border-border py-7"
                                     aria-labelledby="standings-heading"
                                 >
                                     <div className="flex flex-wrap items-center justify-between gap-3">
                                         <h2 id="standings-heading" className="font-semibold">
                                             Players{' '}
                                             <span className="ml-2 text-sm font-normal text-muted-foreground">
                                                {selected.length} selected
                                            </span>
                                         </h2>
                                         <div className="flex items-center gap-1">
                                             <RemovedPlayersInfo key={server} players={data.removedPlayers}/>
                                             <Button size="sm" variant="ghost" onClick={resetPlayers}>
                                                 Reset to top 10
                                             </Button>
                                         </div>
                                     </div>
                                     <p className="mt-3 text-sm text-muted-foreground">
                                         Gold marks the current top{' '}
                                         {MAIMAI_SERVERS[server].invitationPlaces} invitation places.
                                         {server === 'international'
                                          ? ' The top two earn invitation places for KOP in Japan; travel reimbursement is under consideration by SEGA.'
                                          : ' These players are invited to the KOP in-person event. Blue marks 8th-15th places for the' +
                                            ' Last Chance Qualifier (LCQ).'}
                                     </p>
                                     <label htmlFor="player-search" className="sr-only">
                                         Search players from all saved updates
                                     </label>
                                     <Input
                                         id="player-search"
                                         type="search"
                                         value={search}
                                         onChange={(event) => setSearch(event.target.value)}
                                         placeholder="Find a player…"
                                         className="my-4 h-11 max-w-sm"
                                     />
                                     <p className="mb-2 text-xs text-muted-foreground sm:hidden">
                                         Swipe horizontally to see all columns.
                                     </p>
                                     <div
                                         className="max-w-full overflow-x-auto overscroll-x-contain"
                                         role="region"
                                         ref={standingsRegion}
                                         aria-label="Player standings, scroll horizontally to see all columns"
                                         tabIndex={0}
                                     >
                                         <div className={isMod ? "min-w-[37.5rem] pr-6" : undefined}>
                                         <Table
                                             className="min-w-[36rem]"
                                             selection={{
                                                 selectedKeys: selected,
                                                 onSelectionChange: (keys) =>
                                                     setSelections((previous) => ({
                                                         ...previous,
                                                         [server]: keys,
                                                     })),
                                             }}
                                         >
                                             <TableCaption className="sr-only">
                                                 {MAIMAI_SERVERS[server].label} players and latest
                                                 standings. Select a player to toggle their chart
                                                 line. Unranked players retain their last recorded scores.
                                             </TableCaption>
                                             <TableHeader>
                                                 <TableRow>
                                                     {TABLE_COLUMNS.map(({column, label}) => (
                                                         <TableHead
                                                             key={column}
                                                             aria-sort={
                                                                 sort.column === column
                                                                 ? sort.direction
                                                                 : 'none'
                                                             }
                                                             className={
                                                                 column === 'score'
                                                                 ? 'text-right'
                                                                 : undefined
                                                             }
                                                         >
                                                             <Button
                                                                 variant="ghost"
                                                                 size="sm"
                                                                 className="h-auto min-h-10 gap-1 px-0 text-sm text-muted-foreground"
                                                                 onClick={() => changeSort(column)}
                                                             >
                                                                 {label}
                                                                 <span aria-hidden="true">
                                                                    {sortIndicator(column, sort)}
                                                                </span>
                                                             </Button>
                                                         </TableHead>
                                                     ))}
                                                     {isMod && <TableHead className="relative"><span className="sr-only">Moderation</span></TableHead>}
                                                 </TableRow>
                                             </TableHeader>
                                             <TableBody>
                                                 {visibleStandings.map((row, index) => (
                                                     <TableRow
                                                         key={`${row.userName}:${index}`}
                                                         selectionKey={row.userName}
                                                         selectionLabel={displayPlayerName(row.userName)}
                                                         className={`${moderatorStyles.surface} ${
                                                             isInvitationPlace(server, row.rank)
                                                             ? invitationStyles.row
                                                             : isLcqPlace(server, row.rank)
                                                               ? invitationStyles.lcqRow
                                                               : ''
                                                         }`}
                                                         data-invitation={
                                                             isInvitationPlace(server, row.rank) ||
                                                             undefined
                                                         }
                                                         data-lcq={
                                                             isLcqPlace(server, row.rank) ||
                                                             undefined
                                                         }
                                                     >
                                                         <TableCell className="tabular-nums text-muted-foreground">
                                                             <div className="flex items-center gap-2">
                                                                 <InvitationRank
                                                                     server={server}
                                                                     rank={row.rank}
                                                                 />
                                                                 <PlacementChange
                                                                     change={changes.get(
                                                                         row.userName,
                                                                     )}
                                                                 />
                                                             </div>
                                                         </TableCell>
                                                         <TableCell className="py-1">
                                                             <div className="flex min-h-11 items-center gap-2">
                                                                {selected.includes(row.userName) && (
                                                                    <span
                                                                        className="size-2 shrink-0 rounded-full"
                                                                        style={{
                                                                            background: colors.get(
                                                                                row.userName,
                                                                            ),
                                                                        }}
                                                                    />
                                                                )}
                                                                 <span className="whitespace-nowrap">
                                                                    {displayPlayerName(row.userName)}
                                                                     {row.rank !== null &&
                                                                      !latestUnique.has(
                                                                          row.userName,
                                                                      ) && (
                                                                          <span className="ml-2 text-xs text-muted-foreground">
                                                                                Duplicate name
                                                                            </span>
                                                                      )}
                                                                </span>
                                                                 {row.rank === null && (
                                                                     <span className="text-xs text-muted-foreground">
                                                                         Not currently ranked
                                                                     </span>
                                                                 )}
                                                             </div>
                                                         </TableCell>
                                                         <TableCell className="whitespace-nowrap text-right tabular-nums">
                                                             {row.rank === null && (
                                                                 <div className="text-xs text-muted-foreground">Last recorded</div>
                                                             )}
                                                             <div>
                                                                 {row.score === null ? '—' : formatScore(row.score)}
                                                             </div>
                                                             {row.subScore !== null && (
                                                                 <div className="text-xs text-muted-foreground">
                                                                     (DX Score: {row.subScore.toLocaleString('en-US')})
                                                                 </div>
                                                             )}
                                                             <ScoreChange
                                                                 change={changes.get(row.userName)}
                                                             />
                                                         </TableCell>
                                                         {isMod && (
                                                             <TableCell className="relative w-10 p-0">
                                                                 <Button variant="secondary" size="icon-xs"
                                                                     className={`${moderatorStyles.control} ${moderatorStyles.badge} ${moderatorStyles.floating} text-destructive hover:bg-destructive/15 hover:text-destructive`}
                                                                     aria-label={`Delete all scores for ${displayPlayerName(row.userName)}`}
                                                                     title={`Delete all scores for ${displayPlayerName(row.userName)}`}
                                                                     onClick={(event) => {
                                                                         deleteTrigger.current = event.currentTarget
                                                                         setDeleteError('')
                                                                         setDeleteTarget({server, userName: row.userName})
                                                                     }}>
                                                                     <HugeiconsIcon icon={Delete02Icon} className="size-3.5" aria-hidden="true"/>
                                                                 </Button>
                                                             </TableCell>
                                                         )}
                                                     </TableRow>
                                                 ))}
                                                 {!visibleStandings.length && (
                                                     <TableRow>
                                                         <TableCell
                                                             colSpan={isMod ? 4 : 3}
                                                             className="py-8 text-center text-sm text-muted-foreground"
                                                         >
                                                             {unrankedCount
                                                              ? search
                                                                ? 'No currently ranked players match your search.'
                                                                : 'No players currently ranked.'
                                                              : 'No players match your search.'}
                                                         </TableCell>
                                                     </TableRow>
                                                 )}
                                             </TableBody>
                                         </Table>
                                         </div>
                                     </div>
                                     {unrankedCount > 0 && (
                                         <Button
                                             variant="ghost"
                                             size="sm"
                                             className="mt-3"
                                             aria-expanded={showUnranked}
                                             onClick={() => setShowUnranked((current) => !current)}
                                         >
                                             {showUnranked ? 'Hide unranked' : `Show unranked (${unrankedCount})`}
                                         </Button>
                                     )}
                                 </section>
                             )}
                         </>
                     )}
                 </>
             )}
        </>
    )
}
