"use client";

import dynamic from "next/dynamic";

const ChatWidget = dynamic(() => import("./chat/ChatWidget"), { ssr: false });

export default function DynamicChatWidget() {
  return <ChatWidget />;
}