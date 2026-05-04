// $N/Protractor multistroke recognizer for shape matching regardless of position/scale/rotation.

import type { Point } from "./canvas-types";

export const RESAMPLE_N = 64;

export type Vector = number[]; // length 2*RESAMPLE_N

export type ShapeTemplate = {
    id: string;
    name: string;
    vector: Vector;
    // Original points kept for the dev UI preview only.
    raw: Point[];
};

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function pathLength(pts: Point[]): number {
    let d = 0;
    for (let i = 1; i < pts.length; i++) {
        const dx = pts[i].x - pts[i - 1].x;
        const dy = pts[i].y - pts[i - 1].y;
        d += Math.sqrt(dx * dx + dy * dy);
    }
    return d;
}

function resample(pts: Point[], n: number): Point[] {
    if (pts.length < 2) return pts.slice();
    const total = pathLength(pts);
    if (total === 0) return pts.slice(0, n);
    const I = total / (n - 1);
    const out: Point[] = [{ x: pts[0].x, y: pts[0].y }];

    // O(n) resampling using lockstep iteration through targets and segments
    let targetIdx = 1; // Which output point we're trying to generate
    let prevCumDist = 0;

    for (let i = 1; i < pts.length && out.length < n; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const segLen = Math.sqrt(dx * dx + dy * dy);
        if (segLen === 0) continue;

        const cumEnd = prevCumDist + segLen;

        // Generate all target points that fall within this segment
        while (targetIdx < n && targetIdx * I <= cumEnd) {
            const t = (targetIdx * I - prevCumDist) / segLen;
            out.push({
                x: a.x + t * dx,
                y: a.y + t * dy,
            });
            targetIdx++;
        }

        prevCumDist = cumEnd;
    }

    // Handle edge case where we didn't fill all points due to floating point
    while (out.length < n) out.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });
    return out;
}

function centroid(pts: Point[]): Point {
    let sx = 0, sy = 0;
    for (const p of pts) { sx += p.x; sy += p.y; }
    return { x: sx / pts.length, y: sy / pts.length };
}

function rotateBy(pts: Point[], theta: number): Point[] {
    const c = Math.cos(theta), s = Math.sin(theta);
    const ctr = centroid(pts);
    return pts.map((p) => {
        const dx = p.x - ctr.x, dy = p.y - ctr.y;
        return { x: dx * c - dy * s + ctr.x, y: dx * s + dy * c + ctr.y };
    });
}

function rotateToZero(pts: Point[]): Point[] {
    const ctr = centroid(pts);
    const theta = Math.atan2(ctr.y - pts[0].y, ctr.x - pts[0].x);
    return rotateBy(pts, -theta);
}

function scaleToUnit(pts: Point[]): Point[] {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
    }
    const size = Math.max(maxX - minX, maxY - minY);
    if (size === 0) return pts.slice();
    return pts.map((p) => ({ x: (p.x - minX) / size, y: (p.y - minY) / size }));
}

function translateToOrigin(pts: Point[]): Point[] {
    const c = centroid(pts);
    return pts.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
}

// ---------------------------------------------------------------------------
// Vectorize + Protractor score
// ---------------------------------------------------------------------------

function vectorize(pts: Point[]): Vector {
    let sum = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
        sum += pts[i].x * pts[i].x + pts[i].y * pts[i].y;
    }
    const mag = Math.sqrt(sum) || 1;
    const v: number[] = new Array(n * 2);
    for (let i = 0; i < n; i++) {
        v[2 * i] = pts[i].x / mag;
        v[2 * i + 1] = pts[i].y / mag;
    }
    return v;
}

/**
 * Optimal cosine similarity under a free 2D rotation between two
 * unit-length vectors of stacked (x, y) coordinates. Returns a value
 * in [-1, 1]; higher is more similar.
 */
function optimalCosine(a: Vector, b: Vector): number {
    let aDotB = 0, bDotA = 0;
    for (let i = 0; i < a.length; i += 2) {
        aDotB += a[i] * b[i] + a[i + 1] * b[i + 1];
        bDotA += a[i] * b[i + 1] - a[i + 1] * b[i];
    }
    const angle = Math.atan2(bDotA, aDotB);
    return aDotB * Math.cos(angle) + bDotA * Math.sin(angle);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function normalize(rawStrokes: Point[][]): Vector | null {
    const pts: Point[] = [];
    for (const s of rawStrokes) for (const p of s) pts.push(p);
    if (pts.length < 4) return null;

    let processed = resample(pts, RESAMPLE_N);
    processed = rotateToZero(processed);
    processed = scaleToUnit(processed);
    processed = translateToOrigin(processed);
    return vectorize(processed);
}

/**
 * Score against a single template; returns Protractor similarity in
 * [0, 1]. Negative cosines (very dissimilar) are clamped to 0.
 */
export function scoreAgainst(query: Vector, template: Vector): number {
    if (query.length !== template.length) return 0;
    const c = optimalCosine(query, template);
    return Math.max(0, c);
}

/**
 * Best score across all templates, plus the matching template (if any).
 */
export function bestMatch(
    query: Vector,
    templates: ShapeTemplate[],
): { score: number; template: ShapeTemplate | null } {
    let best = 0;
    let which: ShapeTemplate | null = null;
    for (const t of templates) {
        const s = scoreAgainst(query, t.vector);
        if (s > best) { best = s; which = t; }
    }
    return { score: best, template: which };
}
