'use client'

import {useEffect, useRef, useState} from 'react'
import {useLocalStorage} from 'usehooks-ts'
import {HugeiconsIcon} from '@hugeicons/react'
import {Edit02Icon, InformationCircleIcon} from '@hugeicons/core-free-icons'
import {Alert, AlertDescription, AlertTitle} from '@/components/ui/alert'
import {Button} from '@/components/ui/button'
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {Textarea} from '@/components/ui/textarea'
import {NOTICE_MAX_LENGTH, type MaimaiNotice} from '@/lib/shared/maimai-notice'
import moderatorStyles from './moderator-controls.module.css'
import {NoticeMarkdown} from './NoticeMarkdown'

const ENDPOINT = '/api/maimai/kop8th/notice'

export default function LeaderboardNoticeClient({initialNotice, initialError}: {
    initialNotice: MaimaiNotice | null
    initialError: string
}) {
    const [modToken] = useLocalStorage<string | null>('canvas-mod-token', null, {
        initializeWithValue: false,
        deserializer: (value) => value,
    })
    const [notice, setNotice] = useState<MaimaiNotice | null>(initialNotice)
    const [isMod, setIsMod] = useState(false)
    const [open, setOpen] = useState(false)
    const [draft, setDraft] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [loadError, setLoadError] = useState(initialError)
    const mutation = useRef(0)
    const busy = useRef(false)
    const refreshRef = useRef<() => void>(() => {})

    useEffect(() => {
        let cancelled = false
        let active: AbortController | null = null
        setIsMod(false)

        async function refresh() {
            if (active || busy.current) return
            const controller = new AbortController()
            const revision = mutation.current
            active = controller
            try {
                const response = await fetch(ENDPOINT, {
                    cache: 'no-store', signal: controller.signal,
                    headers: modToken ? {'x-mod-token': modToken} : {},
                })
                const data = await response.json()
                if (cancelled || revision !== mutation.current) return
                setIsMod(data.isMod === true)
                if (!response.ok) throw new Error(data.error ?? 'The notice could not be loaded.')
                setNotice(data.notice)
                setLoadError('')
            } catch (error) {
                if (!cancelled && !controller.signal.aborted && revision === mutation.current)
                    setLoadError(error instanceof Error ? error.message : 'The notice could not be loaded.')
            } finally {
                active = null
            }
        }

        refreshRef.current = () => {void refresh()}
        const visibleRefresh = () => {
            if (document.visibilityState === 'visible') void refresh()
        }
        if (modToken) void refresh()
        const interval = setInterval(visibleRefresh, 60_000)
        document.addEventListener('visibilitychange', visibleRefresh)
        return () => {
            cancelled = true
            active?.abort()
            clearInterval(interval)
            document.removeEventListener('visibilitychange', visibleRefresh)
        }
    }, [modToken])

    async function save(message: string) {
        if (busy.current) return
        busy.current = true
        mutation.current += 1
        setSaving(true)
        setError('')
        try {
            const response = await fetch(ENDPOINT, {
                method: 'PUT', headers: {'Content-Type': 'application/json', 'x-mod-token': modToken ?? ''},
                body: JSON.stringify({message}),
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error ?? 'The notice could not be saved.')
            setNotice(data.notice)
            setLoadError('')
            setOpen(false)
        } catch (error) {
            setError(error instanceof Error ? error.message : 'The notice could not be saved.')
        } finally {
            busy.current = false
            setSaving(false)
        }
    }

    const editor = isMod && (
        <Dialog open={open} onOpenChange={(next) => {
            if (busy.current) return
            if (next) {
                setDraft(notice?.message ?? '')
                setError('')
            }
            setOpen(next)
        }}>
            <DialogTrigger asChild>
                <Button variant="secondary" size="icon"
                    className={`${moderatorStyles.control} rounded-full shadow-sm ${notice ? 'absolute top-2 right-2' : ''}`}
                    aria-label={notice ? 'Edit notice' : 'Add notice'}
                    title={notice ? 'Edit notice' : 'Add notice'}>
                    <HugeiconsIcon icon={Edit02Icon} className="size-5" aria-hidden="true"/>
                </Button>
            </DialogTrigger>
            <DialogContent className="not-prose max-h-[calc(100dvh-2rem)] overflow-y-auto" showCloseButton={!saving}>
                <form className="space-y-6" onSubmit={(event) => {
                    event.preventDefault()
                    if (draft.trim()) void save(draft)
                }}>
                    <DialogHeader>
                        <DialogTitle>{notice ? 'Edit leaderboard notice' : 'Add leaderboard notice'}</DialogTitle>
                        <DialogDescription>
                            Shown to everyone above the International and Japan leaderboards.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <label htmlFor="leaderboard-notice-message" className="text-sm font-medium">Message</label>
                        <Textarea
                            id="leaderboard-notice-message"
                            className="min-h-36 resize-y mt-2"
                            placeholder="What should players know?"
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            maxLength={NOTICE_MAX_LENGTH}
                            disabled={saving}
                            aria-describedby="leaderboard-notice-hint leaderboard-notice-count"
                            onKeyDown={(event) => {
                                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                                    event.preventDefault()
                                    event.currentTarget.form?.requestSubmit()
                                }
                            }}
                        />
                        <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                            <span id="leaderboard-notice-hint">Markdown supported. Line breaks are preserved.</span>
                            <span id="leaderboard-notice-count" className="shrink-0 tabular-nums">{draft.length}/{NOTICE_MAX_LENGTH}</span>
                        </div>
                    </div>
                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                    <DialogFooter className="gap-2">
                        {notice && (
                            <Button type="button" variant="destructive" className="sm:mr-auto" disabled={saving} onClick={() => void save('')}>
                                Remove notice
                            </Button>
                        )}
                        <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button>
                        <Button type="submit" disabled={saving || !draft.trim() || draft.trim() === notice?.message}>
                            {saving ? 'Saving…' : notice ? 'Save changes' : 'Publish notice'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )

    if (!notice && !isMod && !loadError) return null

    return (
        <div className="not-prose my-5">
            {notice ? (
                <div className={`${moderatorStyles.surface} rounded-3xl border border-primary/15 bg-primary/5 p-1 dark:border-primary/25 dark:bg-primary/10`}>
                    {/* Concentric with the outer radius, minus its p-1 inset and 1px border. */}
                    <Alert
                        className="rounded-[calc(var(--radius)*2.2_-_0.25rem_-_1px)] border-primary/10 bg-card p-4 pr-16 text-card-foreground shadow-sm dark:border-foreground/5 dark:shadow-black/20 [&>svg]:text-primary dark:[&>svg]:text-primary-foreground/80"
                        role="note"
                        aria-label="Leaderboard notice"
                    >
                        <HugeiconsIcon icon={InformationCircleIcon} className="size-5" aria-hidden="true"/>
                        <AlertTitle className="flex min-h-6 items-center text-base">
                            Notice
                        </AlertTitle>
                        <AlertDescription className="min-w-0 wrap-anywhere text-base text-foreground/80 leading-relaxed select-text">
                            <NoticeMarkdown message={notice.message}/>
                        </AlertDescription>
                        {editor}
                    </Alert>
                </div>
            ) : editor}
            {loadError && (
                <div role="status" className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    {loadError}
                    <Button variant="ghost" onClick={() => refreshRef.current()}>Retry</Button>
                </div>
            )}
        </div>
    )
}
