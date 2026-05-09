"use client";

import React from "react";
import { Separator } from "@/components/ui/separator";
import { monogram } from "./utils";
import { useChatContext } from "./ChatContext";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon } from "@hugeicons/core-free-icons";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** "Jan 5, 2025 · 14:32" */
function fullDate(ts: number): string {
    const d = new Date(ts);
    const date = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${date} · ${hh}:${mm}`;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ChatMessages() {
    const { grouped, you, listRef, isMod, deleteChatMessage } = useChatContext()

    React.useEffect(() => {
        const el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [grouped, listRef]);

    const isEmpty = grouped.length === 0;

    return (
        /*
         * Wrapper is relative so the gradient+blur overlay can be positioned
         * absolutely at the bottom, fading content into the composer above it.
         */
        <div className="relative flex flex-col in-[.chat-full]:flex-1 in-[.chat-full]:min-h-0">
            {/* Gradient + blur fade into composer */}
            <div
                className="pointer-events-none absolute bottom-0 inset-x-0 h-5 mx-4 in-[.chat-full]:h-20 z-10"
                style={{
                    backdropFilter: "blur(4px)",
                    background: "linear-gradient(to bottom, transparent, var(--background))",
                    maskImage: "linear-gradient(to bottom, transparent, black)",
                    WebkitMaskImage: "linear-gradient(to bottom, transparent, black)",
                }}
            />

            {/* Ditto, but for top */}
            <div
                className="pointer-events-none absolute top-0 inset-x-0 h-5 mx-4 in-[.chat-full]:h-20 z-10"
                style={{
                    backdropFilter: "blur(4px)",
                    background: "linear-gradient(to top, transparent, var(--background))",
                    maskImage: "linear-gradient(to top, transparent, black)",
                    WebkitMaskImage: "linear-gradient(to top, transparent, black)",
                }}
            />

            <div
                ref={listRef}
                className="overflow-y-auto max-h-[23.4rem] in-[.chat-full]:flex-1 in-[.chat-full]:max-h-none"
                style={{ scrollbarWidth: "thin", scrollbarColor: "var(--muted-foreground) transparent" }}
            >
                {isEmpty ? (
                    <div className="flex items-center justify-center py-12 text-sm select-none text-muted-foreground in-[.chat-full]:text-xl">
                        No messages yet
                    </div>
                ) : (
                    <div className="flex flex-col gap-6 p-5 in-[.chat-full]:gap-7 in-[.chat-full]:p-5">
                        {grouped.map((group) => (
                            <React.Fragment key={group.label}>
                                {/* ── date divider ───────────────────────────────────────── */}
                                <div className="flex items-center gap-2.5 my-1">
                                    <Separator className="flex-1 bg-border" />
                                    <span className="text-sm whitespace-nowrap shrink-0 select-none text-muted-foreground in-[.chat-full]:text-base">
                                        {group.label}
                                    </span>
                                    <Separator className="flex-1 bg-border" />
                                </div>

                                {/* ── message cards ──────────────────────────────────────── */}
                                {group.messages.map((m) => {
                                    const isYou = you?.handle === m.handle;

                                    return (
                                        <div
                                            key={m.id}
                                            className="group/msg relative flex rounded-lg px-3 py-2 gap-2.5 transition-colors hover:transition-none hover:bg-muted/50 in-[.chat-full]:px-4 in-[.chat-full]:py-3 in-[.chat-full]:gap-4"
                                        >
                                            {m.handle !== 'Rek' && (
                                                <div
                                                    className="size-7 rounded-full flex items-center justify-center shrink-0 mt-1.5 text-[9px] font-bold text-white leading-none in-[.chat-full]:size-10 in-[.chat-full]:text-[13px]"
                                                    style={{ background: m.color }}
                                                    aria-hidden="true"
                                                >
                                                    {monogram(m.handle)}
                                                </div>
                                            )}

                                            {m.handle === 'Rek' && (
                                                <Avatar className="size-7! shrink-0 mt-1.5 in-[.chat-full]:size-10!">
                                                    <AvatarImage asChild src="/images/rek.png">
                                                        <Image src="/images/rek.png" alt="Rek" width={32} height={32} />
                                                    </AvatarImage>
                                                    <AvatarFallback className="text-[9px] font-bold in-[.chat-full]:text-[13px]">R</AvatarFallback>
                                                </Avatar>
                                            )}

                                            <div className="flex-1 min-w-0 space-y-1">
                                                <div className="flex items-center gap-1">
                                                    <span className="text-base font-semibold text-foreground in-[.chat-full]:text-lg">
                                                        {m.handle}
                                                    </span>
                                                    {isYou && (
                                                        <span className="text-base text-muted-foreground in-[.chat-full]:text-lg">
                                                            (you)
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-base text-foreground wrap-break-words in-[.chat-full]:text-lg">
                                                    {m.text}
                                                </p>
                                            </div>

                                            {isMod && (
                                                <button
                                                    onClick={() => deleteChatMessage(m.id)}
                                                    className="self-center shrink-0 opacity-0 group-hover/msg:opacity-100 transition-opacity p-1.5 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive cursor-pointer"
                                                    aria-label="Delete message"
                                                >
                                                    <HugeiconsIcon icon={Delete02Icon} size={15} className="in-[.chat-full]:size-5" />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </React.Fragment>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
