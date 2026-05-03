// Deterministic color from any string id using a harmonious hsl palette.
function hash(str: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

export function colorForUser(id: string): string {
    const h = hash(id) % 360;
    // muted, ink-like palette to fit the site aesthetic
    return `hsl(${h} 55% 38%)`;
}
