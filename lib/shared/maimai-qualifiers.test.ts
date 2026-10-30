import { it } from 'node:test'
import assert from 'node:assert/strict'
import { qualifierOutcome, QUALIFIERS_CLOSE_AT } from './maimai-qualifiers'
import type { RankingSnapshot } from './maimai'

function snapshot(updatedAt: number, count = 10): RankingSnapshot {
    return {
        updatedAt,
        collectedAt: updatedAt,
        sourceUpdate: '2026/11/24 07:00:00',
        ranking: Array.from({ length: count }, (_, index) => ({
            userName: `Player ${index + 1}`,
            rank: index + 1,
            score: 3029000 - index,
            subScore: 9000 - index,
            recordDate: '2026/11/23 23:58:00',
        })),
    }
}

it('uses the end of 23 November in JST and hides celebrations before closing', () => {
    assert.equal(new Date(QUALIFIERS_CLOSE_AT).toISOString(), '2026-11-23T15:00:00.000Z')
    assert.equal(qualifierOutcome('japan', [], QUALIFIERS_CLOSE_AT - 1).status, 'ongoing')
})

it('waits for post-close data, including on the closing boundary', () => {
    const stale = snapshot(QUALIFIERS_CLOSE_AT - 1)
    assert.equal(
        qualifierOutcome('international', [stale], QUALIFIERS_CLOSE_AT).status,
        'awaiting-final-update',
    )
    assert.equal(
        qualifierOutcome('japan', [], QUALIFIERS_CLOSE_AT + 86400000).status,
        'awaiting-final-update',
    )
})

it('selects two International and seven Japan finishers from the latest final snapshot', () => {
    const first = snapshot(QUALIFIERS_CLOSE_AT + 3600000)
    const latest = snapshot(QUALIFIERS_CLOSE_AT + 7200000)
    latest.ranking[0].userName = 'Updated winner'

    for (const [server, count] of [
        ['international', 2],
        ['japan', 7],
    ] as const) {
        const outcome = qualifierOutcome(server, [latest, first], latest.updatedAt)
        assert.equal(outcome.status, 'complete')
        if (outcome.status !== 'complete') throw new Error('Expected complete results')
        assert.equal(outcome.players.length, count)
        assert.equal(outcome.players[0].userName, 'Updated winner')
    }
})

it('keeps SEGA ordering for tied ranks without awarding extra places', () => {
    const final = snapshot(QUALIFIERS_CLOSE_AT)
    final.ranking[1].rank = 1
    final.ranking[2].rank = 1
    const outcome = qualifierOutcome('international', [final], QUALIFIERS_CLOSE_AT)
    assert.equal(outcome.status, 'complete')
    if (outcome.status !== 'complete') throw new Error('Expected complete results')
    assert.deepEqual(
        outcome.players.map((player) => player.userName),
        ['Player 1', 'Player 2'],
    )
})

it('waits when the feed is incomplete, missing leading places, or dated in the future', () => {
    const incomplete = snapshot(QUALIFIERS_CLOSE_AT, 1)
    assert.equal(
        qualifierOutcome('international', [incomplete], QUALIFIERS_CLOSE_AT).status,
        'awaiting-final-update',
    )
    const missingFirst = snapshot(QUALIFIERS_CLOSE_AT)
    missingFirst.ranking.shift()
    assert.equal(
        qualifierOutcome('japan', [missingFirst], QUALIFIERS_CLOSE_AT).status,
        'awaiting-final-update',
    )
    const future = snapshot(QUALIFIERS_CLOSE_AT + 1000)
    assert.equal(
        qualifierOutcome('japan', [future], QUALIFIERS_CLOSE_AT).status,
        'awaiting-final-update',
    )
})

it('shows Japan LCQ places eight through fifteen separately, and none for International', () => {
    const final = snapshot(QUALIFIERS_CLOSE_AT, 20)
    const japan = qualifierOutcome('japan', [final], QUALIFIERS_CLOSE_AT)
    const international = qualifierOutcome('international', [final], QUALIFIERS_CLOSE_AT)

    assert.equal(japan.status, 'complete')
    assert.equal(international.status, 'complete')

    if (japan.status !== 'complete' || international.status !== 'complete') {
        throw new Error('Expected complete results')
    }

    assert.equal(japan.players.length, 7)
    assert.deepEqual(
        japan.lcqPlayers.map((player) => player.rank),
        [8, 9, 10, 11, 12, 13, 14, 15],
    )
    assert.deepEqual(international.lcqPlayers, [])
})
