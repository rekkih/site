"use client"

import * as React from "react"
import * as ReactDOM from "react-dom"
import { motion, AnimatePresence } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { cn } from "@/lib/shared/utils"
import { EmailPopup } from "@/components/EmailPopup"

interface ContactOption {
    href: string
    label: string
}

interface ContactSelectClientProps {
    options: ContactOption[]
}

export function ContactSelectClient({ options }: ContactSelectClientProps) {
    const [isOpen, setIsOpen] = React.useState(false)
    const [isHovered, setIsHovered] = React.useState(false)
    const triggerRef = React.useRef<HTMLSpanElement>(null)
    const dropdownRef = React.useRef<HTMLSpanElement>(null)
    const [dropdownPos, setDropdownPos] = React.useState<{ top: number; left: number } | null>(null)

    const updatePos = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect()
            setDropdownPos({
                top: rect.bottom + window.scrollY,
                left: rect.left + window.scrollX,
            })
        }
    }

    const toggleDropdown = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (!hasOthers) return
        if (!isOpen) updatePos()
        setIsOpen(prev => !prev)
    }

    React.useEffect(() => {
        if (!isOpen) return
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node
            if (
                triggerRef.current && !triggerRef.current.contains(target) &&
                dropdownRef.current && !dropdownRef.current.contains(target)
            ) {
                setIsOpen(false)
            }
        }
        const handleScroll = () => setIsOpen(false)
        document.addEventListener("mousedown", handleClickOutside)
        window.addEventListener("scroll", handleScroll, { passive: true })
        return () => {
            document.removeEventListener("mousedown", handleClickOutside)
            window.removeEventListener("scroll", handleScroll)
        }
    }, [isOpen])

    const firstOption = options[0]
    const otherOptions = options.slice(1)
    const hasOthers = otherOptions.length > 0

    const sharedLinkClassName = cn(
        "underline decoration-dotted underline-offset-4 decoration-foreground/40 hover:decoration-foreground/80"
    )

    const renderOption = (option: ContactOption) => {
        const inner = <span className="w-full inline-block">{option.label}</span>
        if (option.href === "emaildialog") {
            return (
                <EmailPopup unstyled className={cn("w-full inline-block")} onClick={() => setIsOpen(false)}>
                    {inner}
                </EmailPopup>
            )
        }
        return (
            <a
                href={option.href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn("w-full inline-block")}
                onClick={() => setIsOpen(false)}
            >
                {option.label}
            </a>
        )
    }

    const labelPart = firstOption.href === "emaildialog" ? (
        <EmailPopup unstyled className={cn("relative z-10", sharedLinkClassName)}>
            {firstOption.label}
        </EmailPopup>
    ) : (
        <a
            href={firstOption.href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn("relative z-10", sharedLinkClassName)}
        >
            {firstOption.label}
        </a>
    )

    const dropdown = dropdownPos && ReactDOM.createPortal(
        <AnimatePresence>
            {isOpen && hasOthers && (
                <motion.span
                    ref={dropdownRef}
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    style={{ top: dropdownPos.top + 6, left: dropdownPos.left }}
                    className="fixed z-50 block"
                >
                    <span className="block min-w-35 rounded-2xl p-1.5 shadow-lg border border-muted/50 bg-popover text-popover-foreground">
                        {otherOptions.map((option, idx) => (
                            <span key={idx} className="block rounded-xl px-2 py-1.5 text-sm cursor-pointer hover:bg-muted">
                                {renderOption(option)}
                            </span>
                        ))}
                    </span>
                </motion.span>
            )}
        </AnimatePresence>,
        document.body
    )

    return (
        <span
            ref={triggerRef}
            className="relative inline-flex items-center gap-1.5 px-1.5 rounded-full select-none"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <AnimatePresence>
                {(isOpen || isHovered) && (
                    <motion.span
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ type: "spring", bounce: 0.4, duration: 0.3 }}
                        className="absolute inset-0 bg-sidebar border rounded-lg -z-10"
                    />
                )}
            </AnimatePresence>

            {labelPart}

            {(hasOthers && isHovered || isOpen) && (
                <motion.span
                    initial={{ scale: 0.8, opacity: 0, translateX: -6 }}
                    animate={{ rotate: isOpen ? 180 : 0, opacity: 1, scale: 1, translateX: 0 }}
                    exit={{ scale: 0.8, opacity: 0, translateX: -6 }}
                    transition={{ type: "spring", bounce: 0.4, duration: 0.3 }}
                    className="flex items-center relative z-10"
                    onClick={toggleDropdown}
                >
                    <HugeiconsIcon
                        icon={ArrowDown01Icon}
                        size={14}
                        className="text-muted-foreground"
                    />
                </motion.span>
            )}

            {dropdown}
        </span>
    )
}
