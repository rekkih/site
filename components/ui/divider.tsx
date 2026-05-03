import clsx from 'clsx'
import { ComponentPropsWithoutRef } from 'react'

export function Divider({
    soft = false,
    className,
    ...props
}: { soft?: boolean } & ComponentPropsWithoutRef<'hr'>) {
    return (
        <div className={clsx('hb-divider', className)}>
            <div role="presentation"
                {...props}
                className="h-px w-full dark:bg-neutral-950"
            />
            <div role="presentation"
                className="h-px w-full bg-border" />
        </div>
    )
}
