// In-process per-page chat store with debounced KV persistence and pub/sub.
// Mirrors lib/canvas-store.ts in spirit but for text messages.

import type { ChatMessage, ChatServerEvent } from "../shared/chat-types";
import { kvConfigured, kvGet, kvPut } from "./cf-kv";

export const COOLDOWN_MS = 60_000;        // one message every 60 s per user/IP
const MAX_MESSAGES = 200;                  // per page, retained
const MAX_TEXT_LEN = 500;
const PERSIST_DEBOUNCE_MS = 1500;

type Listener = (e: ChatServerEvent) => void;

type State = {
    messages: ChatMessage[];
    listeners: Set<Listener>;
    hydrated: boolean;
    hydrating: Promise<void> | null;
    persistTimer: ReturnType<typeof setTimeout> | null;
    dirty: boolean;
};

const g = globalThis as unknown as {
    __chatPageStores?: Map<string, State>;
    __chatLastSend?: Map<string, number>;
};

const pageStores: Map<string, State> = (g.__chatPageStores ??= new Map());
// rateKey ("uid:..." or "ip:...") -> last accepted timestamp
const lastSend: Map<string, number> = (g.__chatLastSend ??= new Map());

function kvKey(pageKey: string): string {
    return `chat:v1:messages:${pageKey}`;
}

function getState(pageKey: string): State {
    let s = pageStores.get(pageKey);
    if (!s) {
        s = {
            messages: [],
            listeners: new Set(),
            hydrated: false,
            hydrating: null,
            persistTimer: null,
            dirty: false,
        };
        pageStores.set(pageKey, s);
    }
    return s;
}

async function hydrate(pageKey: string): Promise<void> {
    const state = getState(pageKey);
    if (state.hydrated) return;
    if (state.hydrating) return state.hydrating;
    state.hydrating = (async () => {
        if (kvConfigured) {
            const data = await kvGet<{ messages: ChatMessage[] }>(kvKey(pageKey));
            if (data && Array.isArray(data.messages)) {
                state.messages = data.messages.slice(-MAX_MESSAGES);
            }
        }
        state.hydrated = true;
    })();
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
        await kvPut(kvKey(pageKey), { messages: state.messages });
    }, PERSIST_DEBOUNCE_MS);
}

function broadcastTo(pageKey: string, e: ChatServerEvent) {
    const state = getState(pageKey);
    for (const l of state.listeners) {
        try { l(e); } catch { /* ignore */ }
    }
}

// ─── Page key validation ──────────────────────────────────────────────────────

// Sanitize a pathname into a stable key. e.g. "/" -> "home",
// "/blog/foo-bar" -> "blog-foo-bar", "/About Me" -> "about-me".
export function parseChatPageKey(raw: string | null | undefined): string {
    if (!raw) return "home";
    let s = raw.trim().toLowerCase();
    if (s === "" || s === "/") return "home";
    s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!s) return "home";
    return s.slice(0, 100);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getMessages(pageKey: string): Promise<ChatMessage[]> {
    await hydrate(pageKey);
    return getState(pageKey).messages;
}

export function subscribe(pageKey: string, listener: Listener): () => void {
    const state = getState(pageKey);
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
}

export type SendResult =
    | { ok: true; message: ChatMessage }
    | { ok: false; status: number; error: string; retryAfterMs?: number };

export async function sendMessage(opts: {
    pageKey: string;
    userId: string;
    ip: string;
    handle: string;
    color: string;
    text: unknown;
}): Promise<SendResult> {
    // Validate text
    if (typeof opts.text !== "string") {
        return { ok: false, status: 400, error: "text required" };
    }
    const text = opts.text.replace(/\s+/g, " ").trim();
    if (text.length === 0) {
        return { ok: false, status: 400, error: "empty" };
    }
    if (text.length > MAX_TEXT_LEN) {
        return { ok: false, status: 400, error: "too long" };
    }

    // Rate limit: per-user AND per-IP, whichever is more restrictive.
    const now = Date.now();
    const userKey = `uid:${opts.userId}`;
    const ipKey = `ip:${opts.ip}`;
    const lastUser = lastSend.get(userKey) ?? 0;
    const lastIp = lastSend.get(ipKey) ?? 0;
    const last = Math.max(lastUser, lastIp);
    const elapsed = now - last;
    if (elapsed < COOLDOWN_MS) {
        return {
            ok: false,
            status: 429,
            error: "rate limited",
            retryAfterMs: COOLDOWN_MS - elapsed,
        };
    }

    await hydrate(opts.pageKey);
    const message: ChatMessage = {
        id: crypto.randomUUID(),
        pageKey: opts.pageKey,
        handle: opts.handle,
        color: opts.color,
        text,
        ts: now,
    };

    const state = getState(opts.pageKey);
    state.messages.push(message);
    if (state.messages.length > MAX_MESSAGES) {
        state.messages.splice(0, state.messages.length - MAX_MESSAGES);
    }
    schedulePersist(opts.pageKey);
    broadcastTo(opts.pageKey, { type: "message", message });

    lastSend.set(userKey, now);
    lastSend.set(ipKey, now);

    return { ok: true, message };
}

// Delete a specific message by id (e.g. after an async safety check).
export async function deleteMessage(pageKey: string, id: string): Promise<boolean> {
    await hydrate(pageKey);
    const state = getState(pageKey);
    const idx = state.messages.findIndex((m) => m.id === id);
    if (idx === -1) return false;
    state.messages.splice(idx, 1);
    schedulePersist(pageKey);
    broadcastTo(pageKey, { type: "deleted", id });
    return true;
}

// Build the public anonymous handle for a userId.
export function handleForUser(userId: string, isMod?: boolean): string {
    if (isMod) return "Rek";
    // first 4 hex chars of a stable hash of the id
    let h = 2166136261 >>> 0;
    for (let i = 0; i < userId.length; i++) {
        h ^= userId.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    const hex = (h >>> 0).toString(16).padStart(8, "0").slice(0, 4);
    return `anon-${hex}`;
}
