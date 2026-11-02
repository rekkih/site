'use client'

import * as React from 'react'
import { cn } from '@/lib/shared/utils'
import { Checkbox } from '@/components/ui/checkbox'

interface TableSelection {
    selectedKeys: readonly string[]
    onSelectionChange: (selectedKeys: string[]) => void
}

interface TableProps extends React.ComponentProps<'table'> {
    selection?: TableSelection
}

interface TableRowProps extends React.ComponentProps<'tr'> {
    selectionKey?: string
    selectionLabel?: string
}

const TableSelectionContext = React.createContext<TableSelection | undefined>(undefined)
const TableHeaderContext = React.createContext(false)

function Table({ className, selection, ...props }: TableProps) {
    return (
        <TableSelectionContext.Provider value={selection}>
            <table
                data-slot="table"
                className={cn(
                    'w-full border-collapse text-left text-base text-foreground',
                    className,
                )}
                {...props}
            />
        </TableSelectionContext.Provider>
    )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
    return (
        <TableHeaderContext.Provider value={true}>
            <thead
                data-slot="table-header"
                className={cn('border-b border-border bg-background', className)}
                {...props}
            />
        </TableHeaderContext.Provider>
    )
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
    return (
        <tbody
            data-slot="table-body"
            className={cn('[&>tr:last-child]:border-0', className)}
            {...props}
        />
    )
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
    return (
        <tfoot
            data-slot="table-footer"
            className={cn('border-t border-border font-medium', className)}
            {...props}
        />
    )
}

function TableRow({ className, children, selectionKey, selectionLabel, ...props }: TableRowProps) {
    const selection = React.useContext(TableSelectionContext)
    const isHeader = React.useContext(TableHeaderContext)
    const selectable = selection !== undefined && selectionKey !== undefined && !isHeader
    const selected = selectable && selection.selectedKeys.includes(selectionKey)

    function changeSelection(checked: boolean) {
        if (!selection || selectionKey === undefined) {
            return
        }

        const nextKeys = selection.selectedKeys.filter((key) => key !== selectionKey)

        if (checked) {
            nextKeys.push(selectionKey)
        }

        selection.onSelectionChange(nextKeys)
    }

    return (
        <tr
            data-slot="table-row"
            data-state={selectable ? (selected ? 'selected' : 'unselected') : undefined}
            aria-selected={selectable ? selected : undefined}
            className={cn(
                'border-b border-border/50 transition-colors hover:transition-none hover:bg-muted/30 data-[state=selected]:bg-muted/50 data-[state=selected]:hover:bg-muted/70',
                className,
            )}
            {...props}
        >
            {selection &&
                (isHeader ? (
                    <TableHead className="w-10">
                        <span className="sr-only">Selection</span>
                    </TableHead>
                ) : (
                    <TableCell className="w-10">
                        {selectable && (
                            <Checkbox
                                checked={selected}
                                onCheckedChange={(checked) => changeSelection(checked === true)}
                                aria-label={`Select ${selectionLabel ?? selectionKey}`}
                            />
                        )}
                    </TableCell>
                ))}
            {children}
        </tr>
    )
}

function TableHead({ className, scope = 'col', ...props }: React.ComponentProps<'th'>) {
    return (
        <th
            data-slot="table-head"
            scope={scope}
            className={cn('px-2 py-3 text-sm font-medium text-muted-foreground', className)}
            {...props}
        />
    )
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
    return (
        <td data-slot="table-cell" className={cn('px-2 py-3 align-middle', className)} {...props} />
    )
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
    return (
        <caption
            data-slot="table-caption"
            className={cn('mt-4 caption-bottom text-sm text-muted-foreground', className)}
            {...props}
        />
    )
}

export { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableCaption }
export type { TableSelection, TableProps, TableRowProps }
