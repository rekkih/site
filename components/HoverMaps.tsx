"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { cn } from "@/lib/shared/utils"

interface HoverMapsProps {
    loc: string
    children: React.ReactNode
    className?: string
    label?: string
    lat?: number
    lng?: number
    zoom?: number
}

type State =
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; lat: number; lng: number }

const LeafletMap = dynamic<{ lat: number; lng: number; zoom: number; label: string }>(
    () => import("./StaticLeafletMap"),
    { ssr: false }
)

async function geocode(loc: string): Promise<{ lat: number; lng: number } | null> {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(loc)}&format=jsonv2&limit=1`,
            { headers: { Accept: "application/json" } }
        )
        const data = await res.json()
        if (!data?.[0]) return null
        return { lat: Number(data[0].lat), lng: Number(data[0].lon) }
    } catch {
        return null
    }
}

export function HoverMaps({ loc, children, className, label, lat, lng, zoom = 14 }: HoverMapsProps) {
    const [state, setState] = useState<State>(
        lat != null && lng != null ? { status: "ready", lat, lng } : { status: "loading" }
    )

    useEffect(() => {
        if (lat != null && lng != null) {
            setState({ status: "ready", lat, lng })
            return
        }

        let cancelled = false
        geocode(loc).then((coords) => {
            if (!cancelled)
                setState(coords ? { status: "ready", ...coords } : { status: "error" })
        })
        return () => { cancelled = true }
    }, [loc, lat, lng])

    // apple maps
    const searchUrl = `https://maps.apple.com/?q=${encodeURIComponent(loc)}`

    return (
        <HoverCard openDelay={200} closeDelay={100}>
            <HoverCardTrigger asChild>
                <span className={cn(
                    "cursor-help underline decoration-dotted underline-offset-4 decoration-foreground/40 hover:decoration-foreground/80 transition-colors",
                    className
                )}>
                    {children}
                </span>
            </HoverCardTrigger>

            <HoverCardContent className="relative w-80 p-0 overflow-hidden!" sideOffset={8}>
                <div className="relative w-full h-44 bg-background overflow-hidden z-0">
                    {state.status === "ready" ? (
                        <LeafletMap lat={state.lat} lng={state.lng} zoom={zoom} label={label ?? loc} />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                            {state.status === "loading" ? "Loading map…" : "Unable to load map"}
                        </div>
                    )}
                </div>

                {/* Hovering info */}
                <div
                    className="pointer-events-none absolute bottom-8 inset-x-0 h-18 z-10"
                    style={{
                        backdropFilter: "blur(4px)",
                        background: "linear-gradient(to bottom, transparent, var(--background))",
                        maskImage: "linear-gradient(to bottom, transparent, black)",
                        WebkitMaskImage: "linear-gradient(to bottom, transparent, black)",
                    }}
                />
                <div className="fixed bottom-0 left-0 bg-background h-8 rounded-b-3xl w-full px-4 flex items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs font-medium text-foreground truncate">&copy; OpenStreetMap contributors</span>
                    </div>
                    <a
                        href={searchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                    >
                        Apple Maps ↗
                    </a>
                </div>
            </HoverCardContent>
        </HoverCard>
    )
}
