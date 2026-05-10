import {MetadataRoute} from "next";
import { getAllEntries } from "@/lib/server/entries";

export default function sitemap(): MetadataRoute.Sitemap {
    const siteUrl = "https://rek.lol";
    const entries = getAllEntries();

    const entryUrls = entries.map((entry) => ({
        url: `${siteUrl}/${entry.slug}`,
        lastModified: new Date(entry.date),
        changeFrequency: "monthly" as const,
        priority: 0.7,
    }));

    return [
        {
            url: siteUrl,
            lastModified: new Date(),
            changeFrequency: "weekly",
            priority: 1,
        },
        ...entryUrls,
    ];
}
