import { notFound } from "next/navigation";
import { getAllEntries, getEntry } from "@/lib/server/entries";
import DrawingCanvas from "@/components/DrawingCanvas";
import Link from "next/link";
import { Body } from "@/components/Body";
import { Content } from "@/components/Content";
import AdultGate from "@/components/AdultGate";
import { cookies } from "next/headers";

interface Props {
    params: Promise<{ slug: string }>;
}

const COOKIE_NAME = "age_verified";

export async function generateStaticParams() {
    return getAllEntries().map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }: Props) {
    const { slug } = await params;
    const entry = getEntry(slug);
    if (!entry) return {};
    return { title: entry.title };
}

export default async function EntryPage({ params }: Props) {
    const { slug } = await params;
    const entry = getEntry(slug);
    if (!entry) notFound();

    // Dynamically import the MDX file at build time.
    let MDXContent: React.ComponentType;
    try {
        const mod = await import(`../entries/${slug}.mdx`);
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

    return (
        <>
            <DrawingCanvas />
            <Body>
                <Content className="z-10 animate-stagger">
                    <div className="mb-10">
                        <Link
                            href="/"
                            className="text-[.82rem] text-muted-foreground hover:text-primary transition-colors"
                        >
                            ← Back
                        </Link>
                    </div>

                    <header className="mb-10">
                        <h1 className="font-serif text-[1.9rem] leading-tight tracking-tight mb-2">
                            {entry.title}
                        </h1>
                        <p className="text-[.82rem] text-muted-foreground">{formatted}</p>
                    </header>

                    {showGate ? (
                        <AdultGate slug={slug} />
                    ) : (
                        <article className="prose prose-neutral dark:prose-invert prose-sm max-w-none prose-headings:font-serif prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
                            <MDXContent />
                        </article>
                    )}
                </Content>
            </Body>
        </>
    );
}
