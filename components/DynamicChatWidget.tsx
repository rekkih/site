"use client";

import dynamic from "next/dynamic";

const ChatWidget = dynamic(() => import("./chat/ChatWidget"), { ssr: false });

export default function DynamicChatWidget({ label }: { label?: string }) {
  return <ChatWidget label={label} />;
}
