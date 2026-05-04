// Anonymous chat message scoped to a single page.

export type ChatMessage = {
    id: string;
    pageKey: string;
    handle: string;     // e.g. "anon-3f9a"
    color: string;      // deterministic from userId
    text: string;
    ts: number;
};

export type ChatServerEvent =
    | { type: "init"; you: { handle: string; color: string }; messages: ChatMessage[]; cooldownMs: number }
    | { type: "message"; message: ChatMessage }
    | { type: "deleted"; id: string };
