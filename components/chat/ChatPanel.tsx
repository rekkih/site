"use client";

import ChatMessages from "./ChatMessages";
import ChatComposer from "./ChatComposer";
import { Close } from "./icons";
import { useChatContext } from "./ChatContext";

export default function ChatPanel() {
    const { setOpen, channel } = useChatContext();

    return (
        <div className="flex flex-col in-[.chat-full]:flex-1 in-[.chat-full]:min-h-0">
            {/* Header */}
            <div className="flex items-center justify-between px-2.5 py-2 in-[.chat-full]:px-5 in-[.chat-full]:py-4 shrink-0">
                <div className="flex items-center gap-1 h-6 px-2.5 rounded-full text-foreground text-xs font-medium select-none bg-muted in-[.chat-full]:h-9 in-[.chat-full]:px-4 in-[.chat-full]:text-base">
                    <span>{channel}</span>
                </div>
                <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close chat"
                    className="size-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors bg-muted in-[.chat-full]:size-10"
                >
                    <Close />
                </button>
            </div>

            <ChatMessages />
            <ChatComposer />
        </div>
    );
}
