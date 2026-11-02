import type {NextRequest} from 'next/server'
import {modTokenOk} from '@/lib/server/mod-auth'
import {getNoticeStore} from '@/lib/server/maimai-notice'
import {NOTICE_MAX_LENGTH} from '@/lib/shared/maimai-notice'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = {'Cache-Control': 'no-store'}

export async function GET(request: NextRequest) {
    const isMod = modTokenOk(request)
    try {
        return Response.json({notice: await getNoticeStore().get(), isMod}, {headers})
    } catch {
        return Response.json({error: 'The notice could not be loaded.', isMod}, {status: 503, headers})
    }
}

export async function PUT(request: NextRequest) {
    if (!modTokenOk(request))
        return Response.json({error: 'Moderator access required.'}, {status: 403, headers})

    let message: unknown
    try {
        message = (await request.json())?.message
    } catch {
        return Response.json({error: 'Invalid request body.'}, {status: 400, headers})
    }
    if (typeof message !== 'string' || message.length > NOTICE_MAX_LENGTH)
        return Response.json({error: `Use a message of up to ${NOTICE_MAX_LENGTH} characters.`}, {status: 400, headers})

    try {
        return Response.json({notice: await getNoticeStore().set(message.trim())}, {headers})
    } catch {
        return Response.json({error: 'The notice could not be saved. Please try again.'}, {status: 503, headers})
    }
}
