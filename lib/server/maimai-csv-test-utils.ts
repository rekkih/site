import assert from 'node:assert/strict'

/** Read quoted CSV including embedded commas, quotes, and newlines for assertions. */
export function readCsv(csv: string): Record<string, string>[] {
    const rows: string[][] = []
    let row: string[] = [], field = '', quoted = false
    const text = csv.replace(/^\uFEFF/, '')
    for (let index = 0; index < text.length; index++) {
        const char = text[index]
        if (char === '"') {
            if (quoted && text[index + 1] === '"') { field += '"'; index++ }
            else quoted = !quoted
        } else if (!quoted && char === ',') { row.push(field); field = '' }
        else if (!quoted && char === '\r' && text[index + 1] === '\n') {
            row.push(field); rows.push(row); row = []; field = ''; index++
        } else field += char
    }
    assert.equal(quoted, false)
    assert.equal(field, '')
    const headers = rows.shift()!
    return rows.map((values) => {
        assert.equal(values.length, headers.length)
        return Object.fromEntries(headers.map((header, index) => [header, values[index]]))
    })
}
