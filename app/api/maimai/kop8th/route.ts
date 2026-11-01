import { serverFromQuery } from '@/lib/shared/maimai'
import { getRankingService } from '@/lib/server/maimai-store'
import { modTokenOk } from '@/lib/server/mod-auth'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
    const server = serverFromQuery(new URL(request.url).searchParams.get('server'))
    const headers = { 'Cache-Control': 'no-store' }
    if (!server)
        return Response.json(
            { error: 'Choose ex (International) or m (Japan).' },
            { status: 400, headers },
        )
    try {
        const data = await getRankingService().get(server)
        return Response.json({ ...data, isMod: modTokenOk(request) }, {
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

export async function DELETE(request: NextRequest) {
    const headers = { 'Cache-Control': 'no-store' }
    if (!modTokenOk(request))
        return Response.json({ error: 'Moderator access required.' }, { status: 403, headers })

    const server = serverFromQuery(new URL(request.url).searchParams.get('server'))
    if (!server)
        return Response.json({ error: 'Choose ex (International) or m (Japan).' }, { status: 400, headers })

    let userName: unknown
    try {
        userName = (await request.json())?.userName
    } catch {
        return Response.json({ error: 'Invalid request body.' }, { status: 400, headers })
    }
    if (typeof userName !== 'string' || !userName.length || userName.length > 1000)
        return Response.json({ error: 'Provide a player name.' }, { status: 400, headers })

    try {
        await getRankingService().deletePlayer(server, userName)
        return Response.json({ ok: true }, { headers })
    } catch {
        return Response.json(
            { error: 'Scores could not be deleted. Please try again.' },
            { status: 503, headers },
        )
    }
}
