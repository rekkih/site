"use client";

import { MAX_TEXT_LEN } from "./constants";
import { ArrowUp } from "./icons";
import { useChatContext } from "./ChatContext";

export default function ChatComposer() {
    const { you, input, setInput, sending, error, setError,
        onCooldown, cooldownSec, send, onKeyDown } = useChatContext()
    const canSend = !onCooldown && !sending && input.trim().length > 0;

    return (
        <div className="shrink-0 bg-card rounded-xl m-2 border border-border shadow-composer in-[.chat-full]:m-4 in-[.chat-full]:rounded-2xl">
            {(!you || error) && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border in-[.chat-full]:px-4 in-[.chat-full]:py-2.5">
                    <span className="text-2xs text-muted-foreground in-[.chat-full]:text-base">connecting…</span>
                    {error && (
                        <span className="ml-auto text-2xs text-destructive truncate in-[.chat-full]:text-base">
                            {error}
                        </span>
                    )}
                </div>
            )}

            {/* Textarea */}
            <div className="px-2.5 pt-2 pb-0.5 in-[.chat-full]:px-4 in-[.chat-full]:pt-3.5">
                <textarea
                    value={input}
                    onChange={(e) => {
                        setInput(e.target.value.slice(0, MAX_TEXT_LEN));
                        if (error) setError(null);
                    }}
                    onKeyDown={onKeyDown}
                    rows={1}
                    placeholder={
                        onCooldown
                            ? `Wait ${cooldownSec}s…`
                            : "Add a comment…"
                    }
                    disabled={onCooldown || sending}
                    className="w-full resize-none bg-transparent outline-none text-xs leading-snug
                               text-foreground caret-primary placeholder:text-muted-foreground disabled:opacity-40
                               in-[.chat-full]:text-lg in-[.chat-full]:leading-normal"
                />
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between px-3 pb-2 in-[.chat-full]:px-3 in-[.chat-full]:pb-3.5">
                <div />
                {/* Send */}
                <button
                    type="button"
                    onClick={send}
                    disabled={!canSend}
                    aria-label="Send"
                    className={`h-6 w-8 rounded-full flex items-center justify-center active:scale-90 transition-all disabled:cursor-not-allowed in-[.chat-full]:h-10 in-[.chat-full]:w-14 ${canSend ? "bg-primary" : "bg-primary/25"}`}
                >
                    <ArrowUp />
                </button>
            </div>
        </div>
    );
}
