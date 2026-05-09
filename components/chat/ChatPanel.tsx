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
            <div className="flex items-center justify-between px-3 py-2.5 in-[.chat-full]:px-6 in-[.chat-full]:py-5 shrink-0">
                <div className="flex items-center gap-1.5 h-8 px-3 rounded-full text-foreground text-sm font-medium select-none bg-muted in-[.chat-full]:h-11 in-[.chat-full]:px-5 in-[.chat-full]:text-lg">
                    <span>{channel}</span>
                </div>
                <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close chat"
                    className="size-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors bg-muted in-[.chat-full]:size-12"
                >
                    <Close />
                </button>
            </div>

            <ChatMessages />
            <ChatComposer />
        </div>
    );
}
