import { serverFromQuery } from '@/lib/shared/maimai'
import { getRankingService } from '@/lib/server/maimai-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
    const server = serverFromQuery(new URL(request.url).searchParams.get('server'))
    const headers = { 'Cache-Control': 'no-store' }
    if (!server)
        return Response.json(
            { error: 'Choose ex (International) or m (Japan).' },
            { status: 400, headers },
        )
    try {
        const data = await getRankingService().get(server)
        return Response.json(data, {
            status: data.status === 'error' && !data.snapshots.length ? 503 : 200,
            headers,
        })
    } catch {
        return Response.json(
            { error: 'Ranking storage is unavailable. Please try again later.' },
            { status: 503, headers },
        )
    }
}
