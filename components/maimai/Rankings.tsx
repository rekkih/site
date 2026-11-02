import 'server-only'

import Link from 'next/link'
import {Button} from '@/components/ui/button'
import {getRankingService} from '@/lib/server/maimai-store'
import {MAIMAI_SERVERS, serverFromQuery, type MaimaiServer, type RankingHistory} from '@/lib/shared/maimai'
import RankingsClient from './RankingsClient'

export {RankingsLoading} from './RankingsLoading'

export default async function Rankings({searchParams}: {
    searchParams: Promise<{server?: string | string[]}>
}) {
    const query = await searchParams
    // Repeated or unknown versions never reach storage or the upstream fetcher.
    const server = Array.isArray(query.server) ? null : serverFromQuery(query.server ?? null)
    let initialData: RankingHistory | undefined
    let initialError = ''
    if (server) {
        try {
            // Use the same fail-closed visibility filtering as the public API.
            initialData = await getRankingService().get(server)
        } catch {
            initialError = 'Ranking storage is unavailable. Please try again later.'
        }
    }

    const initialNow = Date.now()
    return (
        <RankingsClient
            // Every new server response must replace the previous client seed,
            // including a navigation between the default URL and ?server=ex.
            key={`${server ?? 'invalid'}:${initialNow}`}
            server={server}
            initialData={initialData}
            initialError={initialError}
            initialNow={initialNow}
            versionNavigation={
                <nav aria-label="Game version" className="flex gap-1 rounded-full bg-muted/60 p-1">
                    {(Object.keys(MAIMAI_SERVERS) as MaimaiServer[]).map((version) => (
                        <Button key={version} asChild size="sm" variant={server === version ? 'outline' : 'ghost'}>
                            <Link href={`?server=${MAIMAI_SERVERS[version].queryValue}`} prefetch={false} scroll={false}
                                aria-current={server === version ? 'page' : undefined}>
                                {MAIMAI_SERVERS[version].label}
                            </Link>
                        </Button>
                    ))}
                </nav>
            }
        />
    )
}
