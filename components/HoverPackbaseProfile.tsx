"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { cn } from "@/lib/shared/utils"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"

interface PackbaseUser {
    id: string
    created_at: string
    username: string
    slug: string
    display_name: string
    type: string
    space_type: string
    post_privacy: string
    is_r18: boolean
    owner_id: string
    last_online: string
    default_pack: string
    about: { bio: string }
    images: { avatar: string; header: string }
    badge: string
    xp: number
}

type State =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; data: PackbaseUser }

function formatXP(xp: number): string {
    if (xp >= 1_000_000) return `${(xp / 1_000_000).toFixed(1)}M`
    if (xp >= 1_000) return `${(xp / 1_000).toFixed(1)}K`
    return xp.toString()
}

function getTimeAgo(lastOnline: string): string {
    const now = new Date()
    const online = new Date(lastOnline)
    const diffMs = now.getTime() - online.getTime()

    const minutes = Math.floor(diffMs / 60_000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (minutes < 1) return "just now"
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
}

function isOnline(lastOnline: string): boolean {
    const diffMs = Date.now() - new Date(lastOnline).getTime
        ()
    return diffMs < 60 * 60 * 1_000 // within the last hour
}

async function fetchUser(username: string): Promise<PackbaseUser | null> {
    try {
        const res = await fetch(`https://vgs.packbase.app/user/${username}`, {
            headers: { Accept: "application/json" },
        })
        if (!res.ok) return null
        return res.json()
    } catch {
        return null
    }
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function ProfileSkeleton() {
    return (
        <div className="animate-pulse">
            {/* header */}
            <div className="w-full h-28 bg-muted" />
            <div className="px-4 pb-4">
                {/* avatar */}
                <div className="-mt-8 mb-3">
                    <div className="size-16 rounded-full bg-muted-foreground/20 border-2 border-background" />
                </div>
                {/* lines */}
                <div className="space-y-2">
                    <div className="h-4 w-32 rounded bg-muted-foreground/20" />
                    <div className="h-3 w-20 rounded bg-muted-foreground/15" />
                    <div className="h-3 w-full rounded bg-muted-foreground/10 mt-3" />
                    <div className="h-3 w-3/4 rounded bg-muted-foreground/10" />
                </div>
            </div>
        </div>
    )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface HoverPackbaseProfileProps {
    username: string
    children: React.ReactNode
    className?: string
}

export function HoverPackbaseProfile({ username, children, className }: HoverPackbaseProfileProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [state, setState] = useState<State>({ status: "idle" })

    useEffect(() => {
        if (isOpen && state.status === "idle") {
            let cancelled = false
            setState({ status: "loading" })
            fetchUser(username).then((data) => {
                if (!cancelled)
                    setState(data ? { status: "ready", data } : { status: "error" })
            })
            return () => { cancelled = true }
        }
    }, [isOpen, username])

    useEffect(() => {
        setState({ status: "idle" })
    }, [username])

    return (
        <HoverCard openDelay={250} closeDelay={100} onOpenChange={setIsOpen}>
            <HoverCardTrigger asChild>
                <a
                    className={cn(
                        "cursor-pointer underline decoration-dotted underline-offset-4 decoration-foreground/40 hover:decoration-foreground/80 transition-colors",
                        className
                    )}
                    href={`https://packbase.app/@${username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    {children}
                </a>
            </HoverCardTrigger>

            <HoverCardContent
                className="w-72 p-0 overflow-hidden!"
                sideOffset={10}
            >
                {(state.status === "loading" || state.status === "idle") ? (
                    <ProfileSkeleton />
                ) : state.status === "error" ? (
                    <div className="flex flex-col items-center justify-center gap-2 h-44 text-muted-foreground">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="size-8 opacity-40"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                        >
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 8v4m0 4h.01" strokeLinecap="round" />
                        </svg>
                        <p className="text-xs">Couldn't load profile</p>
                    </div>
                ) : (
                    <>
                        {/* Header image with gradient fade */}
                        <div className="relative w-full h-28 bg-muted overflow-hidden">
                            <Image
                                src={state.data.images.header}
                                alt=""
                                fill
                                className="object-cover"
                            />
                            {/* bottom fade so avatar floats out naturally */}
                            <div className="absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-background/60 to-transparent" />
                        </div>

                        {/* Body */}
                        <div className="px-4 pb-4">
                            {/* Avatar row */}
                            <div className="flex items-end justify-between -mt-8 mb-3">
                                <div className="relative">
                                    <Avatar className="size-16 ring-2 ring-background shadow-md">
                                        <AvatarImage asChild src={state.data.images.avatar}>
                                            <Image
                                                src={state.data.images.avatar}
                                                alt={state.data.display_name}
                                                width={64}
                                                height={64}
                                            />
                                        </AvatarImage>
                                        <AvatarFallback className="text-lg font-semibold">
                                            {state.data.display_name?.[0] ?? "?"}
                                        </AvatarFallback>
                                    </Avatar>

                                    {isOnline(state.data.last_online) && (
                                        <span className="absolute bottom-0.5 right-0.5 flex size-3.5">
                                            <span className="relative inline-flex size-3.5 rounded-full bg-green-500 border-2 border-background" />
                                        </span>
                                    )}
                                </div>

                                {/* XP chip */}
                                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 16 16"
                                        fill="currentColor"
                                        className="size-3 text-amber-400"
                                    >
                                        <path d="M8 1.25l1.927 3.905 4.308.627-3.118 3.04.736 4.292L8 10.987l-3.853 2.127.736-4.292L1.765 5.782l4.308-.627L8 1.25z" />
                                    </svg>
                                    {formatXP(state.data.xp)} XP
                                </span>
                            </div>

                            {/* Name + username */}
                            <div className="space-y-0.5 mb-2">
                                <h3 className="font-semibold leading-tight text-foreground">
                                    {state.data.display_name}
                                </h3>
                                <p className="text-xs text-muted-foreground">
                                    @{state.data.slug}
                                </p>
                            </div>

                            {/* Bio */}
                            {state.data.about.bio && (
                                <p className="text-sm text-foreground/80 leading-relaxed line-clamp-3 mb-3">
                                    {state.data.about.bio}
                                </p>
                            )}

                            {/* Footer row */}
                            <div className="flex items-center justify-between pt-2 border-t border-border/50">
                                <span className="text-xs text-muted-foreground">
                                    {isOnline(state.data.last_online) ? (
                                        <span className="text-green-500 font-medium">Online now</span>
                                    ) : (
                                        <>Last seen {getTimeAgo(state.data.last_online)}</>
                                    )}
                                </span>
                                <a
                                    href={`https://packbase.app/@${username}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs font-medium text-foreground/60 hover:text-foreground transition-colors flex items-center gap-1"
                                >
                                    View profile
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.75"
                                        className="size-3"
                                    >
                                        <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </a>
                            </div>
                        </div>
                    </>
                )}
            </HoverCardContent>
        </HoverCard>
    )
}
