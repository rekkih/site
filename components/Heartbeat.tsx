"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { pageKeyFromPath } from "@/lib/shared/utils";

// Pings /api/heart every 30 s so both the canvas and chat stores can track
// how many users are active on a given page. Renders nothing — SSR-safe.
export default function Heartbeat() {
    const pathname = usePathname();
    const pageKey = pageKeyFromPath(pathname);

    useEffect(() => {
        const ping = () =>
            fetch(`/api/heart?page=${encodeURIComponent(pageKey)}`, {
                method: "POST",
                credentials: "same-origin",
            }).catch(() => { /* ignore network errors */ });

        ping();
        const id = setInterval(ping, 30_000);
        return () => clearInterval(id);
    }, [pageKey]);

    return null;
}
