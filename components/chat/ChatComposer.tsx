'use client'

import {useEffect, useId, useState} from 'react'
import {MAX_TEXT_LEN} from './constants'
import {ArrowUp} from './icons'
import {useChatContext} from './ChatContext'
import {Button} from '@/components/ui/button'
import {MAX_CHAT_NAME_LEN, parseChatName} from '@/lib/shared/chat-name'

const PRIVACY_NOTICE_KEY = 'chat-privacy-notice-accepted'

export default function ChatComposer() {
    const privacyTitleId = useId()
    const nameInputId = useId()
    const [privacyNoticeAccepted, setPrivacyNoticeAccepted] = useState<boolean | null>(null)
    const [nameEditorOpen, setNameEditorOpen] = useState(false)
    const [nameDraft, setNameDraft] = useState('')
    const [nameError, setNameError] = useState<string | null>(null)
    const {
        you, input, setInput, sending, error, setError,
        canSetName, nameSaving, claimName, onCooldown, cooldownSec, cooldownUntil, send, onKeyDown, isMod,
    } = useChatContext()
    const canSend = !onCooldown && !sending && !nameSaving && (isMod || !nameEditorOpen) && input.trim().length > 0

    useEffect(() => {
        try {
            setPrivacyNoticeAccepted(localStorage.getItem(PRIVACY_NOTICE_KEY) === 'true')
        } catch {
            setPrivacyNoticeAccepted(false)
        }
    }, [])

    function acceptPrivacyNotice() {
        try {
            localStorage.setItem(PRIVACY_NOTICE_KEY, 'true')
        } catch {
            // The notice still dismisses for this page if storage is unavailable.
        }
        setPrivacyNoticeAccepted(true)
    }

    const cooldownPlaceholder = cooldownSec > 60
                                ? `Message again at ${new Date(cooldownUntil).toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
        })}…`
                                : `Wait ${cooldownSec}s…`

    async function saveName() {
        const parsed = parseChatName(nameDraft)
        if (!parsed.valid) {
            setNameError(parsed.error)
            return
        }
        if (!parsed.name) {
            setNameError('Choose a name first.')
            return
        }
        const result = await claimName(parsed.name)
        if (!result.ok) {
            setNameError(result.error ?? "Couldn't save name.")
            return
        }
        setNameError(null)
        setError(null)
        setNameEditorOpen(false)
    }

    if (privacyNoticeAccepted === null) return null

    if (!privacyNoticeAccepted) {
        return (
            <section
                aria-labelledby={privacyTitleId}
                className="shrink-0 bg-card rounded-xl m-2.5 mt-0 p-4 shadow-[inset_0_0_0_1px_var(--border)] in-[.chat-full]:m-5 in-[.chat-full]:rounded-2xl in-[.chat-full]:p-5"
            >
                <h2 id={privacyTitleId} className="text-sm font-semibold text-foreground in-[.chat-full]:text-lg">
                    Comments aren&apos;t truly anonymous
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground in-[.chat-full]:text-base">
                    Your public name is either one you choose or a generated pseudonym. This site still collects:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted-foreground in-[.chat-full]:text-base">
                    <li>Your comment, the page you posted it on, and the date and time.</li>
                    <li>Your IP address, used internally to enforce the posting limit.</li>
                </ul>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground in-[.chat-full]:text-base">
                    Your chosen name or anonymous ID, comment, and posting time are public. Don&apos;t post anything you consider private.
                </p>
                <Button
                    type="button"
                    size="sm"
                    className="w-full mt-4"
                    onClick={acceptPrivacyNotice}
                >
                    I Understand
                </Button>
            </section>
        )
    }

    return (
        <div className="shrink-0 bg-card rounded-xl m-2.5 mt-0 border border-border in-[.chat-full]:m-5 in-[.chat-full]:rounded-2xl">
            {(!you || error) && (
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border in-[.chat-full]:px-5 in-[.chat-full]:py-3">
                    <span className="text-xs text-muted-foreground in-[.chat-full]:text-lg">connecting…</span>
                    {error && (
                        <span className="ml-auto text-xs text-destructive truncate in-[.chat-full]:text-lg">
                            {error}
                        </span>
                    )}
                </div>
            )}

            {canSetName && nameEditorOpen && (
                <div className="border-b border-border px-3 py-3 in-[.chat-full]:px-5">
                    <label htmlFor={nameInputId} className="block text-xs font-medium text-foreground in-[.chat-full]:text-base">
                        Your display name
                    </label>
                    <div className="mt-2 flex items-center gap-2">
                        <input
                            id={nameInputId}
                            type="text"
                            autoComplete="nickname"
                            maxLength={MAX_CHAT_NAME_LEN}
                            value={nameDraft}
                            disabled={nameSaving}
                            onChange={(event) => {
                                setNameDraft(event.target.value)
                                setNameError(null)
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') void saveName()
                            }}
                            placeholder={you?.handle ?? 'anon-xxxx'}
                            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring in-[.chat-full]:text-lg"
                        />
                        <Button type="button" size="sm" disabled={nameSaving} onClick={() => void saveName()}>
                            {nameSaving ? 'Saving…' : 'Save'}
                        </Button>
                    </div>
                    {nameError ? (
                        <p role="alert" className="mt-1 text-xs text-destructive">{nameError}</p>
                    ) : (
                         <p className="mt-1 text-xs text-muted-foreground">You can set your name once. Leave it blank to keep your anonymous ID.</p>
                     )}
                </div>
            )}

            {/* Textarea */}
            <div className="px-3 pt-2.5 pb-1 in-[.chat-full]:px-5 in-[.chat-full]:pt-4">
                <textarea
                    value={input}
                    onChange={(e) => {
                        setInput(e.target.value.slice(0, MAX_TEXT_LEN))
                        if (error) setError(null)
                    }}
                    onKeyDown={onKeyDown}
                    rows={1}
                    placeholder={onCooldown ? cooldownPlaceholder : 'Add a comment…'}
                    disabled={onCooldown || sending || nameSaving || (!isMod && nameEditorOpen)}
                    className="w-full resize-none bg-transparent outline-none text-sm leading-snug
                               text-foreground caret-primary placeholder:text-muted-foreground disabled:opacity-40
                               in-[.chat-full]:text-xl in-[.chat-full]:leading-normal"
                />
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 pb-2.5 in-[.chat-full]:px-4 in-[.chat-full]:pb-4">
                {canSetName && <button
                    type="button"
                    aria-expanded={nameEditorOpen}
                    aria-controls={nameEditorOpen ? nameInputId : undefined}
                    onClick={() => {
                        setNameDraft('')
                        setNameError(null)
                        setNameEditorOpen((open) => !open)
                    }}
                    className="min-w-0 truncate rounded-md px-1 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring in-[.chat-full]:text-base"
                >
                    Set name
                </button>}
                {/* Send */}
                <button
                    type="button"
                    onClick={send}
                    disabled={!canSend}
                    aria-label="Send"
                    className={`h-8 w-10 rounded-full flex items-center justify-center transition-transform active:scale-[0.96] disabled:cursor-not-allowed in-[.chat-full]:h-12 in-[.chat-full]:w-16 ${canSend ? 'bg-primary' : 'bg-primary/25'}`}
                >
                    <ArrowUp/>
                </button>
            </div>
        </div>
    )
}
