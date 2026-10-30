'use client'

import {useEffect, useState} from 'react'
import {KopCrownIcon} from '@/components/icons/KopCrown'
import {formatJst, formatScore, type MaimaiServer, type RankingEntry, type RankingSnapshot} from '@/lib/shared/maimai'
import {QUALIFIER_RULES, qualifierOutcome, QUALIFIERS_CLOSE_AT} from '@/lib/shared/maimai-qualifiers'
import styles from './qualifiers.module.css'

interface QualifierCelebrationProps {
    server: MaimaiServer
    snapshots: RankingSnapshot[]
}

function QualifierList({
    players,
    startPlace = 1,
}: {
    players: RankingEntry[]
    startPlace?: number
}) {
    return (
        <ol className={styles.players} start={startPlace}>
            {players.map((player, index) => (
                <li key={`${player.userName}:${index}`} className={styles.player}>
                    <span className={styles.place}>
                        <span className="sr-only">Qualifying place </span>
                        {String(player.rank).padStart(2, '0')}
                    </span>
                    <h3 className={styles.name}>{player.userName}</h3>
                    <span className={styles.score}>
                        <span className="sr-only">Score </span>
                        {formatScore(player.score)}
                    </span>
                </li>
            ))}
        </ol>
    )
}

export function QualifierCelebration({server, snapshots}: QualifierCelebrationProps) {
    const [now, setNow] = useState<number | null>(null)

    useEffect(() => {
        setNow(Date.now())
        if (Date.now() >= QUALIFIERS_CLOSE_AT) return

        const timer = setInterval(() => {
            const current = Date.now()
            setNow(current)
            if (current >= QUALIFIERS_CLOSE_AT) clearInterval(timer)
        }, 1_000)
        return () => clearInterval(timer)
    }, [])

    if (now === null) {
        return null
    }

    const outcome = qualifierOutcome(server, snapshots, now)

    if (outcome.status === 'ongoing') {
        const remaining = Math.ceil((QUALIFIERS_CLOSE_AT - now) / 1_000)
        const days = Math.floor(remaining / 86_400)
        const hours = Math.floor((remaining % 86_400) / 3_600)
        const minutes = Math.floor((remaining % 3_600) / 60)
        const seconds = remaining % 60
        const localClose = new Intl.DateTimeFormat(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
        }).format(QUALIFIERS_CLOSE_AT)

        return (
            <section className="border-b border-border py-6" aria-labelledby="qualifier-countdown-title">
                <h2 id="qualifier-countdown-title" className="font-semibold">
                    Qualifying rounds end in
                </h2>
                <div role="timer" aria-live="off" className="mt-4 flex flex-wrap gap-x-6 gap-y-3 tabular-nums">
                    {[
                        {value: days, label: 'days'},
                        {value: hours, label: 'hours'},
                        {value: minutes, label: 'minutes'},
                        {value: seconds, label: 'seconds'},
                    ].map(({value, label}) => (
                        <div key={label} className="flex flex-col">
                            <span className="text-2xl font-semibold leading-none">
                                {String(value).padStart(2, '0')}
                            </span>
                            <span className="mt-1 text-xs text-muted-foreground">{label}</span>
                        </div>
                    ))}
                </div>
                <p className="mt-4 text-sm text-muted-foreground">
                    Closes <time dateTime={new Date(QUALIFIERS_CLOSE_AT).toISOString()}>{localClose}</time> (your local time).
                </p>
            </section>
        )
    }

    if (outcome.status === 'awaiting-final-update') {
        return (
            <section className="my-8 border-y border-border py-6" aria-label="Qualifier results">
                <h2 className="font-semibold">Qualifiers have closed</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                    Waiting for SEGA’s first ranking update after closing before displaying the
                    qualifying players.
                </p>
            </section>
        )
    }

    return (
        <section className={styles.results} aria-labelledby="qualifiers-title">
            <header>
                <h2 id="qualifiers-title" className={styles.title}>
                    <KopCrownIcon className={styles.crown}/>
                    Qualified for KOP The 8th
                </h2>
            </header>

            <QualifierList players={outcome.players}/>

            {server === 'japan' && outcome.lcqPlayers.length > 0 && (
                <section className={styles.lcq} aria-labelledby="lcq-title">
                    <h2 id="lcq-title" className={styles.lcqTitle}>
                        Last Chance Qualifier (LCQ)
                    </h2>
                    <QualifierList players={outcome.lcqPlayers} startPlace={8}/>
                </section>
            )}

            <footer className={styles.footnote}>
                <p>Ranking updated {formatJst(outcome.snapshot.updatedAt, true)} JST.</p>
                <p>
                    Finals participation is subject to SEGA’s registration and eligibility rules.{' '}
                    <a href={QUALIFIER_RULES[server]} target="_blank" rel="noreferrer">
                        Official rules ↗
                    </a>
                </p>
            </footer>
        </section>
    )
}
