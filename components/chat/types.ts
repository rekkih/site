import type { ChatMessage } from "@/lib/shared/chat-types";

export type { ChatMessage };
export type YouInfo = { handle: string; color: string; displayName: string | null };
export type MessageGroup = { label: string; messages: ChatMessage[] };
