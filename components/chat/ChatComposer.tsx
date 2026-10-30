"use client";

import { useId, useState } from "react";
import { MAX_TEXT_LEN } from "./constants";
import { ArrowUp } from "./icons";
import { useChatContext } from "./ChatContext";
import { Button } from "@/components/ui/button";

export default function ChatComposer() {
    const privacyTitleId = useId();
    const [privacyNoticeAccepted, setPrivacyNoticeAccepted] = useState(false);
    const { you, input, setInput, sending, error, setError,
        onCooldown, cooldownSec, cooldownUntil, send, onKeyDown } = useChatContext()
    const canSend = !onCooldown && !sending && input.trim().length > 0;

    const cooldownPlaceholder = cooldownSec > 60
        ? `Message again at ${new Date(cooldownUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}…`
        : `Wait ${cooldownSec}s…`;

    if (!privacyNoticeAccepted) {
        return (
            <section
                aria-labelledby={privacyTitleId}
                className="shrink-0 bg-card rounded-xl m-2.5 mt-0 p-4 shadow-[inset_0_0_0_1px_var(--border)] in-[.chat-full]:m-5 in-[.chat-full]:rounded-2xl in-[.chat-full]:p-5"
            >
                <h2 id={privacyTitleId} className="text-sm font-semibold text-foreground in-[.chat-full]:text-lg">
                    Comments aren&apos;t truly anonymous
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground in-[.chat-full]:text-base">
                    Your public name is a pseudonym, but this site still collects:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted-foreground in-[.chat-full]:text-base">
                    <li>Your comment, the page you posted it on, and the date and time.</li>
                    <li>A random user ID stored in cookies for one year, used to keep your pseudonym and colour consistent.</li>
                    <li>Your IP address, used internally to enforce the posting limit.</li>
                </ul>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground in-[.chat-full]:text-base">
                    Your pseudonym, comment, and posting time are public. Don&apos;t post anything you consider private.
                </p>
                <Button
                    type="button"
                    size="sm"
                    className="w-full mt-4"
                    onClick={() => setPrivacyNoticeAccepted(true)}
                >
                    I Understand
                </Button>
            </section>
        );
    }

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
                    className={`h-8 w-10 rounded-full flex items-center justify-center transition-transform active:scale-[0.96] disabled:cursor-not-allowed in-[.chat-full]:h-12 in-[.chat-full]:w-16 ${canSend ? "bg-primary" : "bg-primary/25"}`}
                >
                    <ArrowUp />
                </button>
            </div>
        </div>
    );
}
