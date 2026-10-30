'use client'

import { Button } from '@/components/ui/button'

export function Tabs<T extends string>({
    label,
    value,
    options,
    onChange,
}: {
    label: string
    value: T | null
    options: { value: T; label: string }[]
    onChange: (value: T) => void
}) {
    return (
        <div role="group" aria-label={label} className="flex gap-1 rounded-full bg-muted/60 p-1">
            {options.map((option) => (
                <Button
                    type="button"
                    key={option.value}
                    size="sm"
                    variant={value === option.value ? 'outline' : 'ghost'}
                    aria-pressed={value === option.value}
                    onClick={() => onChange(option.value)}
                >
                    {option.label}
                </Button>
            ))}
        </div>
    )
}
