// Presentation only: never use this value as a player key or API payload.
const halfWidthCharacters = new Map<string, string>([
    ['　', ' '],
    ['￠', '¢'], ['￡', '£'], ['￢', '¬'], ['￣', '¯'],
    ['￤', '¦'], ['￥', '¥'], ['￦', '₩'],
    ['゛', 'ﾞ'], ['゜', 'ﾟ'],
])

for (let code = 0xff01; code <= 0xff5e; code++) {
    halfWidthCharacters.set(String.fromCharCode(code), String.fromCharCode(code - 0xfee0))
}

// Reverse only the half-width kana mappings, rather than normalizing the
// whole name (which would also change circled numbers, ligatures, etc.).
for (let code = 0xff61; code <= 0xff9d; code++) {
    const narrow = String.fromCharCode(code)
    halfWidthCharacters.set(narrow.normalize('NFKC'), narrow)
    for (const mark of ['ﾞ', 'ﾟ']) {
        const voiced = (narrow + mark).normalize('NFKC')
        if (voiced.length === 1) halfWidthCharacters.set(voiced, narrow + mark)
    }
}

export function displayPlayerName(name: string): string {
    return Array.from(name, (character) => halfWidthCharacters.get(character) ?? character).join('')
}
