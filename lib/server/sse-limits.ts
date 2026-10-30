// Limits apply to this Node process. Edge/proxy connection limits are still useful
// when the site is served by more than one process.
const MAX_STREAMS = 128;
const MAX_STREAMS_PER_SESSION = 4;
const MAX_STREAMS_PER_IP = 12;
export const MAX_SNAPSHOT_BYTES = 256 * 1024;
export const STREAM_HIGH_WATER_BYTES = 512 * 1024;
export const STREAM_LIFETIME_MS = 10 * 60 * 1000;
export const SNAPSHOT_DEADLINE_MS = 10_000;

type Registry = { total: number; sessions: Map<string, number>; ips: Map<string, number>; active: Map<string, number> };
const g = globalThis as typeof globalThis & { __sseRegistry?: Registry };
const registry = (g.__sseRegistry ??= { total: 0, sessions: new Map(), ips: new Map(), active: new Map() });
registry.active ??= new Map(); // Preserve the registry across development reloads.

type StreamKind = "canvas" | "chat";

function activeKey(session: string, userId: string, pageKey: string, kind: StreamKind): string {
    return JSON.stringify([session, userId, pageKey, kind]);
}

export function hasActiveStream(session: string, userId: string, pageKey: string, kind: StreamKind = "canvas"): boolean {
    return (registry.active.get(activeKey(session, userId, pageKey, kind)) ?? 0) > 0;
}

export function admitStream(session: string, ip: string | null, pageKey: string, userId: string, kind: StreamKind = "canvas"): (() => void) | null {
    if (registry.total >= MAX_STREAMS ||
        (registry.sessions.get(session) ?? 0) >= MAX_STREAMS_PER_SESSION ||
        (ip !== null && (registry.ips.get(ip) ?? 0) >= MAX_STREAMS_PER_IP)) return null;

    registry.total++;
    registry.sessions.set(session, (registry.sessions.get(session) ?? 0) + 1);
    if (ip !== null) registry.ips.set(ip, (registry.ips.get(ip) ?? 0) + 1);
    const key = activeKey(session, userId, pageKey, kind);
    registry.active.set(key, (registry.active.get(key) ?? 0) + 1);
    let released = false;
    return () => {
        if (released) return;
        released = true;
        registry.total--;
        for (const [map, key] of [[registry.sessions, session], [registry.ips, ip]] as const) {
            if (key === null) continue;
            const remaining = (map.get(key) ?? 1) - 1;
            if (remaining) map.set(key, remaining);
            else map.delete(key);
        }
        const activeRemaining = (registry.active.get(key) ?? 1) - 1;
        if (activeRemaining) registry.active.set(key, activeRemaining);
        else registry.active.delete(key);
    };
}

export function boundedSnapshot<T>(items: T[], makeEvent: (items: T[]) => unknown): T[] {
    const encoder = new TextEncoder();
    let low = 0;
    let high = items.length;
    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (encoder.encode(JSON.stringify(makeEvent(items.slice(mid)))).byteLength > MAX_SNAPSHOT_BYTES) low = mid + 1;
        else high = mid;
    }
    return items.slice(low);
}

// Bound the admission phase even if a KV read never settles.
export async function awaitSnapshot<T>(signal: AbortSignal, snapshot: Promise<T>, timeoutMs = SNAPSHOT_DEADLINE_MS): Promise<T | null> {
    if (signal.aborted) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const deadline = new Promise<null>(resolve => {
        onAbort = () => resolve(null);
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) resolve(null);
        timer = setTimeout(() => resolve(null), timeoutMs);
    });
    try { return await Promise.race([snapshot, deadline]); }
    finally {
        if (timer) clearTimeout(timer);
        if (onAbort) signal.removeEventListener("abort", onAbort);
    }
}

export function sseStream<T>(opts: {
    signal: AbortSignal;
    release: () => void;
    init: T;
    subscribe: (send: (event: T) => void) => () => void;
}): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let close = () => { opts.release(); };
    return new ReadableStream<Uint8Array>({
        start(controller) {
            let closed = false;
            let unsubscribe: (() => void) | undefined;
            let keepalive: ReturnType<typeof setInterval> | undefined;
            let lifetime: ReturnType<typeof setTimeout> | undefined;
            const stop = () => {
                if (closed) return;
                closed = true;
                if (keepalive) clearInterval(keepalive);
                if (lifetime) clearTimeout(lifetime);
                unsubscribe?.();
                opts.signal.removeEventListener("abort", stop);
                opts.release();
                try { controller.close(); } catch { /* already cancelled */ }
            };
            close = stop;
            const enqueue = (data: Uint8Array) => {
                if (closed) return;
                // desiredSize is measured in bytes by the stream strategy below.
                if (controller.desiredSize === null || controller.desiredSize < data.byteLength) {
                    stop();
                    return;
                }
                try { controller.enqueue(data); } catch { stop(); }
            };
            const send = (event: T) => enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            opts.signal.addEventListener("abort", stop, { once: true });
            if (opts.signal.aborted) { stop(); return; }
            try {
                send(opts.init);
                if (closed) return;
                unsubscribe = opts.subscribe(send);
                if (closed) { unsubscribe(); return; }
                keepalive = setInterval(() => enqueue(encoder.encode(": ping\n\n")), 30_000);
                lifetime = setTimeout(stop, STREAM_LIFETIME_MS);
            } catch (error) {
                stop();
                throw error;
            }
        },
        cancel() { close(); },
    }, {
        highWaterMark: STREAM_HIGH_WATER_BYTES,
        size: chunk => chunk.byteLength,
    });
}
