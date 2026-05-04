// Detects forbidden shapes (swastika, SS bolts, etc.) via $N/Protractor recognizer.
// Matches user strokes against templates, with a rolling buffer for multi-stroke detection.

import type { Point } from "../shared/canvas-types";
import { getTemplates } from "./abuse-templates";
import { bestMatch, normalize } from "../shared/shape-recognizer";

const BUFFER_WINDOW_MS = 12_000;
const MAX_BUFFER_STROKES = 6;
// Protractor cosine similarity threshold.
export const MATCH_THRESHOLD = 0.88;

type RecentStroke = { points: Point[]; ts: number };

const g = globalThis as unknown as { __abuseBuf?: Map<string, RecentStroke[]> };
const buffers: Map<string, RecentStroke[]> = (g.__abuseBuf ??= new Map());

function pruneBuffer(buf: RecentStroke[], now: number): RecentStroke[] {
    while (buf.length && now - buf[0].ts > BUFFER_WINDOW_MS) buf.shift();
    while (buf.length > MAX_BUFFER_STROKES) buf.shift();
    return buf;
}

export type AbuseCheck = {
    flagged: boolean;
    score: number;
    templateId?: string;
    templateName?: string;
};

/**
 * Test whether the user's stream of recent strokes (including this new
 * one) matches any forbidden template. Side-effect: updates the buffer.
 */
export async function checkStrokeForAbuse(
    userId: string,
    newStroke: Point[],
): Promise<AbuseCheck> {
    const templates = await getTemplates();
    const now = Date.now();

    let buf = buffers.get(userId) ?? [];
    buf = pruneBuffer(buf, now);
    buf.push({ points: newStroke, ts: now });
    buffers.set(userId, buf);

    if (templates.length === 0) {
        return { flagged: false, score: 0 };
    }

    // Check all suffix combinations of the stroke buffer.
    let bestScore = 0;
    let bestTplId: string | undefined;
    let bestTplName: string | undefined;

    for (let k = 1; k <= buf.length; k++) {
        const slice = buf.slice(buf.length - k);
        const strokes = slice.map((s) => s.points);
        const v = normalize(strokes);
        if (!v) continue;
        const m = bestMatch(v, templates);
        if (m.score > bestScore) {
            bestScore = m.score;
            bestTplId = m.template?.id;
            bestTplName = m.template?.name;
        }
    }

    if (bestScore >= MATCH_THRESHOLD) {
        // Clear so we don't re-flag the same combination on the next stroke.
        buffers.set(userId, []);
        return {
            flagged: true,
            score: bestScore,
            templateId: bestTplId,
            templateName: bestTplName,
        };
    }
    return { flagged: false, score: bestScore };
}

/**
 * Stateless variant for the dev /mod-test endpoint: scores a candidate
 * shape against the current template set without touching any buffer.
 */
export async function scoreCandidate(strokes: Point[][]): Promise<{
    score: number;
    templateId?: string;
    templateName?: string;
    threshold: number;
}> {
    const templates = await getTemplates();
    const v = normalize(strokes);
    if (!v) return { score: 0, threshold: MATCH_THRESHOLD };
    const m = bestMatch(v, templates);
    return {
        score: m.score,
        templateId: m.template?.id,
        templateName: m.template?.name,
        threshold: MATCH_THRESHOLD,
    };
}
