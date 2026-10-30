import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import type {Metadata} from 'next'

export const ENTRY_COLLECTIONS = {
    blog: {directory: 'blog', pathname: ''},
} as const

export type EntryCollection = keyof typeof ENTRY_COLLECTIONS;

const globalEntries = globalThis as typeof globalThis & {
    __entriesByCollection?: Partial<Record<EntryCollection, EntryMeta[]>>;
}

export interface EntryMeta {
    slug: string;
    title: string;
    date: string;
    adult?: boolean;
    description?: string;
    draft?: boolean;
}

export interface Entry extends EntryMeta {
    content: string;
}

export function createEntryMetadata(entry: Entry, pathname: string): Metadata {
    const url = `https://rek.lol${pathname}`
    const description = entry.description ?? `An entry by Rekki Harley titled "${entry.title}".`
    return {
        title: entry.title,
        description,
        alternates: {canonical: url},
        openGraph: {
            type: 'article',
            locale: 'en_AU',
            url,
            title: entry.title,
            description,
            siteName: 'Rekki Harley',
            publishedTime: entry.date,
            authors: ['Rekki Harley'],
        },
        twitter: {card: 'summary_large_image', creator: '@rekki', title: entry.title, description},
    }
}

function entriesDirectory(collection: EntryCollection): string {
    return path.join(process.cwd(), 'app', ENTRY_COLLECTIONS[collection].directory)
}

function mdxFiles(collection: EntryCollection): string[] {
    const directory = entriesDirectory(collection)
    if (!fs.existsSync(directory)) return []
    return fs.readdirSync(directory)
        .filter((file) => file.endsWith('.mdx'))
        .map((file) => file.replace(/\.mdx$/, ''))
}

export function getAllEntries(collection: EntryCollection = 'blog'): EntryMeta[] {
    const cache = globalEntries.__entriesByCollection ??= {}
    if (cache[collection]) return cache[collection]

    const directory = entriesDirectory(collection)
    cache[collection] = mdxFiles(collection)
        .map((slug) => {
            const {data} = matter(fs.readFileSync(path.join(directory, `${slug}.mdx`), 'utf-8'))
            return {
                slug,
                title: data.title ?? slug,
                date: data.date,
                adult: data.adult ?? false,
                description: data.description,
                draft: data.draft ?? false,
            } satisfies EntryMeta
        })
        .filter((entry) => !entry.draft)
        .sort((a, b) => (a.date < b.date ? 1 : -1))

    return cache[collection]
}

export function getEntry(slug: string, collection: EntryCollection = 'blog'): Entry | null {
    const filePath = path.join(entriesDirectory(collection), `${slug}.mdx`)
    if (!fs.existsSync(filePath)) return null

    const {data, content} = matter(fs.readFileSync(filePath, 'utf-8'))
    if (data.draft) return null
    return {
        slug,
        title: data.title ?? slug,
        date: data.date,
        adult: data.adult ?? false,
        description: data.description,
        content,
    }
}

/** Get an entry from its normalized pathname, as used by per-page chat. */
export function getEntryByPageKey(pageKey: string): EntryMeta | null {
    for (const collection of Object.keys(ENTRY_COLLECTIONS) as EntryCollection[]) {
        const prefix = ENTRY_COLLECTIONS[collection].pathname.slice(1)
        const entry = getAllEntries(collection).find(({slug}) =>
            [prefix, slug.toLowerCase()].filter(Boolean).join('-') === pageKey,
        )
        if (entry) return entry
    }
    return null
}
