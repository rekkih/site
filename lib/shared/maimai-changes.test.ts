import { it } from 'node:test'
import assert from 'node:assert/strict'
import { dailyRankingChanges } from './maimai-changes'
import { parseJstTimestamp, type RankingSnapshot } from './maimai'

function snapshot(date: string, rows: [string, number, number][]): RankingSnapshot {
    const updatedAt = parseJstTimestamp(date)

    return {
        updatedAt,
        collectedAt: updatedAt,
        sourceUpdate: date,
        ranking: rows.map(([userName, rank, score]) => ({
            userName,
            rank,
            score,
            subScore: 9000,
            recordDate: date,
        })),
    }
}

it('calculates up, unchanged and down placement changes and signed score differences', () => {
    const before = snapshot('2026/10/29 02:00:00', [
        ['Up', 3, 100],
        ['Same', 2, 200],
        ['Down', 1, 300],
    ])
    const current = snapshot('2026/10/30 02:00:00', [
        ['Up', 1, 150],
        ['Same', 2, 200],
        ['Down', 3, 250],
    ])

    const changes = dailyRankingChanges([current, before])

    assert.deepEqual(changes.get('Up'), { placement: 2, score: 50 })
    assert.deepEqual(changes.get('Same'), { placement: 0, score: 0 })
    assert.deepEqual(changes.get('Down'), { placement: -2, score: -50 })
})

it('uses the previous JST calendar day, not another update from today or an earlier missing day', () => {
    const earlier = snapshot('2026/10/28 23:00:00', [['Player', 5, 50]])
    const previousDay = snapshot('2026/10/29 23:00:00', [['Player', 3, 100]])
    const sameDay = snapshot('2026/10/30 01:00:00', [['Player', 2, 120]])
    const latest = snapshot('2026/10/30 07:00:00', [['Player', 1, 150]])

    assert.deepEqual(dailyRankingChanges([earlier, previousDay, sameDay, latest]).get('Player'), {
        placement: 2,
        score: 50,
    })
    assert.equal(dailyRankingChanges([earlier, sameDay, latest]).size, 0)
})

it('uses the last update of the previous day and ignores missing, renamed or duplicated players', () => {
    const old = snapshot('2026/10/29 02:00:00', [['Player', 5, 50]])
    const before = snapshot('2026/10/29 07:00:00', [
        ['Player', 3, 100],
        ['Old name', 2, 200],
        ['Duplicate', 4, 200],
        ['Duplicate', 5, 200],
        ['Ambiguous today', 6, 200],
    ])
    const latest = snapshot('2026/10/30 02:00:00', [
        ['Player', 1, 150],
        ['New name', 2, 300],
        ['Duplicate', 3, 200],
        ['Ambiguous today', 4, 200],
        ['Ambiguous today', 5, 200],
    ])
    const changes = dailyRankingChanges([latest, old, before])

    assert.equal(changes.size, 1)
    assert.deepEqual(changes.get('Player'), { placement: 2, score: 50 })
    assert.equal(dailyRankingChanges([latest]).size, 0)
    assert.equal(dailyRankingChanges([]).size, 0)
})
