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
