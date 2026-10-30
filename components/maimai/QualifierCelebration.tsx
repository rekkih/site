'use client'

import { useEffect, useState } from 'react'
import { KopCrownIcon } from '@/components/icons/KopCrown'
import {
    formatJst,
    type MaimaiServer,
    type RankingEntry,
    type RankingSnapshot,
} from '@/lib/shared/maimai'
import { qualifierOutcome, QUALIFIER_RULES } from '@/lib/shared/maimai-qualifiers'
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
                        {player.score.toLocaleString('en-US')}
                    </span>
                </li>
            ))}
        </ol>
    )
}

export function QualifierCelebration({ server, snapshots }: QualifierCelebrationProps) {
    const [now, setNow] = useState<number | null>(null)

    useEffect(() => {
        setNow(Date.now())

        const timer = setInterval(() => setNow(Date.now()), 60_000)
        return () => clearInterval(timer)
    }, [])

    if (now === null) {
        return null
    }

    const outcome = qualifierOutcome(server, snapshots, now)

    if (outcome.status === 'ongoing') {
        return null
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
                    <KopCrownIcon className={styles.crown} />
                    Qualified for KOP The 8th
                </h2>
            </header>

            <QualifierList players={outcome.players} />

            {server === 'japan' && outcome.lcqPlayers.length > 0 && (
                <section className={styles.lcq} aria-labelledby="lcq-title">
                    <h2 id="lcq-title" className={styles.lcqTitle}>
                        Last Chance Qualifier (LCQ)
                    </h2>
                    <QualifierList players={outcome.lcqPlayers} startPlace={8} />
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
