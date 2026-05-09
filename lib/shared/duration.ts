// Parse duration strings like "1d", "1w", "4hr", "30m", "45s" into milliseconds.
// Supports: s (seconds), m (minutes), hr/h (hours), d (days), w (weeks)

export function parseDurationToMs(input: string | undefined): number | undefined {
    if (!input) return undefined;

    const trimmed = input.trim().toLowerCase();
    if (!trimmed) return undefined;

    // Match number followed by optional unit (hr, h, s, m, d, w) or no unit for ms
    const match = trimmed.match(/^(\d+(?:\.\d+)?)(ms|hr?|s|m|d|w)?$/);
    if (!match) return undefined;

    const value = parseFloat(match[1]);
    const unit = match[2] || "ms"; // default to milliseconds if no unit

    const multipliers: Record<string, number> = {
        "ms": 1,
        "s": 1000,
        "m": 60 * 1000,
        "h": 60 * 60 * 1000,
        "hr": 60 * 60 * 1000,
        "d": 24 * 60 * 60 * 1000,
        "w": 7 * 24 * 60 * 60 * 1000,
    };

    const multiplier = multipliers[unit];
    if (multiplier === undefined) return undefined;

    return Math.round(value * multiplier);
}
