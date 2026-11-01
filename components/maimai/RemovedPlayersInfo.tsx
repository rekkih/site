'use client'

import {useState} from 'react'
import {InformationCircleIcon} from '@heroicons/react/24/outline'
import {Button} from '@/components/ui/button'
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'

export function RemovedPlayersInfo({players}: {players: string[]}) {
    const [open, setOpen] = useState(false)

    return (
        <Tooltip open={open} onOpenChange={setOpen}>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground"
                    aria-label="Players removed by moderators"
                    onClick={() => setOpen((previous) => !previous)}
                >
                    <InformationCircleIcon aria-hidden="true" className="size-5"/>
                </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-h-[min(24rem,70dvh)] overflow-y-auto">
                <div className="min-w-0">
                    {players.length ? (
                        <>
                            <p className="font-medium">Removed by moderators</p>
                            <ul className="mt-1 space-y-1">
                                {players.map((name) => <li key={name} className="break-words">{name}</li>)}
                            </ul>
                        </>
                    ) : (
                        <p>No players have been removed by moderators.</p>
                    )}
                </div>
            </TooltipContent>
        </Tooltip>
    )
}
