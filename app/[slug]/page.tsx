import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { EntryDocument } from "@/components/EntryDocument";
import { createEntryMetadata, getAllEntries, getEntry } from "@/lib/server/entries";

interface Props { params: Promise<{ slug: string }>; }

export function generateStaticParams() {
    return getAllEntries().map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const entry = getEntry(slug);
    if (!entry) return {};
    return createEntryMetadata(entry, `/${slug}`);
}

export default async function EntryPage({ params }: Props) {
    const { slug } = await params;
    const entry = getEntry(slug);
    if (!entry) notFound();
    let MDXContent: React.ComponentType;
    try {
        MDXContent = (await import(`../blog/${slug}.mdx`)).default;
    } catch {
        notFound();
    }
    return <EntryDocument entry={entry} backHref="/" pathname={`/${slug}`}><MDXContent /></EntryDocument>;
}
