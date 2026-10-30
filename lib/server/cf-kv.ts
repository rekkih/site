// Minimal Cloudflare Workers KV REST client.

const ACCOUNT = process.env.CF_ACCOUNT_ID;
const NS = process.env.CF_KV_NAMESPACE_ID;
const TOKEN = process.env.CF_API_TOKEN;

export const kvConfigured = Boolean(ACCOUNT && NS && TOKEN);

function url(key: string) {
    return `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/storage/kv/namespaces/${NS}/values/${encodeURIComponent(key)}`;
}

function authHeaders(): HeadersInit {
    return { Authorization: `Bearer ${TOKEN}` };
}

export async function kvGet<T = unknown>(key: string): Promise<T | null> {
    if (!kvConfigured) return null;
    const res = await fetch(url(key), {
        headers: authHeaders(),
        cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) {
        console.error("[cf-kv] GET failed", key, res.status, await res.text());
        return null;
    }
    const text = await res.text();
    if (!text) return null;
    try {
        return JSON.parse(text) as T;
    } catch {
        return null;
    }
}

export async function kvPut(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
    if (!kvConfigured) return false;
    const u = ttlSeconds ? `${url(key)}?expiration_ttl=${ttlSeconds}` : url(key);
    const res = await fetch(u, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(value),
    });
    if (!res.ok) {
        console.error("[cf-kv] PUT failed", key, res.status, await res.text());
        return false;
    }
    return true;
}

export async function kvDelete(key: string): Promise<boolean> {
    if (!kvConfigured) return false;
    const res = await fetch(url(key), { method: "DELETE", headers: authHeaders() });
    return res.ok;
}

// Archive callers must distinguish a missing key from an unavailable store.
// Keep the existing best-effort helpers unchanged for canvas/chat callers.
export async function kvGetStrict<T = unknown>(key: string): Promise<T | null> {
    if (!kvConfigured) throw new Error("KV is not configured");
    const res = await fetch(url(key), { headers: authHeaders(), cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`KV read failed (${res.status})`);
    return await res.json() as T;
}

export async function kvPutStrict(key: string, value: unknown): Promise<void> {
    if (!kvConfigured) throw new Error("KV is not configured");
    const res = await fetch(url(key), {
        method: "PUT", headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(value), signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`KV write failed (${res.status})`);
}

export async function kvListStrict(prefix: string): Promise<string[]> {
    if (!kvConfigured) throw new Error("KV is not configured");
    const keys: string[] = [];
    let cursor = "";
    const seen = new Set<string>();
    do {
        const query = new URLSearchParams({ prefix, limit: "1000", ...(cursor ? { cursor } : {}) });
        const endpoint = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/storage/kv/namespaces/${NS}/keys?${query}`;
        const res = await fetch(endpoint, { headers: authHeaders(), cache: "no-store", signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error(`KV list failed (${res.status})`);
        const body = await res.json() as { success: boolean; result: { name: string }[]; result_info?: { cursor?: string } };
        if (!body.success || !Array.isArray(body.result) || body.result.some(key => typeof key.name !== "string" || !key.name.startsWith(prefix))) {
            throw new Error("Invalid KV list response");
        }
        keys.push(...body.result.map(key => key.name));
        cursor = body.result_info?.cursor ?? "";
        if (cursor && seen.has(cursor)) throw new Error("Repeated KV pagination cursor");
        seen.add(cursor);
    } while (cursor);
    return keys;
}
