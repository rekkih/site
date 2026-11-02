"use client";

import dynamic from "next/dynamic";

const ChatWidget = dynamic(() => import("./chat/ChatWidget"));

export default function DynamicChatWidget({ label }: { label?: string }) {
  return <ChatWidget label={label} />;
}
