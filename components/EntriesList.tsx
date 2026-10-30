import {ENTRY_COLLECTIONS, type EntryCollection, getAllEntries} from '@/lib/server/entries'
import Link from 'next/link'

interface EntriesListProps {
    collection?: EntryCollection;
    showDescriptions?: boolean;
}

export function EntriesList({collection = 'blog', showDescriptions}: EntriesListProps) {
    const entries = getAllEntries(collection)
    const basePath = ENTRY_COLLECTIONS[collection].pathname
    let lastYear = ''

    return (
        <table className="w-full text-base border-collapse">
            <tbody>
            {entries.map((entry, i) => {
                const year = entry.date
                             ? new Date(entry.date).getFullYear().toString()
                             : ''
                const showYear = year !== lastYear
                if (showYear) lastYear = year

                const isNewest = i === 0

                const d = entry.date ? new Date(entry.date) : null
                const displayDate = d
                                    ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
                                    : ''

                return (
                    <tr key={entry.slug} className="border-b border-border/50 last:border-0" style={{animationDelay: `${i * 50}ms`}}>
                        <td className="entry-year">
                            {showYear ? year : ''}
                        </td>
                        <td className="entry-title">
                            <Link href={`${basePath}/${entry.slug}`} className="link-hover"
                                  aria-label={`Read "${entry.title}${isNewest ? ' New' : ''}" - ${displayDate}`}>
                                <div>
                                    {entry.title}
                                    {entry.adult && <span className="ml-2" aria-label="Adult content">🔞</span>}
                                    {isNewest && (
                                        <span className="badge-new" aria-label="New">
                                            New
                                        </span>
                                    )}
                                </div>
                                {showDescriptions && entry.description && (
                                    <span className="text-sm text-muted-foreground" aria-label="Description">
                                        {entry.description}
                                    </span>
                                )}
                            </Link>
                        </td>
                        <td className="entry-date">{displayDate}</td>
                    </tr>
                )
            })}
            </tbody>
        </table>
    )
}
