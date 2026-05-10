"use client";

import dynamic from "next/dynamic";

const DrawingCanvas = dynamic(() => import("./DrawingCanvas"), { ssr: false });

export default function DynamicDrawingCanvas() {
  return <DrawingCanvas />;
}