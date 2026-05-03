import fs from "fs";
import path from "path";
import matter from "gray-matter";

const ENTRIES_DIR = path.join(process.cwd(), "app/entries");

export interface EntryMeta {
    slug: string;
    title: string;
    /** ISO date string in YYYY-MM-DD format, parsed from DD-MM-YYYY, DD/MM/YYYY, or ISO input */
    date: string;
}

export interface Entry extends EntryMeta {
    content: string;
}

/** Parse DD-MM-YYYY or DD/MM/YYYY date string to YYYY-MM-DD format */
function parseDateToISO(dateStr: string): string {
    const parts = dateStr.split(/[\/-]/);
    if (parts.length === 3) {
        // Treat as DD-MM-YYYY: rearrange to YYYY-MM-DD
        const [d, m, y] = parts;
        return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    return dateStr;
}

function mdxFiles(): string[] {
    if (!fs.existsSync(ENTRIES_DIR)) return [];
    return fs
        .readdirSync(ENTRIES_DIR)
        .filter((f) => f.endsWith(".mdx"))
        .map((f) => f.replace(/\.mdx$/, ""));
}

export function getAllEntries(): EntryMeta[] {
    return mdxFiles()
        .map((slug) => {
            const filePath = path.join(ENTRIES_DIR, `${slug}.mdx`);
            const { data } = matter(fs.readFileSync(filePath, "utf-8"));
            return {
                slug,
                title: data.title ?? slug,
                date: parseDateToISO(data.date ?? ""),
            } satisfies EntryMeta;
        })
        .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
}

export function getEntry(slug: string): Entry | null {
    const filePath = path.join(ENTRIES_DIR, `${slug}.mdx`);
    if (!fs.existsSync(filePath)) return null;
    const { data, content } = matter(fs.readFileSync(filePath, "utf-8"));
    return {
        slug,
        title: data.title ?? slug,
        date: parseDateToISO(data.date ?? ""),
        content,
    };
}
