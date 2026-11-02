"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { ChatServerEvent } from "@/lib/shared/chat-types";
import { CLIENT_COOLDOWN_MS } from "./constants"; // fallback before server init
import { groupByDay, pageKeyFromPath } from "./utils";
import { useLocalStorage } from "usehooks-ts";
import type { ChatMessage, MessageGroup, YouInfo } from "./types";
import { getCanvasSession } from "@/lib/shared/canvas-session-client";

export type UseChatReturn = {
    // page
    pageKey: string;
    pageLabel: string;
    // channel (entry title or "Comments")
    channel: string;
    // messages
    messages: ChatMessage[];
    grouped: MessageGroup[];
    listRef: React.RefObject<HTMLDivElement | null>;
    // identity
    you: YouInfo | null;
    connected: boolean;
    // panel open state
    open: boolean;
    setOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
    unread: number;
    // composer
    input: string;
    setInput: (v: string) => void;
    displayName: string;
    canSetName: boolean;
    nameSaving: boolean;
    claimName: (name: string) => Promise<{ ok: boolean; error?: string }>;
    sending: boolean;
    error: string | null;
    setError: (v: string | null) => void;
    onCooldown: boolean;
    cooldownSec: number;
    cooldownUntil: number;
    cooldownMs: number;
    send: () => Promise<void>;
    onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    // mod
    isMod: boolean;
    deleteChatMessage: (id: string) => Promise<void>;
};

export function useChat(): UseChatReturn {
    const pathname = usePathname();
    const pageKey = useMemo(() => pageKeyFromPath(pathname), [pathname]);
    const pageLabel = pageKey === "home" ? "/" : `/${pageKey}`;

    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [you, setYou] = useState<YouInfo | null>(null);
    const [connected, setConnected] = useState(false);
    const [unread, setUnread] = useState(0);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [cooldownUntil, setCooldownUntil] = useState(0);
    const [tick, setTick] = useState(() => Date.now());
    const [isMod, setIsMod] = useState(false);
    const [cooldownMs, setCooldownMs] = useState(CLIENT_COOLDOWN_MS);
    const [channel, setChannel] = useState("Comments");
    const [sessionReady, setSessionReady] = useState(false);
    const [nameSaving, setNameSaving] = useState(false);

    const [modToken] = useLocalStorage<string | null>("canvas-mod-token", null, {
        initializeWithValue: false,
        deserializer: (value) => value,
    });
    const displayName = you?.displayName ?? "";
    const canSetName = Boolean(you && !you.displayName && !isMod);

    const listRef = useRef<HTMLDivElement | null>(null);
    const lastSeenRef = useRef<string | null>(null);

    // ── Ensure session cookie exists ──────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        getCanvasSession()
            .then(() => { if (!cancelled) setSessionReady(true); })
            .catch(() => { /* the stream cannot connect without a session */ });
        return () => { cancelled = true; };
    }, []);

    // ── SSE subscription (reset on page change) ────────────────────────────────
    useEffect(() => {
        if (!sessionReady) return;
        let cancelled = false;
        let es: EventSource | null = null;
        let modRefreshTimer: ReturnType<typeof setInterval> | null = null;
        setMessages([]);
        setUnread(0);
        lastSeenRef.current = null;

        async function connect() {
            try {
                await fetch("/api/canvas/mod-session", {
                    method: modToken ? "POST" : "DELETE",
                    credentials: "same-origin",
                    ...(modToken ? { headers: { "x-mod-token": modToken } } : {}),
                });
            } catch { /* an ordinary stream still works */ }
            if (cancelled) return;
            if (modToken) {
                modRefreshTimer = setInterval(() => {
                    void fetch("/api/canvas/mod-session", {
                        method: "POST",
                        credentials: "same-origin",
                        headers: { "x-mod-token": modToken },
                    }).catch(() => { /* the next refresh can retry */ });
                }, 4 * 60 * 1000);
            }
            es = new EventSource(`/api/chat/stream?page=${encodeURIComponent(pageKey)}`, { withCredentials: true });

            es.onopen = () => setConnected(true);
            es.onerror = () => setConnected(false);

            es.onmessage = (ev) => {
            let data: ChatServerEvent;
            try { data = JSON.parse(ev.data) as ChatServerEvent; } catch { return; }

            if (data.type === "init") {
                setYou((current) => ({
                    ...data.you,
                    displayName: current?.handle === data.you.handle
                        ? current.displayName ?? data.you.displayName
                        : data.you.displayName,
                }));
                setMessages(data.messages);
                setIsMod(data.isMod ?? false);
                if (data.cooldownMs != null) setCooldownMs(data.cooldownMs);
                if (data.channel != null) setChannel(data.channel);
                if (data.messages.length > 0)
                    lastSeenRef.current = data.messages[data.messages.length - 1].id;
            } else if (data.type === "message") {
                setMessages((prev) =>
                    prev.some((m) => m.id === data.message.id)
                        ? prev
                        : [...prev, data.message],
                );
            } else if (data.type === "deleted") {
                setMessages((prev) => prev.filter((m) => m.id !== data.id));
            }
            };
        }
        void connect();

        return () => { cancelled = true; es?.close(); if (modRefreshTimer) clearInterval(modRefreshTimer); setConnected(false); };
    }, [pageKey, modToken, sessionReady, setIsMod]);

    // ── Auto-scroll + unread badge ─────────────────────────────────────────────
    useEffect(() => {
        if (!messages.length) return;
        const last = messages[messages.length - 1];

        if (open) {
            const el = listRef.current;
            if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
            lastSeenRef.current = last.id;
            setUnread(0);
        } else {
            const idx = lastSeenRef.current
                ? messages.findIndex((m) => m.id === lastSeenRef.current)
                : -1;
            const fresh = messages.slice(idx + 1).filter((m) => m.handle !== you?.handle);
            setUnread(fresh.length);
        }
    }, [messages, open, you]);

    // ── Cooldown ticker ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!cooldownUntil) return;
        const id = setInterval(() => setTick(Date.now()), 250);
        return () => clearInterval(id);
    }, [cooldownUntil]);

    const remaining = Math.max(0, cooldownUntil - tick);
    const onCooldown = remaining > 0;
    const cooldownSec = Math.ceil(remaining / 1000);

    const claimName = useCallback(async (name: string): Promise<{ ok: boolean; error?: string }> => {
        if (!sessionReady || !canSetName || nameSaving) return { ok: false, error: "Name cannot be changed." };
        setNameSaving(true);
        try {
            const response = await fetch("/api/chat/name", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            const data = await response.json().catch(() => ({})) as { displayName?: string; error?: string };
            if (typeof data.displayName === "string") {
                setYou((current) => current ? { ...current, displayName: data.displayName! } : current);
            }
            if (response.ok) return { ok: true };
            return { ok: false, error: data.error ?? (response.status === 409 ? "Name already set." : "Couldn't save name.") };
        } catch {
            return { ok: false, error: "Network error." };
        } finally {
            setNameSaving(false);
        }
    }, [sessionReady, canSetName, nameSaving]);

    // ── Send ──────────────────────────────────────────────────────────────────
    const send = useCallback(async () => {
        const text = input.trim();
        if (!text || sending || (onCooldown && !isMod)) return;
        setSending(true);
        setError(null);

        try {
            const r = await fetch(
                `/api/chat/send?page=${encodeURIComponent(pageKey)}`,
                {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json", ...(modToken ? { 'x-mod-token': modToken } : {}) },
                    body: JSON.stringify({ text }),
                },
            );

            if (r.status === 429) {
                const d = await r.json().catch(() => ({})) as { retryAfterMs?: number };
                const retryMs = d.retryAfterMs ?? cooldownMs;
                setCooldownUntil(Date.now() + retryMs);
                const retrySec = Math.round(cooldownMs / 1000);
                setError(`1 message per ${retrySec}s.`);
                return;
            }
            if (!r.ok) {
                const d = await r.json().catch(() => ({})) as { error?: string };
                setError(d.error ?? "Couldn't send.");
                return;
            }

            setInput("");
            if (!isMod) setCooldownUntil(Date.now() + cooldownMs);
        } catch {
            setError("Network error.");
        } finally {
            setSending(false);
        }
    }, [input, sending, onCooldown, pageKey, modToken, isMod, cooldownMs]);

    const onKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
        },
        [send],
    );

    const grouped = useMemo(() => groupByDay(messages), [messages]);

    const deleteChatMessage = useCallback(async (id: string) => {
        await fetch(
            `/api/chat/delete?page=${encodeURIComponent(pageKey)}`,
            {
                method: "DELETE",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json", ...(modToken ? { "x-mod-token": modToken } : {}) },
                body: JSON.stringify({ id }),
            },
        );
    }, [pageKey, modToken]);

    return {
        pageKey, pageLabel, channel,
        messages, grouped, listRef,
        you, connected,
        open, setOpen, unread,
        input, setInput, displayName, canSetName, nameSaving, claimName,
        sending, error, setError,
        onCooldown, cooldownSec, cooldownUntil, cooldownMs,
        send, onKeyDown,
        isMod, deleteChatMessage,
    };
}
