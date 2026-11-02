import {it} from 'node:test'
import assert from 'node:assert/strict'
import {matchesPlayerSearch} from './maimai-search'

it('finds いっちゃん using either common romaji spelling, including partial searches', () => {
    for (const query of ['icchan', 'itchan', 'icch', 'itch', 'cchan', 'ICCHAN', 'ＩＣＣＨＡＮ']) {
        assert.equal(matchesPlayerSearch('いっちゃん', query), true, query)
    }
    assert.equal(matchesPlayerSearch('いっちゃん', 'rekki'), false)
})

it('romanizes hiragana, katakana, half-width kana, and mixed names', () => {
    for (const name of ['いっちゃん', 'イッチャン', 'ｲｯﾁｬﾝ', 'REK☆いっちゃん42']) {
        assert.equal(matchesPlayerSearch(name, 'icchan'), true, name)
    }
    assert.equal(matchesPlayerSearch('しゅん', 'shun'), true)
    assert.equal(matchesPlayerSearch('キャット', 'kyatto'), true)
    assert.equal(matchesPlayerSearch('スーパー', 'suupaa'), true)
})

it('preserves direct substring searches and matches across kana scripts', () => {
    for (const query of ['いっ', 'っ', 'ちゃん', 'イッチャン', '']) {
        assert.equal(matchesPlayerSearch('いっちゃん', query), true, query)
    }
    assert.equal(matchesPlayerSearch('ＡＢＣ☆田中', 'abc'), true)
    assert.equal(matchesPlayerSearch('ＡＢＣ☆田中', '田中'), true)
    assert.equal(matchesPlayerSearch('ＡＢＣ☆田中', '☆'), true)
    assert.equal(matchesPlayerSearch('イッチャン', 'いっちゃん'), true)
})

it('does not let kana fragments with empty romaji match unrelated players', () => {
    assert.equal(matchesPlayerSearch('Rek', 'っ'), false)
    assert.equal(matchesPlayerSearch('たなか', 'っ'), false)
    assert.equal(matchesPlayerSearch('Rek', 'missing'), false)
})
