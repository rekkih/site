"use client";

import { createContext, useContext } from "react";
import type { UseChatReturn } from "./useChat";

export const ChatContext = createContext<UseChatReturn | null>(null);

export function useChatContext(): UseChatReturn {
    const ctx = useContext(ChatContext);
    if (!ctx) throw new Error("useChatContext must be used inside ChatWidget");
    return ctx;
}
