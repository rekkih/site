"use client"

import { useState } from "react"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { cn } from "@/lib/shared/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface HoverLinkProps {
    href: string
    children: React.ReactNode
    className?: string
    /** Override the OG title shown in the card */
    "data-og-title"?: string
    /** Override the OG description shown in the card */
    "data-og-description"?: string
    /** Override the OG hero image URL */
    "data-og-image"?: string
    /** Override the site name shown next to the favicon */
    "data-og-site-name"?: string
    /** Override the favicon — a bare hostname (proxied) or a full image URL */
    "data-favicon"?: string
}

type OGData = {
    title?: string
    description?: string
    image?: string
    siteName?: string
    url: string
}

type State =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; data: OGData }
    | { status: "error" }

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve the favicon <img> src.
 * - If the override looks like a URL (contains "//"), use it directly.
 * - If it's a bare hostname, route it through the proxy.
 * - Otherwise fall back to proxying the link's own hostname.
 */
function faviconSrc(override: string | undefined, hostname: string): string {
    if (!override) return `/api/favicon?domain=${hostname}`
    if (override.includes("//")) return override
    return `/api/favicon?domain=${override}`
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function LinkSkeleton() {
    return (
        <div className="animate-pulse px-4 py-3 space-y-2" style={{ minHeight: 120 }}>
            <div className="h-3 w-16 rounded bg-muted-foreground/20" />
            <div className="h-4 w-48 rounded bg-muted-foreground/20" />
            <div className="h-3 w-full rounded bg-muted-foreground/15" />
            <div className="h-3 w-3/4 rounded bg-muted-foreground/10" />
        </div>
    )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function HoverLink({
    href,
    children,
    className,
    "data-og-title": ogTitle,
    "data-og-description": ogDescription,
    "data-og-image": ogImage,
    "data-og-site-name": ogSiteName,
    "data-favicon": faviconOverride,
}: HoverLinkProps) {
    const hasOverrides = !!(ogTitle || ogDescription || ogImage || ogSiteName || faviconOverride)

    const [state, setState] = useState<State>(
        hasOverrides
            ? {
                status: "ready",
                data: {
                    url: href,
                    title: ogTitle,
                    description: ogDescription,
                    image: ogImage,
                    siteName: ogSiteName,
                },
            }
            : { status: "idle" }
    )
    const [open, setOpen] = useState(false)

    // Only render the card for external http(s) links
    const isExternal = href.startsWith("http://") || href.startsWith("https://")

    if (!isExternal) {
        return (
            <a href={href} className={className}>
                {children}
            </a>
        )
    }

    let hostname: string
    try {
        hostname = new URL(href).hostname
    } catch {
        return (
            <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
                {children}
            </a>
        )
    }

    function handleOpenChange(next: boolean) {
        setOpen(next)
        if (next && state.status === "idle" && !hasOverrides) {
            setState({ status: "loading" })
            fetch(`/api/og?url=${encodeURIComponent(href)}`)
                .then((res) => res.json())
                .then((data: OGData) => setState({ status: "ready", data }))
                .catch(() => setState({ status: "error" }))
        }
    }

    const linkClasses = cn(
        "underline decoration-dotted underline-offset-4 decoration-foreground/40 hover:decoration-foreground/80 transition-colors",
        className
    )

    return (
        <HoverCard open={open} onOpenChange={handleOpenChange} openDelay={300} closeDelay={100}>
            <HoverCardTrigger asChild>
                <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClasses}
                >
                    {children}
                </a>
            </HoverCardTrigger>

            <HoverCardContent className="w-80 p-0 overflow-hidden!" sideOffset={8}>
                {state.status === "loading" ? (
                    <LinkSkeleton />
                ) : state.status === "error" ? (
                    // Minimal error card
                    <div className="px-4 py-3 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={faviconSrc(faviconOverride, hostname)}
                                width={14}
                                height={14}
                                alt=""
                                className="rounded-sm inline-block"
                            />
                            <span className="text-xs text-muted-foreground">{hostname}</span>
                        </div>
                        <div className="border-t border-border/50 pt-2 flex justify-end">
                            <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                            >
                                Open ↗
                            </a>
                        </div>
                    </div>
                ) : state.status === "ready" ? (
                    <>
                        {/* OG image with gradient fade */}
                        {state.data.image && (
                            <div className="relative w-full h-40 bg-muted overflow-hidden">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={state.data.image}
                                    alt=""
                                    className="object-cover w-full h-full"
                                />
                                <div className="absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-background/60 to-transparent" />
                            </div>
                        )}

                        {/* Body */}
                        <div className="px-4 py-3 space-y-1.5">
                            {/* Domain row */}
                            <div className="flex items-center gap-1.5">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={faviconSrc(faviconOverride, hostname)}
                                    width={14}
                                    height={14}
                                    alt=""
                                    className="rounded-sm inline-block"
                                />
                                <span className="text-xs text-muted-foreground">
                                    {state.data.siteName ?? hostname}
                                </span>
                            </div>

                            {/* Title */}
                            <p className="text-sm font-semibold leading-snug">
                                {state.data.title ?? hostname}
                            </p>

                            {/* Description */}
                            {state.data.description && (
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    {state.data.description}
                                </p>
                            )}

                            {/* Footer */}
                            <div className="border-t border-border/50 pt-2 flex justify-end">
                                <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                                >
                                    Open ↗
                                </a>
                            </div>
                        </div>
                    </>
                ) : null}
            </HoverCardContent>
        </HoverCard>
    )
}
