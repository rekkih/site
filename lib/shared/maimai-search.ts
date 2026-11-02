import {toRomaji} from 'wanakana'
import {searchableName} from './maimai'

function romajiSearchKey(name: string): string {
    // WanaKana uses Hepburn "tch" for っち; also accept the common "cch" spelling.
    return toRomaji(name).replace(/tch/g, 'cch')
}

export function matchesPlayerSearch(name: string, search: string): boolean {
    const normalizedName = searchableName(name)
    const normalizedSearch = searchableName(search)
    if (normalizedName.includes(normalizedSearch)) return true

    const romajiSearch = romajiSearchKey(normalizedSearch)
    // Kana fragments such as a standalone small っ can romanize to an empty string.
    return romajiSearch.length > 0 && romajiSearchKey(normalizedName).includes(romajiSearch)
}
