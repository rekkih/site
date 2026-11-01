import { serverFromQuery, type MaimaiServer } from '@/lib/shared/maimai'
import { getRankingService } from '@/lib/server/maimai-store'
import { rankingsCsv } from '@/lib/server/maimai-csv'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
    const value = new URL(request.url).searchParams.get('server') ?? 'all'
    const server = value === 'all' ? 'all' : serverFromQuery(value)
    const headers = { 'Cache-Control': 'no-store' }

    if (!server) {
        return Response.json(
            { error: 'Choose all, ex (International) or m (Japan).' },
            { status: 400, headers },
        )
    }

    try {
        const service = getRankingService()
        const servers: MaimaiServer[] = server === 'all' ? ['international', 'japan'] : [server]
        const histories = await Promise.all(
            servers.map((version) => service.getExport(version)),
        )

        if (!histories.some((history) => history.snapshots.length)) {
            return Response.json(
                { error: 'No saved rankings are available to download yet.' },
                { status: 404, headers },
            )
        }

        return new Response(rankingsCsv(histories), {
            headers: {
                ...headers,
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="maimai-kop8th-${server}.csv"`,
                'X-Content-Type-Options': 'nosniff',
            },
        })
    } catch (error) {
        console.error('[maimai:csv] Download failed:', error)
        return Response.json(
            { error: 'Saved rankings could not be downloaded. Please try again later.' },
            { status: 503, headers },
        )
    }
}
