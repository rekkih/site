import { ArrowUpIcon, ArrowRightIcon, ArrowDownIcon } from '@heroicons/react/20/solid'
import type { DailyRankingChange } from '@/lib/shared/maimai-changes'

export function PlacementChange({ change }: { change?: DailyRankingChange }) {
    if (!change) {
        return null
    }

    const places = Math.abs(change.placement)
    const direction = change.placement > 0 ? 'up' : change.placement < 0 ? 'down' : 'unchanged'
    const Icon =
        direction === 'up' ? ArrowUpIcon : direction === 'down' ? ArrowDownIcon : ArrowRightIcon
    const color =
        direction === 'up'
            ? 'text-green-600 dark:text-green-400'
            : direction === 'down'
              ? 'text-destructive'
              : 'text-muted-foreground'
    const description =
        direction === 'unchanged'
            ? 'Placement unchanged since the previous day'
            : `Moved ${direction} ${places} ${places === 1 ? 'place' : 'places'} since the previous day`

    return (
        <span
            role="img"
            aria-label={description}
            title={description}
            className={`inline-flex items-center gap-0.5 text-xs tabular-nums ${color}`}
        >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {places > 0 && <span aria-hidden="true">{places}</span>}
        </span>
    )
}

export function ScoreChange({ change }: { change?: DailyRankingChange }) {
    if (!change) {
        return null
    }

    const sign = change.score > 0 ? '+' : change.score < 0 ? '−' : '±'
    const color =
        change.score > 0
            ? 'text-green-600 dark:text-green-400'
            : change.score < 0
              ? 'text-destructive'
              : 'text-muted-foreground'

    return (
        <span className={`relative mt-0.5 block text-xs tabular-nums ${color}`}>
            {sign}
            {Math.abs(change.score).toLocaleString('en-US')}
            <span className="sr-only"> score change since the previous day</span>
        </span>
    )
}
