import type { ChatMessage, MessageGroup } from "./types";

export function relativeTime(ts: number): string {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 5) return "just now";
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
}

export function dayLabel(ts: number): string {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function groupByDay(messages: ChatMessage[]): MessageGroup[] {
    const groups: MessageGroup[] = [];
    let cur = "";
    for (const m of messages) {
        const lbl = dayLabel(m.ts);
        if (lbl !== cur) { cur = lbl; groups.push({ label: lbl, messages: [] }); }
        groups[groups.length - 1].messages.push(m);
    }
    return groups;
}

export function pageKeyFromPath(p: string | null): string {
    if (!p || p === "/") return "home";
    const s = p.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return s || "home";
}

/** Two-letter monogram from an "anon-xxxx" handle */
export function monogram(handle: string): string {
    return handle.slice(5, 7).toUpperCase();
}
