import {it} from 'node:test'
import assert from 'node:assert/strict'
import {renderToStaticMarkup} from 'react-dom/server'
import LeaderboardNoticeClient from './LeaderboardNoticeClient'

function renderNotice(message: string) {
    // No browser or effects: this exercises the first render from the server seed.
    return renderToStaticMarkup(
        <LeaderboardNoticeClient initialNotice={{message, updatedAt: 1}} initialError=""/>,
    )
}

it('renders Markdown in the initial notice HTML before browser effects', () => {
    const markup = renderNotice('## Update\n\n**Final round** starts *today*. [Rules](https://maimai.sega.jp/kop8th/)\n\n- Bring your card\n- Read the `rules`\n\n> Good luck!')
    assert.ok(markup.includes('<h2>Update</h2>'))
    assert.ok(markup.includes('<strong>Final round</strong>'))
    assert.ok(markup.includes('<em>today</em>'))
    assert.ok(markup.includes('<a href="https://maimai.sega.jp/kop8th/">Rules</a>'))
    assert.ok(markup.includes('<li>Bring your card</li>'))
    assert.ok(markup.includes('<code>rules</code>'))
    assert.ok(markup.includes('<blockquote>'))
    assert.ok(!markup.includes('Edit notice'))
})

it('renders GFM tables, strikethrough, task lists, and automatic links on the server', () => {
    const markup = renderNotice('~~Old time~~\n\n- [x] Confirmed\n\nhttps://maimai.sega.jp/kop8th/\n\n| Round | Time |\n| --- | --- |\n| Final | 18:00 |')
    assert.ok(markup.includes('<del>Old time</del>'))
    assert.ok(markup.includes('type="checkbox"'))
    assert.ok(markup.includes('disabled=""'))
    assert.ok(markup.includes('checked=""'))
    assert.ok(markup.includes('<a href="https://maimai.sega.jp/kop8th/">'))
    assert.ok(markup.includes('<table>'))
    assert.ok(markup.includes('<th>Round</th>'))
    assert.ok(markup.includes('<td>18:00</td>'))
})

it('keeps plain-text line breaks and fenced code intact', () => {
    const markup = renderNotice('First line\nSecond line\n\n```text\n  **literal**\n  code\n```')
    assert.ok(markup.includes('<p>First line\nSecond line</p>'))
    assert.ok(markup.includes('<pre><code class="language-text">  **literal**\n  code\n</code></pre>'))
})

it('escapes HTML, leaves MDX inert, and blocks executable links', () => {
    const markup = renderNotice('<img src=x onerror=alert(1)>\n\n<script>alert(1)</script>\n\n{globalThis.alert(1)}\n\n[Unsafe](javascript:alert%281%29)')
    assert.ok(markup.includes('&lt;img'))
    assert.ok(markup.includes('&lt;script&gt;'))
    assert.ok(markup.includes('{globalThis.alert(1)}'))
    assert.ok(!markup.includes('<img'))
    assert.ok(!markup.includes('<script>'))
    assert.ok(!markup.includes('href="javascript:'))
})
