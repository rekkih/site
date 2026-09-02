import { notFound } from "next/navigation";
import { getAllEntries, getEntry } from "@/lib/server/entries";
import DynamicDrawingCanvas from "@/components/DynamicDrawingCanvas";
import Link from "next/link";
import { Body } from "@/components/Body";
import { Content } from "@/components/Content";
import AdultGate from "@/components/gate/AdultGate";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/components/gate/constants";
import DynamicChatWidget from "@/components/DynamicChatWidget";
import { Metadata } from "next";

interface Props {
    params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
    return getAllEntries().map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const entry = getEntry(slug);
    if (!entry) return {};

    const siteUrl = "https://rek.lol";
    const url = `${siteUrl}/${slug}`;
    const description = entry.description ?? `An entry by Rekki Harley titled "${entry.title}".`;

    return {
        title: entry.title,
        description,
        alternates: {
            canonical: url,
        },
        openGraph: {
            type: "article",
            locale: "en_AU",
            url,
            title: entry.title,
            description,
            siteName: "Rekki Harley",
            publishedTime: entry.date,
            authors: ["Rekki Harley"],
        },
        twitter: {
            card: "summary_large_image",
            creator: "@rekki",
            title: entry.title,
            description,
        },
    };
}

export default async function EntryPage({ params }: Props) {
    const { slug } = await params;
    const entry = getEntry(slug);
    if (!entry) notFound();

    // Dynamically import the MDX file at build time.
    let MDXContent: React.ComponentType;
    try {
        const mod = await import(`../blog/${slug}.mdx`);
        MDXContent = mod.default;
    } catch {
        notFound();
    }

    // Check if adult content requires verification
    const isAdult = entry.adult === true;
    const verified = (await cookies()).get(COOKIE_NAME)?.value === "true";
    const showGate = isAdult && !verified;

    const date = new Date(entry.date);
    const formatted = date.toLocaleDateString("en-AU", {
        day: "2-digit",
        month: "long",
        year: "numeric",
    });

    const siteUrl = "https://rek.lol";
    const url = `${siteUrl}/${slug}`;
    const description = entry.description ?? `An entry by Rekki Harley titled "${entry.title}".`;

    const articleStructuredData = {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: entry.title,
        description,
        author: {
            "@type": "Person",
            name: "Rekki Harley",
            url: siteUrl,
        },
        publisher: {
            "@type": "Person",
            name: "Rekki Harley",
            url: siteUrl,
        },
        datePublished: entry.date,
        mainEntityOfPage: {
            "@type": "WebPage",
            "@id": url,
        },
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(articleStructuredData) }}
            />
            {/*<DynamicDrawingCanvas />*/}
            <Body>
                <Content className="z-10 animate-stagger">
                    <div className="mb-12">
                        <Link
                            href="/"
                            className="text-meta-lg link-hover"
                        >
                            ← Back
                        </Link>
                    </div>

                    <header className="mb-12">
                        <h1 className="font-serif text-[2.375rem] leading-tight tracking-tight mb-2.5">
                            {entry.title}
                        </h1>
                        <p className="text-meta-lg">{formatted}</p>
                    </header>

                    {showGate ? (
                        <AdultGate slug={slug} />
                    ) : (
                        <article className="typography">
                            <MDXContent />
                        </article>
                    )}
                </Content>

                <DynamicChatWidget />
            </Body>
        </>
    );
}
