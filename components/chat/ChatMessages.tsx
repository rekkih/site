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
                className="pointer-events-none absolute bottom-0 inset-x-0 h-4 mx-3 in-[.chat-full]:h-16 z-10"
                style={{
                    backdropFilter: "blur(4px)",
                    background: "linear-gradient(to bottom, transparent, var(--background))",
                    maskImage: "linear-gradient(to bottom, transparent, black)",
                    WebkitMaskImage: "linear-gradient(to bottom, transparent, black)",
                }}
            />

            {/* Ditto, but for top */}
            <div
                className="pointer-events-none absolute top-0 inset-x-0 h-4 mx-3 in-[.chat-full]:h-16 z-10"
                style={{
                    backdropFilter: "blur(4px)",
                    background: "linear-gradient(to top, transparent, var(--background))",
                    maskImage: "linear-gradient(to top, transparent, black)",
                    WebkitMaskImage: "linear-gradient(to top, transparent, black)",
                }}
            />

            <div
                ref={listRef}
                className="overflow-y-auto max-h-75 in-[.chat-full]:flex-1 in-[.chat-full]:max-h-none"
                style={{ scrollbarWidth: "thin", scrollbarColor: "var(--muted-foreground) transparent" }}
            >
                {isEmpty ? (
                    <div className="flex items-center justify-center py-10 text-xs select-none text-muted-foreground in-[.chat-full]:text-lg">
                        No messages yet
                    </div>
                ) : (
                    <div className="flex flex-col gap-4 p-4 in-[.chat-full]:gap-5 in-[.chat-full]:p-3">
                        {grouped.map((group) => (
                            <React.Fragment key={group.label}>
                                {/* ── date divider ───────────────────────────────────────── */}
                                <div className="flex items-center gap-2 my-0.5">
                                    <Separator className="flex-1 bg-border" />
                                    <span className="text-2xs whitespace-nowrap shrink-0 select-none text-muted-foreground in-[.chat-full]:text-sm">
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
                                            className="group/msg relative flex rounded-lg px-2 py-1 gap-1.5 transition-colors hover:transition-none hover:bg-muted/50 [.chat-full_&]:px-3 in-[.chat-full]:py-2.5 in-[.chat-full]:gap-3"
                                        >
                                            {m.handle !== 'Rek' && (
                                                <div
                                                    className="size-5 rounded-full flex items-center justify-center shrink-0 mt-1 text-[6px] font-bold text-white leading-none in-[.chat-full]:size-8 in-[.chat-full]:text-[10px]"
                                                    style={{ background: m.color }}
                                                    aria-hidden="true"
                                                >
                                                    {monogram(m.handle)}
                                                </div>
                                            )}

                                            {m.handle === 'Rek' && (
                                                <Avatar className="size-5! shrink-0 mt-1 in-[.chat-full]:size-8!">
                                                    <AvatarImage asChild src="/images/rek.png">
                                                        <Image src="/images/rek.png" alt="Rek" width={32} height={32} />
                                                    </AvatarImage>
                                                    <AvatarFallback className="text-[6px] font-bold in-[.chat-full]:text-[10px]">R</AvatarFallback>
                                                </Avatar>
                                            )}

                                            <div className="flex-1 min-w-0 space-y-1">
                                                <div className="flex items-center gap-1">
                                                    <span className="text-xs font-semibold text-foreground in-[.chat-full]:text-base">
                                                        {m.handle}
                                                    </span>
                                                    {isYou && (
                                                        <span className="text-xs text-muted-foreground in-[.chat-full]:text-base">
                                                            (you)
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-foreground wrap-break-words in-[.chat-full]:text-base">
                                                    {m.text}
                                                </p>
                                            </div>

                                            {isMod && (
                                                <button
                                                    onClick={() => deleteChatMessage(m.id)}
                                                    className="self-center shrink-0 opacity-0 group-hover/msg:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive cursor-pointer"
                                                    aria-label="Delete message"
                                                >
                                                    <HugeiconsIcon icon={Delete02Icon} size={12} className="in-[.chat-full]:size-4" />
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
