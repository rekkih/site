"use client";

import { MAX_TEXT_LEN } from "./constants";
import { ArrowUp } from "./icons";
import { useChatContext } from "./ChatContext";

export default function ChatComposer() {
    const { you, input, setInput, sending, error, setError,
        onCooldown, cooldownSec, cooldownUntil, send, onKeyDown } = useChatContext()
    const canSend = !onCooldown && !sending && input.trim().length > 0;

    const cooldownPlaceholder = cooldownSec > 60
        ? `Message again at ${new Date(cooldownUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}…`
        : `Wait ${cooldownSec}s…`;

    return (
        <div className="shrink-0 bg-card rounded-xl m-2.5 mt-0 border border-border in-[.chat-full]:m-5 in-[.chat-full]:rounded-2xl">
            {(!you || error) && (
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border in-[.chat-full]:px-5 in-[.chat-full]:py-3">
                    <span className="text-xs text-muted-foreground in-[.chat-full]:text-lg">connecting…</span>
                    {error && (
                        <span className="ml-auto text-xs text-destructive truncate in-[.chat-full]:text-lg">
                            {error}
                        </span>
                    )}
                </div>
            )}

            {/* Textarea */}
            <div className="px-3 pt-2.5 pb-1 in-[.chat-full]:px-5 in-[.chat-full]:pt-4">
                <textarea
                    value={input}
                    onChange={(e) => {
                        setInput(e.target.value.slice(0, MAX_TEXT_LEN));
                        if (error) setError(null);
                    }}
                    onKeyDown={onKeyDown}
                    rows={1}
                    placeholder={onCooldown ? cooldownPlaceholder : "Add a comment…"}
                    disabled={onCooldown || sending}
                    className="w-full resize-none bg-transparent outline-none text-sm leading-snug
                               text-foreground caret-primary placeholder:text-muted-foreground disabled:opacity-40
                               in-[.chat-full]:text-xl in-[.chat-full]:leading-normal"
                />
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 pb-2.5 in-[.chat-full]:px-4 in-[.chat-full]:pb-4">
                <div />
                {/* Send */}
                <button
                    type="button"
                    onClick={send}
                    disabled={!canSend}
                    aria-label="Send"
                    className={`h-8 w-10 rounded-full flex items-center justify-center active:scale-90 transition-all disabled:cursor-not-allowed in-[.chat-full]:h-12 in-[.chat-full]:w-16 ${canSend ? "bg-primary" : "bg-primary/25"}`}
                >
                    <ArrowUp />
                </button>
            </div>
        </div>
    );
}
