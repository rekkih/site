import { fnvHash } from "./utils";

// Deterministic color from any string id using a harmonious hsl palette.
export function colorForUser(id: string): string {
    const h = fnvHash(id) % 360;
    // muted, ink-like palette to fit the site aesthetic
    return `hsl(${h} 55% 38%)`;
}
