import Link from "next/link";
import DrawingCanvas from "@/components/DrawingCanvas";
import { Body } from "@/components/Body";
import { Content } from "@/components/Content";
import UpdatedDate from "@/components/UpdatedDate";
import UserCountBadge from "@/components/UserCountBadge";
import CurrentTimeAEST from "@/components/CurrentTimeAEST";
import { UserCountProvider } from "@/components/UserCountContext";
import { getAllEntries } from "@/lib/server/entries";
import { Divider } from "@/components/ui/divider";
import getAESTTime from "@/lib/shared/get-aest-time";
import RekkiSignature from "@/components/RekkiSignature";

export default async function Home() {
    const entries = getAllEntries();
    let lastYear = "";

    // Dynamically import the MDX file at build time.
    let MDXContent: React.ComponentType;
    try {
        const mod = await import(`./about.mdx`);
        MDXContent = mod.default;
    } catch {
        MDXContent = () => null;
    }

    return (
        <UserCountProvider>
            <DrawingCanvas />

            <Body>
                {/* main content */}
                <Content as="article" className="text-base animate-stagger">
                    <div className="mb-4 not-prose">
                        <RekkiSignature className="w-24 mb-2" />
                        <p className="text-meta">
                            Updated <UpdatedDate /> <UserCountBadge />
                        </p>
                        <p className="text-meta">
                            <CurrentTimeAEST initialTime={getAESTTime()} />
                        </p>
                    </div>

                    {/* about me */}
                    <MDXContent />

                    <section>
                        <Divider className="my-16 mb-2.5" />
                        <table className="w-full text-base border-collapse">
                            <tbody>
                                {entries.map((entry, i) => {
                                    const year = entry.date
                                        ? new Date(entry.date).getFullYear().toString()
                                        : "";
                                    const showYear = year !== lastYear;
                                    if (showYear) lastYear = year;

                                    const isNewest = i === 0;

                                    const d = entry.date ? new Date(entry.date) : null;
                                    const displayDate = d
                                        ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
                                        : "";

                                    return (
                                        <tr key={entry.slug} className="border-b border-border/50 last:border-0" style={{ animationDelay: `${i * 50}ms` }}>
                                            <td className="entry-year">
                                                {showYear ? year : ""}
                                            </td>
                                            <td className="entry-title">
                                                <Link href={`/${entry.slug}`} className="link-hover" aria-label={`Read "${entry.title}" - ${displayDate}`}>
                                                    {entry.title}
                                                    {entry.adult && <span className="ml-2" aria-label="Adult content">🔞</span>}
                                                    {isNewest && (
                                                        <span className="badge-new" aria-label="New">
                                                            New
                                                        </span>
                                                    )}
                                                </Link>
                                            </td>
                                            <td className="entry-date">{displayDate}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </section>
                </Content>
            </Body>
        </UserCountProvider>
    );
}
