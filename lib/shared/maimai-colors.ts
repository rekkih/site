// Ordered to separate neighboring series by hue as well as brightness.
const SERIES_PALETTE = [
    { lightness: 0.53, chroma: 0.2, hue: 255 }, // blue
    { lightness: 0.6, chroma: 0.19, hue: 30 }, // orange-red
    { lightness: 0.53, chroma: 0.13, hue: 155 }, // emerald
    { lightness: 0.57, chroma: 0.19, hue: 310 }, // magenta
    { lightness: 0.51, chroma: 0.11, hue: 85 }, // ochre
    { lightness: 0.58, chroma: 0.1, hue: 205 }, // cyan
    { lightness: 0.65, chroma: 0.15, hue: 55 }, // amber
    { lightness: 0.49, chroma: 0.18, hue: 355 }, // raspberry
    { lightness: 0.5, chroma: 0.18, hue: 285 }, // violet
    { lightness: 0.59, chroma: 0.13, hue: 125 }, // lime
] as const

export function rankingColors(
    names: string[],
    topPlayers: string[],
    dark: boolean,
): Map<string, string> {
    // Reserve a separate color for each of the current top ten. Other players
    // retain a deterministic slot without depending on chart selection order.
    const orderedNames = [...new Set([...topPlayers, ...names])]

    return new Map(
        orderedNames.map((name, index) => {
            const { lightness, chroma, hue } = SERIES_PALETTE[index % SERIES_PALETTE.length]
            const themeLightness = dark ? 1.3 - lightness : lightness

            return [name, `oklch(${themeLightness.toFixed(3)} ${chroma} ${hue})`]
        }),
    )
}
