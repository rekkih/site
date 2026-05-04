"use client";

import { AnimatePresence, motion } from "motion/react";
import { Drawer } from "vaul";
import { useChat } from "./useChat";
import { ChatContext } from "./ChatContext";
import ChatPanel from "./ChatPanel";

const spring = { type: "spring" as const, bounce: 0.3, duration: 0.4 };

export default function ChatWidget() {
    const chat = useChat();
    const latest = chat.messages[chat.messages.length - 1];

    const banner = (
        <AnimatePresence mode="wait" initial={false}>
            <motion.div
                key="banner"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="flex items-center gap-2.5 px-3.5 py-2.5 in-[.chat-full]:gap-3.5 in-[.chat-full]:px-5 in-[.chat-full]:py-4"
            >
                {chat.unread > 0 && (
                    <span className="shrink-0 size-2 rounded-full bg-primary in-[.chat-full]:size-2.5" />
                )}

                <div className="flex-1 min-w-0">
                    {latest ? (
                        <p className="flex gap-1 items-center text-xs text-muted-foreground truncate leading-snug in-[.chat-full]:text-base">
                            <span
                                className="text-xs font-bold truncate in-[.chat-full]:text-base"
                                style={{ color: latest.color }}
                            >
                                {latest.handle}
                            </span>
                            <span>{latest.text}</span>
                        </p>
                    ) : (
                        <p className="text-xs text-muted-foreground in-[.chat-full]:text-base">Comments</p>
                    )}
                </div>

                {chat.unread > 0 && (
                    <span className="shrink-0 min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground text-xs font-bold leading-5 text-center select-none in-[.chat-full]:min-w-7 in-[.chat-full]:h-7 in-[.chat-full]:text-sm in-[.chat-full]:leading-7">
                        {chat.unread > 99 ? "99+" : chat.unread}
                    </span>
                )}
            </motion.div>
        </AnimatePresence>
    );

    return (
        <ChatContext.Provider value={chat}>
            {/* ── Mobile: Vaul drawer ── */}
            <Drawer.Root>
                <Drawer.Trigger asChild>
                    <div className="md:hidden fixed bottom-0 z-50 print:hidden">
                        <div className="chat-full overflow-hidden bg-background border border-border shadow-xl rounded-t-xl w-screen border-b-0 cursor-pointer hover:bg-muted/60 active:bg-muted transition-colors">
                            {banner}
                        </div>
                    </div>
                </Drawer.Trigger>

                <Drawer.Portal>
                    <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40 md:hidden" />
                    <Drawer.Content
                        aria-label="Page chat"
                        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex flex-col max-h-[85dvh] bg-background border-t border-border rounded-t-2xl shadow-xl"
                    >
                        <Drawer.Title className="sr-only">Page chat</Drawer.Title>
                        {/* Drag handle */}
                        <div className="mx-auto mt-2 mb-1 h-1.5 w-10 rounded-full bg-muted-foreground/30 shrink-0" />
                        <div className="chat-full flex flex-col flex-1 min-h-0">
                            <ChatPanel />
                        </div>
                    </Drawer.Content>
                </Drawer.Portal>
            </Drawer.Root>

            {/* ── Desktop: floating panel ── */}
            <div className="hidden md:block fixed bottom-0 right-4 z-50 print:hidden">
                <motion.div
                    layout
                    transition={spring}
                    role={chat.open ? "dialog" : undefined}
                    aria-label={chat.open ? "Page chat" : undefined}
                    className={[
                        "overflow-hidden bg-background border border-border shadow-xl",
                        chat.open
                            ? "rounded-2xl w-64 mb-4"
                            : "rounded-t-xl w-64 border-b-0 cursor-pointer hover:bg-muted/60 active:bg-muted transition-colors",
                    ].join(" ")}
                    onClick={!chat.open ? () => chat.setOpen(true) : undefined}
                >
                    <AnimatePresence mode="wait" initial={false}>
                        {chat.open ? (
                            <motion.div
                                key="panel"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.12 }}
                            >
                                <ChatPanel />
                            </motion.div>
                        ) : (
                            <motion.div
                                key="banner"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.12 }}
                            >
                                {banner}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            </div>
        </ChatContext.Provider>
    );
}
