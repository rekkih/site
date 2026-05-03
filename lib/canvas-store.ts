// In-process pub/sub for live stroke broadcasts, with debounced KV persistence.

import type { ServerEvent, Stroke } from "./canvas-types";
import { kvConfigured, kvGet, kvPut } from "./cf-kv";

const KV_KEY = "canvas:v1:strokes";
const MAX_STROKES = 600;
const PERSIST_DEBOUNCE_MS = 1500;

type Listener = (e: ServerEvent) => void;

type State = {
    strokes: Stroke[];
    listeners: Set<Listener>;
    hydrated: boolean;
    hydrating: Promise<void> | null;
    persistTimer: ReturnType<typeof setTimeout> | null;
    dirty: boolean;
};

// Connection tracking with heartbeat
type Connection = {
    lastPing: number;
    userId: string;
};

// Stash on globalThis so HMR / multiple imports share state in dev.
const g = globalThis as unknown as {
    __canvasStore?: State;
    __canvasConnections?: Map<string, Connection>;
};

const state: State = (g.__canvasStore ??= {
    strokes: [],
    listeners: new Set(),
    hydrated: false,
    hydrating: null,
    persistTimer: null,
    dirty: false,
});

// Connection tracking with heartbeat
const connections = g.__canvasConnections ??= new Map<string, Connection>();
const HEARTBEAT_TIMEOUT_MS = 15000; // 10 seconds + buffer
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

// Start cleanup interval on first use
function startCleanupInterval() {
    if (cleanupInterval) return;
    cleanupInterval = setInterval(() => {
        const now = Date.now();
        const toRemove: string[] = [];
        for (const [id, conn] of connections) {
            if (now - conn.lastPing > HEARTBEAT_TIMEOUT_MS) {
                toRemove.push(id);
            }
        }
        for (const id of toRemove) {
            connections.delete(id);
        }
        if (toRemove.length > 0) {
            const count = connections.size;
            broadcast({ type: "count", count });
        }
    }, 5000); // Check every 5 seconds
}

async function hydrate(): Promise<void> {
    if (state.hydrated) return;
    if (state.hydrating) return state.hydrating;
    state.hydrating = (async () => {
        if (kvConfigured) {
            const data = await kvGet<{ strokes: Stroke[] }>(KV_KEY);
            if (data && Array.isArray(data.strokes)) {
                state.strokes = data.strokes.slice(-MAX_STROKES);
            }
        }
        state.hydrated = true;
    })();
    return state.hydrating;
}

function schedulePersist() {
    state.dirty = true;
    if (state.persistTimer) return;
    state.persistTimer = setTimeout(async () => {
        state.persistTimer = null;
        if (!state.dirty) return;
        state.dirty = false;
        if (!kvConfigured) return;
        await kvPut(KV_KEY, { strokes: state.strokes });
    }, PERSIST_DEBOUNCE_MS);
}

function broadcast(e: ServerEvent) {
    for (const l of state.listeners) {
        try { l(e); } catch { /* ignore */ }
    }
}

export async function getSnapshot(): Promise<Stroke[]> {
    await hydrate();
    return state.strokes;
}

export async function addStroke(stroke: Stroke): Promise<void> {
    await hydrate();
    state.strokes.push(stroke);
    if (state.strokes.length > MAX_STROKES) {
        state.strokes.splice(0, state.strokes.length - MAX_STROKES);
    }
    schedulePersist();
    broadcast({ type: "stroke", stroke });
}

export async function clearCanvas(by: string): Promise<void> {
    await hydrate();
    state.strokes = [];
    schedulePersist();
    broadcast({ type: "clear", by });
}

export function subscribe(listener: Listener): () => void {
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
}

// Heartbeat-based connection tracking
export function pingConnection(userId: string): number {
    startCleanupInterval();
    const id = userId;
    connections.set(id, { lastPing: Date.now(), userId });
    const count = connections.size;
    broadcast({ type: "count", count });
    return count;
}
