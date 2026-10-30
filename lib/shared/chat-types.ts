// Anonymous chat message scoped to a single page.

export type ChatMessage = {
    id: string;
    pageKey: string;
    handle: string;     // e.g. "anon-3f9a"
    displayName?: string; // chosen name at posting time; handle remains the stable identity
    color: string;      // deterministic from userId
    text: string;
    ts: number;
};

export type ChatServerEvent =
    | { type: "init"; you: { handle: string; color: string; displayName: string | null }; messages: ChatMessage[]; cooldownMs: number; isMod?: boolean; channel: string }
    | { type: "message"; message: ChatMessage }
    | { type: "deleted"; id: string }
    | { type: "count"; count: number };
