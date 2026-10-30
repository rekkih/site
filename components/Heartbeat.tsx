"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { pageKeyFromPath } from "@/lib/shared/utils";
import { getCanvasSession } from "@/lib/shared/canvas-session-client";

// Pings /api/heart every 30 s so both the canvas and chat stores can track
// how many users are active on a given page. Renders nothing — SSR-safe.
export default function Heartbeat() {
    const pathname = usePathname();
    const pageKey = pageKeyFromPath(pathname);

    useEffect(() => {
        let cancelled = false;
        let interval: ReturnType<typeof setInterval> | undefined;
        const ping = () =>
            fetch(`/api/heart?page=${encodeURIComponent(pageKey)}`, {
                method: "POST",
                credentials: "same-origin",
            }).catch(() => { /* ignore network errors */ });

        // Let the session and SSE streams connect before the first heartbeat.
        getCanvasSession()
            .then(() => { if (!cancelled) interval = setInterval(ping, 30_000); })
            .catch(() => { /* the session is unavailable, so there is nothing to refresh */ });
        return () => { cancelled = true; if (interval) clearInterval(interval); };
    }, [pageKey]);

    return null;
}
