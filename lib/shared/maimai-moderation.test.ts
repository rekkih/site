import {it} from 'node:test'
import assert from 'node:assert/strict'
import {excludeRankingPlayers, parseJstTimestamp, type RankingSnapshot} from './maimai'
import {dailyRankingChanges} from './maimai-changes'

function snapshot(day: number): RankingSnapshot {
    const date = `2026/10/${day} 02:00:00`
    return {
        updatedAt: parseJstTimestamp(date),
        collectedAt: parseJstTimestamp(date),
        sourceUpdate: date,
        ranking: ['Removed', 'A', 'B', 'C'].map((userName, index) => ({
            userName, rank: index + 1, score: 3000000 - index * 1000 + (day - 29) * index * 10,
            subScore: 9000 - index * 10, recordDate: date,
        })),
    }
}

it('renumbers remaining players without changing scores, dates, or the original archive', () => {
    const original = snapshot(30)
    const saved = structuredClone(original)
    const removed = new Set(['Removed', 'B'])
    const result = excludeRankingPlayers(original, removed)
    assert.deepEqual(result.ranking, [
        {...original.ranking[1], rank: 1},
        {...original.ranking[3], rank: 2},
    ])
    assert.deepEqual({...result, ranking: []}, {...original, ranking: []})
    assert.deepEqual(original, saved)
    assert.deepEqual(excludeRankingPlayers(result, removed), result)
    assert.equal(excludeRankingPlayers(original, new Set(['Absent'])), original)
})

it('preserves ranking order including source ties rather than sorting by score', () => {
    const original = snapshot(30)
    original.ranking[2].rank = 2
    original.ranking[2].score = original.ranking[1].score + 100
    assert.deepEqual(excludeRankingPlayers(original, new Set(['Removed'])).ranking.map((row) => [row.userName, row.rank]), [
        ['A', 1], ['B', 2], ['C', 3],
    ])
})

it('preserves normal daily score differences and adds no deletion update', () => {
    const history = [snapshot(29), snapshot(30)]
    const before = dailyRankingChanges(history)
    const reranked = history.map((entry) => excludeRankingPlayers(entry, new Set(['Removed'])))
    const after = dailyRankingChanges(reranked)
    for (const name of ['A', 'B', 'C']) assert.deepEqual(after.get(name), before.get(name))
    assert.equal(after.has('Removed'), false)
    assert.deepEqual(reranked.map((entry) => entry.updatedAt), history.map((entry) => entry.updatedAt))
    assert.equal(dailyRankingChanges([reranked[1]]).size, 0)
})
