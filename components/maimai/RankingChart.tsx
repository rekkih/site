'use client'

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
    formatJst,
    type RankingMetric,
    type RankingSnapshot,
    uniqueEntries,
} from '@/lib/shared/maimai'

export function RankingChart({
    snapshots,
    names,
    colors,
    metric,
}: {
    snapshots: RankingSnapshot[]
    names: string[]
    colors: Map<string, string>
    metric: RankingMetric
}) {
    const container = useRef<HTMLDivElement>(null)
    const [width, setWidth] = useState(700)
    const [hover, setHover] = useState<number | null>(null)
    const descriptionId = useId()
    useEffect(() => {
        const observer = new ResizeObserver(([entry]) =>
            setWidth(Math.max(260, entry.contentRect.width)),
        )
        if (container.current) observer.observe(container.current)
        return () => observer.disconnect()
    }, [])

    const rows = useMemo(() => snapshots.map(uniqueEntries), [snapshots])
    const series = useMemo(
        () =>
            names.map((name) => ({
                name,
                values: rows.map((row) => row.get(name)?.[metric] ?? null),
            })),
        [names, rows, metric],
    )
    const values = series.flatMap((line) =>
        line.values.filter((value): value is number => value !== null),
    )
    let minimum = values[0] ?? 0
    let maximum = values[0] ?? 1

    for (const value of values) {
        minimum = Math.min(minimum, value)
        maximum = Math.max(maximum, value)
    }

    const min = metric === 'rank' ? 1 : minimum
    const max = metric === 'rank' ? Math.max(5, maximum) : maximum
    const padding = metric === 'rank' ? 0 : Math.max(1, (max - min) * 0.12)
    const lower = min - padding
    const upper = max + padding
    const left = 12
    const right = width - (metric === 'rank' ? 48 : 88)
    const top = 24
    const bottom = 278
    const firstTime = snapshots[0]?.updatedAt ?? 0
    const lastTime = snapshots.at(-1)?.updatedAt ?? firstTime
    const x = (index: number) =>
        firstTime === lastTime
            ? (left + right) / 2
            : left +
              ((snapshots[index].updatedAt - firstTime) / (lastTime - firstTime)) * (right - left)
    const y = (value: number) =>
        metric === 'rank'
            ? top + ((value - lower) / (upper - lower)) * (bottom - top)
            : bottom - ((value - lower) / (upper - lower)) * (bottom - top)
    const ticks = [
        ...new Set(
            Array.from({ length: 5 }, (_, i) => Math.round(lower + ((upper - lower) * i) / 4)),
        ),
    ]
    const active =
        hover === null || !snapshots.length ? null : Math.min(hover, snapshots.length - 1)
    const empty = !values.length
    const formatValue = (value: number) =>
        metric === 'rank' ? `#${value}` : value.toLocaleString('en-US')
    const dateIndices = [
        ...new Set([
            0,
            ...(width > 480 ? [Math.floor((snapshots.length - 1) / 2)] : []),
            snapshots.length - 1,
        ]),
    ].filter((index) => index >= 0 && index < snapshots.length)

    function inspectPointer(event: PointerEvent<HTMLDivElement>) {
        if (empty) {
            return
        }

        const pointerX = event.clientX - event.currentTarget.getBoundingClientRect().left
        let closest = 0

        for (let index = 1; index < snapshots.length; index++) {
            const distance = Math.abs(x(index) - pointerX)
            const closestDistance = Math.abs(x(closest) - pointerX)

            if (distance < closestDistance) {
                closest = index
            }
        }

        setHover(closest)
    }

    return (
        <div ref={container} className="relative">
            <p id={descriptionId} className="sr-only">
                {metric === 'rank' ? 'Placement, with first place at the top.' : 'Score history.'}{' '}
                Use left and right arrow keys to inspect saved dates, Home or End to jump, and
                Escape to dismiss details. Gaps indicate missing or ambiguous player names.
            </p>
            <div
                className="relative rounded-lg outline-offset-4"
                role="group"
                tabIndex={empty ? -1 : 0}
                aria-label={`${metric === 'rank' ? 'Placement' : 'Score'} history chart`}
                aria-describedby={descriptionId}
                onFocus={() => {
                    if (!empty) setHover(snapshots.length - 1)
                }}
                onBlur={() => setHover(null)}
                onKeyDown={(event) => {
                    if (empty) return
                    if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key))
                        event.preventDefault()
                    if (event.key === 'ArrowLeft')
                        setHover((index) => Math.max(0, (index ?? snapshots.length) - 1))
                    if (event.key === 'ArrowRight')
                        setHover((index) => Math.min(snapshots.length - 1, (index ?? -1) + 1))
                    if (event.key === 'Home') setHover(0)
                    if (event.key === 'End') setHover(snapshots.length - 1)
                    if (event.key === 'Escape') setHover(null)
                }}
                onPointerMove={inspectPointer}
                onPointerDown={inspectPointer}
                onPointerLeave={(event) => {
                    if (event.pointerType !== 'touch') setHover(null)
                }}
            >
                <svg
                    width="100%"
                    height="320"
                    viewBox={`0 0 ${width} 320`}
                    aria-hidden="true"
                    className="overflow-visible touch-pan-y"
                >
                    {!empty &&
                        ticks.map((tick) => (
                            <g key={tick}>
                                <line
                                    x1={left}
                                    x2={right}
                                    y1={y(tick)}
                                    y2={y(tick)}
                                    stroke="var(--border)"
                                    strokeDasharray="3 5"
                                />
                                <text
                                    x={right + 12}
                                    y={y(tick) + 4}
                                    fontSize="11"
                                    fill="var(--muted-foreground)"
                                    className="tabular-nums"
                                >
                                    {formatValue(tick)}
                                </text>
                            </g>
                        ))}
                    {!empty &&
                        series.map(({ name, values: points }) => {
                            let connected = false
                            const path = points
                                .map((value, index) => {
                                    if (value === null) {
                                        connected = false
                                        return ''
                                    }
                                    const segment = `${connected ? 'L' : 'M'}${x(index)},${y(value)}`
                                    connected = true
                                    return segment
                                })
                                .join(' ')
                            return (
                                <g key={name} stroke={colors.get(name)} fill={colors.get(name)}>
                                    <path
                                        d={path}
                                        fill="none"
                                        strokeWidth="2"
                                        strokeLinejoin="round"
                                        strokeLinecap="round"
                                    />
                                    {points.map((value, index) =>
                                        value !== null &&
                                        (index === points.length - 1 ||
                                            points[index + 1] === null ||
                                            index === active ||
                                            (points[index - 1] == null &&
                                                points[index + 1] == null)) ? (
                                            <circle
                                                key={index}
                                                cx={x(index)}
                                                cy={y(value)}
                                                r={index === active ? 4 : 3}
                                                stroke="var(--background)"
                                                strokeWidth="1.5"
                                            />
                                        ) : null,
                                    )}
                                </g>
                            )
                        })}
                    {!empty && active !== null && (
                        <line
                            x1={x(active)}
                            x2={x(active)}
                            y1={top}
                            y2={bottom}
                            stroke="var(--muted-foreground)"
                            strokeDasharray="3 4"
                            opacity="0.55"
                        />
                    )}
                    {dateIndices.map((index) => (
                        <text
                            key={index}
                            x={x(index)}
                            y={310}
                            textAnchor={
                                snapshots.length === 1
                                    ? 'middle'
                                    : index === 0
                                      ? 'start'
                                      : index === snapshots.length - 1
                                        ? 'end'
                                        : 'middle'
                            }
                            fontSize="11"
                            fill="var(--muted-foreground)"
                        >
                            {formatJst(snapshots[index].updatedAt)}
                        </text>
                    ))}
                </svg>
                {empty && (
                    <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
                        {names.length
                            ? 'No unambiguous observations for these players in this range.'
                            : 'Select players below to compare their history.'}
                    </div>
                )}
                {!empty && active !== null && (
                    <Tooltip open>
                        <TooltipTrigger asChild>
                            <span
                                className="pointer-events-none absolute top-12 size-px"
                                style={{ left: x(active) }}
                            />
                        </TooltipTrigger>
                        <TooltipContent
                            side="top"
                            sideOffset={12}
                            className="pointer-events-none block max-h-64 max-w-[min(20rem,90vw)] overflow-y-auto border border-border bg-popover text-popover-foreground shadow-sm [&>svg]:hidden"
                        >
                            <p className="mb-2 text-xs text-muted-foreground">
                                {formatJst(snapshots[active].updatedAt, true)} JST
                            </p>
                            {series.map((line) => (
                                <div
                                    key={line.name}
                                    className="flex items-center justify-between gap-6 py-0.5 text-sm"
                                >
                                    <span className="flex min-w-0 items-center gap-2">
                                        <span
                                            className="size-2 shrink-0 rounded-full"
                                            style={{ background: colors.get(line.name) }}
                                        />
                                        <span className="truncate">{line.name}</span>
                                    </span>
                                    <span className="shrink-0 tabular-nums">
                                        {line.values[active] === null
                                            ? '—'
                                            : formatValue(line.values[active]!)}
                                    </span>
                                </div>
                            ))}
                        </TooltipContent>
                    </Tooltip>
                )}
            </div>
            <p className="sr-only" aria-live="polite">
                {active !== null && !empty
                    ? `${formatJst(snapshots[active].updatedAt, true)} JST. ${series.map((line) => `${line.name}: ${line.values[active] === null ? 'not listed or ambiguous' : formatValue(line.values[active]!)}`).join('. ')}`
                    : ''}
            </p>
        </div>
    )
}
