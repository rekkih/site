// In-process pub/sub for live stroke broadcasts, with debounced KV persistence.
// All state is isolated per page via a pageKey string.

import type { ServerEvent, Stroke } from "../shared/canvas-types";
import { kvConfigured, kvGet, kvPut } from "./cf-kv";
import { parseDurationToMs } from "../shared/duration";
import { isRealPageKey, parseRealPageKey } from "./page-keys";

const MAX_STROKES = 600;
const PERSIST_DEBOUNCE_MS = 1500;
const HEARTBEAT_TIMEOUT_MS = 35_000; // 10 seconds + buffer
const IDLE_PAGE_MS = 5 * 60_000;

// Stroke expiry configuration from env var (e.g., "1d", "1w", "4hr", "30m", "0" to disable)
const STROKE_EXPIRY_MS = parseDurationToMs(process.env.CANVAS_STROKE_EXPIRY || "1d");

type Listener = (e: ServerEvent) => void;

type State = {
    strokes: Stroke[];
    listeners: Set<Listener>;
    hydrated: boolean;
    hydrating: Promise<void> | null;
    persistTimer: ReturnType<typeof setTimeout> | null;
    dirty: boolean;
    lastAccess: number;
    pendingPersists: number;
};

// Connection tracking with heartbeat
type Connection = {
    lastPing: number;
    userId: string;
};

// Stash on globalThis so HMR / multiple imports share state in dev.
const g = globalThis as unknown as {
    __canvasPageStores?: Map<string, State>;
    __canvasPageConnections?: Map<string, Map<string, Connection>>;
};

const pageStores: Map<string, State> =
    (g.__canvasPageStores ??= new Map());

const pageConnections: Map<string, Map<string, Connection>> =
    (g.__canvasPageConnections ??= new Map());

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

// ─── Per-page accessors ───────────────────────────────────────────────────────

function kvKey(pageKey: string): string {
    return `canvas:v1:strokes:${pageKey}`;
}

function getState(pageKey: string): State {
    if (!isRealPageKey(pageKey)) throw new Error("Invalid canvas page key");
    startCleanupInterval();
    let s = pageStores.get(pageKey);
    if (!s) {
        s = {
            strokes: [],
            listeners: new Set(),
            hydrated: false,
            hydrating: null,
            persistTimer: null,
            dirty: false,
            lastAccess: Date.now(),
            pendingPersists: 0,
        };
        pageStores.set(pageKey, s);
    }
    s.lastAccess = Date.now();
    return s;
}

function getConnections(pageKey: string): Map<string, Connection> {
    if (!isRealPageKey(pageKey)) throw new Error("Invalid canvas page key");
    let c = pageConnections.get(pageKey);
    if (!c) {
        c = new Map();
        pageConnections.set(pageKey, c);
    }
    return c;
}

// ─── Cleanup interval ────────────────────────────────────────────────────────

function startCleanupInterval() {
    if (cleanupInterval) return;
    cleanupInterval = setInterval(() => pruneIdleCanvasPages(), 5000); // Check every 5 seconds
}

export function pruneIdleCanvasPages(now = Date.now()): void {
    for (const [pageKey, conns] of pageConnections) {
        const toRemove: string[] = [];
        for (const [id, conn] of conns) {
            if (now - conn.lastPing > HEARTBEAT_TIMEOUT_MS) toRemove.push(id);
        }
        for (const id of toRemove) conns.delete(id);
        if (toRemove.length > 0 && isRealPageKey(pageKey)) {
            broadcastTo(pageKey, { type: "count", count: conns.size });
        }
        if (conns.size === 0) pageConnections.delete(pageKey);
    }
    for (const [pageKey, state] of pageStores) {
        if (now - state.lastAccess >= IDLE_PAGE_MS && state.listeners.size === 0 &&
            !state.hydrating && !state.persistTimer && !state.dirty && !state.pendingPersists &&
            (kvConfigured || state.strokes.length === 0) &&
            !pageConnections.has(pageKey)) pageStores.delete(pageKey);
    }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function cullExpiredStrokes(strokes: Stroke[]): Stroke[] {
    if (!STROKE_EXPIRY_MS) return strokes;
    const cutoff = Date.now() - STROKE_EXPIRY_MS;
    const filtered = strokes.filter(s => s.ts >= cutoff);
    return filtered.length === strokes.length ? strokes : filtered;
}

async function hydrate(pageKey: string): Promise<void> {
    const state = getState(pageKey);
    if (state.hydrated) return;
    if (state.hydrating) return state.hydrating;
    state.hydrating = (async () => {
        if (kvConfigured) {
            const data = await kvGet<{ strokes: Stroke[] }>(kvKey(pageKey));
            if (data && Array.isArray(data.strokes)) {
                const loaded = data.strokes.slice(-MAX_STROKES);
                state.strokes = cullExpiredStrokes(loaded);
            }
        }
        state.hydrated = true;
    })().finally(() => { state.hydrating = null; });
    return state.hydrating;
}

function schedulePersist(pageKey: string) {
    const state = getState(pageKey);
    state.dirty = true;
    if (state.persistTimer) return;
    state.persistTimer = setTimeout(async () => {
        state.persistTimer = null;
        if (!state.dirty) return;
        state.dirty = false;
        if (!kvConfigured) return;
        state.pendingPersists++;
        try {
            if (!await kvPut(kvKey(pageKey), { strokes: state.strokes })) state.dirty = true;
        } catch (error) {
            state.dirty = true;
            console.error("[canvas-store] persist failed", error);
        }
        finally { state.pendingPersists--; }
    }, PERSIST_DEBOUNCE_MS);
}

function broadcastTo(pageKey: string, e: ServerEvent) {
    const state = getState(pageKey);
    for (const l of state.listeners) {
        try { l(e); } catch { /* ignore */ }
    }
}

// ─── Page key validation & public API ──────────────────────────────────────────

// Reject nonexistent pages before creating process or KV state.
export function parsePageKey(raw: string | null | undefined): string | null {
    return parseRealPageKey(raw);
}

export async function getSnapshot(pageKey: string): Promise<Stroke[]> {
    await hydrate(pageKey);
    const state = getState(pageKey);
    state.strokes = cullExpiredStrokes(state.strokes);
    return state.strokes;
}

export async function addStroke(pageKey: string, stroke: Stroke): Promise<void> {
    await hydrate(pageKey);
    const state = getState(pageKey);
    state.strokes.push(stroke);
    // Cull expired strokes
    state.strokes = cullExpiredStrokes(state.strokes);
    // Enforce max strokes
    if (state.strokes.length > MAX_STROKES) {
        state.strokes.splice(0, state.strokes.length - MAX_STROKES);
    }
    schedulePersist(pageKey);
    broadcastTo(pageKey, { type: "stroke", stroke });
}

export async function clearCanvas(pageKey: string, by: string): Promise<void> {
    await hydrate(pageKey);
    const state = getState(pageKey);
    state.strokes = [];
    schedulePersist(pageKey);
    broadcastTo(pageKey, { type: "clear", by });
}

export function subscribe(pageKey: string, listener: Listener): () => void {
    const state = getState(pageKey);
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
}

// Heartbeat-based connection tracking
export function pingConnection(pageKey: string, userId: string): number {
    startCleanupInterval();
    const conns = getConnections(pageKey);
    const changed = !conns.has(userId);
    conns.set(userId, { lastPing: Date.now(), userId });
    const count = conns.size;
    if (changed) broadcastTo(pageKey, { type: "count", count });
    return count;
}

export function refreshConnection(pageKey: string, userId: string): number | null {
    const conns = pageConnections.get(pageKey);
    const connection = conns?.get(userId);
    if (!connection || Date.now() - connection.lastPing > HEARTBEAT_TIMEOUT_MS) return null;
    connection.lastPing = Date.now();
    return conns!.size;
}

export function removeConnection(pageKey: string, userId: string): void {
    const conns = pageConnections.get(pageKey);
    if (!conns?.delete(userId)) return;
    if (conns.size === 0) pageConnections.delete(pageKey);
    broadcastTo(pageKey, { type: "count", count: conns.size });
}
