"use client";

import { useUserCount } from "@/components/UserCountContext";

export default function UserCountBadge() {
    const { count } = useUserCount();

    // Count is total connections, subtract 1 for "others" (excluding yourself)
    const others = Math.max(0, count - 1);

    if (others <= 0) return null;

    return (
        <span className="text-muted-foreground/70">
            &middot; {others} {others === 1 ? "other" : "others"} with you
        </span>
    );
}
