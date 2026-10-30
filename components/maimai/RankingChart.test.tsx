import { it } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { RankingChart } from './RankingChart'

it('renders an empty history without accessing a missing snapshot or producing invalid coordinates', () => {
    const markup = renderToStaticMarkup(
        <RankingChart snapshots={[]} names={[]} colors={new Map()} metric="score" />,
    )

    assert.ok(markup.includes('Select players below'))
    assert.ok(!markup.includes('NaN'))
    assert.ok(!markup.includes('Infinity'))
})
