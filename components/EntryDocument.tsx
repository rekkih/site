import Link from 'next/link'
import {cookies} from 'next/headers'
import AdultGate from '@/components/gate/AdultGate'
import {COOKIE_NAME} from '@/components/gate/constants'
import DynamicChatWidget from '@/components/DynamicChatWidget'
import {Body} from '@/components/Body'
import {Content} from '@/components/Content'
import type {Entry} from '@/lib/server/entries'

interface EntryDocumentProps {
    entry: Entry;
    backHref: string;
    pathname: string;
    children: React.ReactNode;
}

export async function EntryDocument({entry, backHref, pathname, children}: EntryDocumentProps) {
    // Public articles can be prerendered; only gated entries depend on cookies.
    const verified = entry.adult === true && (await cookies()).get(COOKIE_NAME)?.value === 'true'
    const showGate = entry.adult === true && !verified
    const siteUrl = 'https://rek.lol'
    const description = entry.description ?? `An entry by Rekki Harley titled "${entry.title}".`
    const formatted = new Date(entry.date).toLocaleDateString('en-AU', {
        day: '2-digit', month: 'long', year: 'numeric',
    })
    const articleStructuredData = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: entry.title,
        description,
        author: {'@type': 'Person', name: 'Rekki Harley', url: siteUrl},
        publisher: {'@type': 'Person', name: 'Rekki Harley', url: siteUrl},
        datePublished: entry.date,
        mainEntityOfPage: {'@type': 'WebPage', '@id': `${siteUrl}${pathname}`},
    }

    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(articleStructuredData)}}/>
            <Body>
                <Content className="z-10 animate-stagger">
                    <div className="mb-12">
                        <Link href={backHref} className="text-meta-lg link-hover flex items-center gap-2">
                            {'←'} Back
                        </Link>
                    </div>
                    <header className="mb-12">
                        <h1 className="text-[2.375rem] leading-tight tracking-tight mb-2.5 font-serif">{entry.title}</h1>
                        <p className="text-meta-lg">{formatted}</p>
                    </header>
                    {showGate ? <AdultGate destination={pathname}/> : <article className="typography">{children}</article>}
                </Content>
                <DynamicChatWidget/>
            </Body>
        </>
    )
}
