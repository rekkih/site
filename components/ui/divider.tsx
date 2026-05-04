import { cn } from "@/lib/shared/utils"
import { type ComponentPropsWithoutRef } from 'react'

export function Divider({
    className,
    ...props
}: ComponentPropsWithoutRef<'div'>) {
    return (
        <div className={cn('hb-divider', className)} {...props}>
            <div role="presentation" className="h-px w-full dark:bg-neutral-950" />
            <div role="presentation" className="h-px w-full bg-border" />
        </div>
    )
}
