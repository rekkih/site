// A display name belongs to the signed anonymous session and can be claimed once.
// A Redis script atomically claims both the user's name and its unique identity.

import { createHash } from "node:crypto";
import { confusableSkeleton } from "../shared/chat-name";
import { CHAT_NAME_CONFUSABLES } from "./chat-name-confusables";

// Both keys share a Redis Cluster slot so the claim script stays atomic.
const PREFIX = "chat:{names}:v1:display-name:";
const OWNER_PREFIX = "chat:{names}:v1:name-owner:";
const CLAIM_SCRIPT = `
local existing = redis.call('GET', KEYS[1])
if existing then return {0, existing} end
local owner = redis.call('GET', KEYS[2])
if owner then return {2, ''} end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], ARGV[2])
return {1, ARGV[1]}
`;

const globalStore = globalThis as typeof globalThis & {
    __chatNames?: Map<string, string>;
    __chatNameOwners?: Map<string, string>;
};
const localNames = globalStore.__chatNames ??= new Map<string, string>();
const localOwners = globalStore.__chatNameOwners ??= new Map<string, string>();

export type ClaimChatNameResult =
    | { status: "claimed"; name: string }
    | { status: "already_claimed"; name: string }
    | { status: "taken" };

function identity(name: string): string {
    const normalized = name.normalize("NFKC").replace(/\s+/gu, " ").trim();
    return confusableSkeleton(normalized, CHAT_NAME_CONFUSABLES);
}

type StoreOptions = {
    redisUrl?: string;
    redisToken?: string;
    production: boolean;
    fetcher?: typeof fetch;
    memory?: Map<string, string>;
    owners?: Map<string, string>;
};

export function createChatNameStore({ redisUrl, redisToken, production, fetcher = fetch, memory = new Map(), owners = new Map() }: StoreOptions) {
    // Preserve names claimed before an HMR reload in local development.
    for (const [userId, name] of memory) {
        const canonical = identity(name);
        if (!owners.has(canonical)) owners.set(canonical, userId);
    }

    function hasRedis(): boolean {
        if (redisUrl && redisToken) return true;
        if (production) throw new Error("Chat name store is not configured");
        return false;
    }

    async function command(parts: (string | number)[]): Promise<unknown> {
        const response = await fetcher(redisUrl!, {
            method: "POST",
            headers: { Authorization: `Bearer ${redisToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(parts),
            signal: AbortSignal.timeout(5000),
            cache: "no-store",
        });
        if (!response.ok) throw new Error(`Chat name store unavailable (${response.status})`);
        const data: unknown = await response.json();
        if (!data || typeof data !== "object" || !("result" in data)) {
            throw new Error("Invalid chat name store response");
        }
        return data.result;
    }

    function key(userId: string): string {
        return `${PREFIX}${userId}`;
    }

    function ownerKey(name: string): string {
        const digest = createHash("sha256").update(identity(name)).digest("hex");
        return `${OWNER_PREFIX}${digest}`;
    }

    async function get(userId: string): Promise<string | null> {
        if (!hasRedis()) return memory.get(userId) ?? null;
        const result = await command(["GET", key(userId)]);
        if (result === null || typeof result === "string") return result;
        throw new Error("Invalid stored chat name");
    }

    async function claim(userId: string, name: string): Promise<ClaimChatNameResult> {
        if (!hasRedis()) {
            const existing = memory.get(userId);
            if (existing !== undefined) return { status: "already_claimed", name: existing };
            const canonical = identity(name);
            if (owners.has(canonical)) return { status: "taken" };
            memory.set(userId, name);
            owners.set(canonical, userId);
            return { status: "claimed", name };
        }
        const result = await command(["EVAL", CLAIM_SCRIPT, 2, key(userId), ownerKey(name), name, userId]);
        if (!Array.isArray(result) || result.length !== 2) throw new Error("Invalid chat name claim response");
        if (result[0] === 1 && result[1] === name) return { status: "claimed", name };
        if (result[0] === 0 && typeof result[1] === "string") return { status: "already_claimed", name: result[1] };
        if (result[0] === 2) return { status: "taken" };
        throw new Error("Invalid chat name claim response");
    }

    return { get, claim };
}

const store = createChatNameStore({
    redisUrl: process.env.UPSTASH_REDIS_REST_URL,
    redisToken: process.env.UPSTASH_REDIS_REST_TOKEN,
    production: process.env.NODE_ENV === "production",
    memory: localNames,
    owners: localOwners,
});

export const getChatName = store.get;
export const claimChatName = store.claim;
