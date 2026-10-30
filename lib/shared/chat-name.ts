import { RESERVED_NAME_CONFUSABLES } from "./chat-name-confusables";

export const MAX_CHAT_NAME_LEN = 24;

const RESERVED_NAMES = ["rek", "admin", "administrator", "mod", "moderator", "staff"];
const LATIN_CHARACTER = /\p{Script=Latin}/u;

export function confusableSkeleton(value: string, mappings: Record<string, string> = RESERVED_NAME_CONFUSABLES): string {
    let skeleton = Array.from(value.normalize("NFD"), (char) =>
        LATIN_CHARACTER.test(char) ? char.toLowerCase() : char
    ).join("");
    // Some mappings become another mapped character after casing (M → m → rn).
    for (let pass = 0; pass < 4; pass++) {
        let mapped = "";
        for (const char of skeleton) {
            mapped += mappings[char] ?? char;
        }
        const next = mapped.normalize("NFD").toLowerCase();
        if (next === skeleton) break;
        skeleton = next;
    }
    // Accent marks can leave an otherwise identical moderator name visually close.
    return skeleton.replace(/\p{M}/gu, "");
}

const RESERVED_NAME_SKELETONS = new Set(RESERVED_NAMES.map((name) => confusableSkeleton(name)));

export type ChatNameResult =
    | { valid: true; name: string | null }
    | { valid: false; error: string };

/** A blank name keeps the generated anonymous handle. */
export function parseChatName(value: unknown): ChatNameResult {
    if (value == null || value === "") return { valid: true, name: null };
    if (typeof value !== "string") return { valid: false, error: "Invalid name." };
    if (value.length > MAX_CHAT_NAME_LEN * 4) {
        return { valid: false, error: `Name must be ${MAX_CHAT_NAME_LEN} characters or fewer.` };
    }
    if (/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)) {
        return { valid: false, error: "Name contains unsupported characters." };
    }
    const name = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
    if (!name) return { valid: true, name: null };
    if (name.length > MAX_CHAT_NAME_LEN) {
        return { valid: false, error: `Name must be ${MAX_CHAT_NAME_LEN} characters or fewer.` };
    }
    if (RESERVED_NAME_SKELETONS.has(confusableSkeleton(name))) {
        return { valid: false, error: "That name is reserved." };
    }
    return { valid: true, name };
}
