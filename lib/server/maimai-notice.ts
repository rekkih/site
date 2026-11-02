import {kvConfigured, kvGetStrict, kvPutStrict} from './cf-kv'
import type {MaimaiNotice} from '../shared/maimai-notice'

const NOTICE_KEY = 'maimai:kop8th:notice:v1'

export function createNoticeStore(storage: {
    get(key: string): Promise<MaimaiNotice | null>
    put(key: string, value: MaimaiNotice | null): Promise<void>
}) {
    return {
        get: () => storage.get(NOTICE_KEY),
        async set(message: string): Promise<MaimaiNotice | null> {
            const notice = message ? {message, updatedAt: Date.now()} : null
            // A null record clears the notice without needing a separate delete path.
            await storage.put(NOTICE_KEY, notice)
            return notice
        },
    }
}

const globalStore = globalThis as typeof globalThis & {
    __maimaiNoticeStore?: ReturnType<typeof createNoticeStore>
}

export function getNoticeStore() {
    if (!kvConfigured && process.env.NODE_ENV !== 'development')
        throw new Error('Notice persistence is not configured')

    if (!globalStore.__maimaiNoticeStore) {
        let notice: MaimaiNotice | null = null
        globalStore.__maimaiNoticeStore = createNoticeStore(kvConfigured
            ? {get: (key) => kvGetStrict<MaimaiNotice>(key), put: kvPutStrict}
            : {get: async () => notice, put: async (_key, value) => {notice = value}})
    }
    return globalStore.__maimaiNoticeStore
}
