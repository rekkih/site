import {MetadataRoute} from "next";
import {ENTRY_COLLECTIONS, type EntryCollection, getAllEntries} from "@/lib/server/entries";

export default function sitemap(): MetadataRoute.Sitemap {
    const siteUrl = "https://rek.lol";
    const entryUrls = (Object.keys(ENTRY_COLLECTIONS) as EntryCollection[])
        .flatMap((collection) => getAllEntries(collection).map((entry) => ({
            url: `${siteUrl}${ENTRY_COLLECTIONS[collection].pathname}/${entry.slug}`,
            lastModified: new Date(entry.date),
            changeFrequency: "monthly" as const,
            priority: 0.7,
        })));

    return [
        {
            url: siteUrl,
            lastModified: new Date(),
            changeFrequency: "weekly",
            priority: 1,
        },
        {
            url: `${siteUrl}/maimai/kop8th`,
            changeFrequency: "daily",
            priority: 0.7,
        },
        ...entryUrls,
    ];
}
