import 'server-only'

import {getNoticeStore} from '@/lib/server/maimai-notice'
import type {MaimaiNotice} from '@/lib/shared/maimai-notice'
import LeaderboardNoticeClient from './LeaderboardNoticeClient'

export default async function LeaderboardNotice() {
    let initialNotice: MaimaiNotice | null = null
    let initialError = ''
    try {
        const notice = await getNoticeStore().get()
        // Serialize public fields only, never a storage record wholesale.
        if (notice) initialNotice = {message: notice.message, updatedAt: notice.updatedAt}
    } catch {
        initialError = 'The notice could not be loaded.'
    }
    return <LeaderboardNoticeClient initialNotice={initialNotice} initialError={initialError}/>
}
