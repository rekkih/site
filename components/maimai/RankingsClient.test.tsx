import {it} from 'node:test'
import assert from 'node:assert/strict'
import {renderToStaticMarkup} from 'react-dom/server'
import {TooltipProvider} from '@/components/ui/tooltip'
import type {RankingHistory} from '@/lib/shared/maimai'
import {QUALIFIERS_CLOSE_AT} from '@/lib/shared/maimai-qualifiers'
import RankingsClient from './RankingsClient'
import LeaderboardNoticeClient from './LeaderboardNoticeClient'
import {QualifierCelebration} from './QualifierCelebration'

const player = '<script>alert("player")</script>'
const initialNow = Date.parse('2026-11-02T03:00:00+09:00')
const history: RankingHistory = {
    server: 'international',
    snapshots: [{
        updatedAt: initialNow - 3_600_000,
        collectedAt: initialNow,
        sourceUpdate: '2026/11/02 02:00:00',
        ranking: [{userName: player, rank: 1, score: 3001234, subScore: 9876, recordDate: '2026/11/02 01:00:00'}],
    }],
    currentPlayers: [player], removedPlayers: [], latestSourceUpdate: '2026/11/02 02:00:00',
    lastCheckedAt: initialNow, nextCheckAt: initialNow + 86_400_000,
    status: 'current', warning: null, persistence: 'kv',
}

it('renders seeded standings, chart, and countdown before browser effects, escaping player names', () => {
    const markup = renderToStaticMarkup(
        <TooltipProvider>
            <RankingsClient server="international" initialData={history} initialError="" initialNow={initialNow}
                versionNavigation={<a href="?server=m">Japan Ver.</a>}/>
        </TooltipProvider>,
    )
    assert.ok(markup.includes('<table'))
    assert.ok(markup.includes('300.1234%'))
    assert.ok(markup.includes('DX Score: 9,876'))
    assert.ok(markup.includes('&lt;script&gt;'))
    assert.ok(!markup.includes('<script>'))
    assert.ok(markup.includes('Score history chart'))
    assert.ok(markup.includes('stroke-width="2"'))
    assert.ok(markup.includes('Qualifying rounds end in'))
    assert.ok(markup.includes('JST'))
    assert.ok(!markup.includes('your local time'))
    assert.ok(!markup.includes('Loading saved rankings'))
    assert.ok(!markup.includes('Delete all scores'))
    assert.ok(!markup.includes('NaN'))
})

it('renders a server storage failure with retry controls and no partial standings', () => {
    const markup = renderToStaticMarkup(
        <RankingsClient server="japan" initialError="Ranking storage is unavailable. Please try again later."
            initialNow={initialNow} versionNavigation={null}/>,
    )
    assert.ok(markup.includes('Ranking storage is unavailable'))
    assert.ok(markup.includes('Try again'))
    assert.ok(!markup.includes('<table'))
    assert.ok(!markup.includes('Loading saved rankings'))
})

it('renders a stored notice as escaped plain text before browser effects', () => {
    const markup = renderToStaticMarkup(
        <LeaderboardNoticeClient initialNotice={{message: '<img src=x onerror=alert(1)>\nSecond line', updatedAt: initialNow}}
            initialError=""/>,
    )
    assert.ok(markup.includes('Leaderboard notice'))
    assert.ok(markup.includes('&lt;img'))
    assert.ok(!markup.includes('<img'))
    assert.ok(!markup.includes('Edit notice'))
})

it('renders the post-closing qualifier status on the server', () => {
    const markup = renderToStaticMarkup(
        <QualifierCelebration server="international" snapshots={history.snapshots} initialNow={QUALIFIERS_CLOSE_AT}/>,
    )
    assert.ok(markup.includes('Qualifiers have closed'))
    assert.ok(markup.includes('Waiting for SEGA'))
})
