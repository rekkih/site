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
                <Content className="text-sm space-y-4 animate-stagger">
                    <div className="mb-12 space-y-2">
                        <h1 className="font-serif text-[1.9rem] leading-tight tracking-tight">
                            Rekki Harley
                        </h1>
                        <p className="text-[.82rem] text-muted-foreground">
                            Updated <UpdatedDate /> <UserCountBadge />
                        </p>
                        <p className="text-xs text-muted-foreground">
                            <CurrentTimeAEST initialTime={getAESTTime()} />
                        </p>
                    </div>

                    {/* about me */}
                    <MDXContent />

                    <section>
                        <Divider className="my-12 mb-2" />
                        <table className="w-full text-sm border-collapse">
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
                                            <td className="py-2.5 pr-5 text-xs text-muted-foreground w-12 align-top pt-3">
                                                {showYear ? year : ""}
                                            </td>
                                            <td className="py-2.5 pr-4">
                                                <Link href={`/${entry.slug}`} className="hover:text-primary transition-colors">
                                                    {entry.title}
                                                    {entry.adult && <span className="ml-1.5">🔞</span>}
                                                    {isNewest && (
                                                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-sm bg-primary/10 text-primary">
                                                            New
                                                        </span>
                                                    )}
                                                </Link>
                                            </td>
                                            <td className="py-2.5 text-xs text-muted-foreground text-right tabular-nums whitespace-nowrap">{displayDate}</td>
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
