// Presentation only: never use this value as a player key or API payload.
const halfWidthCharacters = new Map<string, string>([
    ['　', ' '],
    ['￠', '¢'], ['￡', '£'], ['￢', '¬'], ['￣', '¯'],
    ['￤', '¦'], ['￥', '¥'], ['￦', '₩'],
])

for (let code = 0xff01; code <= 0xff5e; code++) {
    halfWidthCharacters.set(String.fromCharCode(code), String.fromCharCode(code - 0xfee0))
}

// Keep Japanese characters, including kana and punctuation, unchanged.
export function displayPlayerName(name: string): string {
    return Array.from(name, (character) => halfWidthCharacters.get(character) ?? character).join('')
}
