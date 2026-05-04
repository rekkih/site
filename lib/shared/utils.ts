import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/** FNV-1a 32-bit hash — deterministic, fast, good distribution. */
export function fnvHash(s: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/**
 * Normalize a Next.js pathname or raw key to a stable, URL-safe page key.
 * e.g. "/" → "home", "/Blog/Foo Bar" → "blog-foo-bar"
 */
export function pageKeyFromPath(p: string | null | undefined): string {
    if (!p || p === "/") return "home";
    const s = p.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return s.slice(0, 100) || "home";
}
