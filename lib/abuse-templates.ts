// Forbidden shape templates stored in KV with in-memory caching.

import { kvConfigured, kvGet, kvPut } from "./cf-kv";
import type { ShapeTemplate } from "./shape-recognizer";

const KV_KEY = "canvas:v1:abuse-templates";
const REFRESH_MS = 30_000;

type Cache = {
    templates: ShapeTemplate[];
    fetchedAt: number;
    inflight: Promise<ShapeTemplate[]> | null;
};

const g = globalThis as unknown as { __abuseTpl?: Cache };
const cache: Cache = (g.__abuseTpl ??= {
    templates: [],
    fetchedAt: 0,
    inflight: null,
});

async function loadFromKv(): Promise<ShapeTemplate[]> {
    if (!kvConfigured) return [];
    const data = await kvGet<{ templates: ShapeTemplate[] }>(KV_KEY);
    return data?.templates ?? [];
}

export async function getTemplates(force = false): Promise<ShapeTemplate[]> {
    const now = Date.now();
    if (!force && now - cache.fetchedAt < REFRESH_MS) return cache.templates;
    if (cache.inflight) return cache.inflight;
    cache.inflight = (async () => {
        try {
            cache.templates = await loadFromKv();
            cache.fetchedAt = Date.now();
        } finally {
            cache.inflight = null;
        }
        return cache.templates;
    })();
    return cache.inflight;
}

export async function saveTemplates(templates: ShapeTemplate[]): Promise<boolean> {
    cache.templates = templates;
    cache.fetchedAt = Date.now();
    if (!kvConfigured) return false;
    return kvPut(KV_KEY, { templates });
}

export async function addTemplate(t: ShapeTemplate): Promise<boolean> {
    const all = await getTemplates(true);
    return saveTemplates([...all, t]);
}

export async function removeTemplate(id: string): Promise<boolean> {
    const all = await getTemplates(true);
    return saveTemplates(all.filter((t) => t.id !== id));
}
