'use client'

import * as React from 'react'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'
import { HugeiconsIcon } from '@hugeicons/react'
import { Tick02Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/shared/utils'

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
    return (
        <CheckboxPrimitive.Root
            data-slot="checkbox"
            className={cn(
                'size-4 shrink-0 rounded-sm border border-input bg-background outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
                className,
            )}
            {...props}
        >
            <CheckboxPrimitive.Indicator
                data-slot="checkbox-indicator"
                className="flex items-center justify-center text-current [&[data-state=indeterminate]>svg]:hidden [&[data-state=checked]>span]:hidden"
            >
                <span className="h-0.5 w-2.5 bg-current" aria-hidden="true" />
                <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} aria-hidden="true" />
            </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
    )
}

export { Checkbox }
