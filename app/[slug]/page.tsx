import { notFound } from "next/navigation";
import { getAllEntries, getEntry } from "@/lib/entries";
import DrawingCanvas from "@/components/DrawingCanvas";
import Link from "next/link";

interface Props {
    params: Promise<{ slug: string }>;
}

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

    const date = new Date(entry.date);
    const formatted = date.toLocaleDateString("en-AU", {
        day: "2-digit",
        month: "long",
        year: "numeric",
    });

    return (
        <>
            <DrawingCanvas />
            <div id="content" className="min-h-screen">
                <div className="max-w-xl mx-auto px-7 sm:px-10 py-14">
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

                    <article className="prose prose-neutral dark:prose-invert prose-sm max-w-none prose-headings:font-serif prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
                        <MDXContent />
                    </article>
                </div>
            </div>
        </>
    );
}
