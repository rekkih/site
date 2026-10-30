// Chat and display-name moderation through OpenAI's dedicated Moderation API.

const INVISIBLE_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/gu;

export function looksLikeUrl(text: string): boolean {
    const normalized = text
        .normalize("NFKC")
        .toLowerCase()
        .replace(INVISIBLE_CHARACTERS, "")
        .replace(/\s*[\[({]\s*(?:\.|dot|d0t)\s*[\])}]\s*/giu, ".")
        .replace(/\s+(?:dot|d0t)\s+/giu, ".")
        .replace(/\s*[\[({]\s*(?:\/|slash)\s*[\])}]\s*/giu, "/")
        .replace(/\s+slash\s+/giu, "/");

    const compact = normalized.replace(/\s+/gu, "");
    const urlish = normalized.replace(/\s*([.:,/?#@])\s*/gu, "$1");
    const label = String.raw`[\p{L}\p{N}](?:[\p{L}\p{N}_-]{0,61}[\p{L}\p{N}])?`;

    return (
        /(?:https?|hxxps?|ftp):?\/{0,2}|www\d{0,3}\.|(?:mailto|tel):/iu.test(compact) ||
        new RegExp(String.raw`(?:^|[^\p{L}\p{N}_-])${label}(?:\.${label})+(?::\d{1,5})?(?:[/?#]|$)`, "iu").test(urlish) ||
        /(?:^|[^\d])(?:\d{1,3}[.,]){3}\d{1,3}(?::\d{1,5})?(?:[/?#]|$)/u.test(urlish) ||
        /(?:^|[^\p{L}\p{N}_-])localhost(?::\d{1,5})?(?:[/?#]|$)/iu.test(urlish)
    );
}

export type DeterministicSafetyResult =
    | { safe: true }
    | { safe: false; reason: string };

/**
 * Catch high-confidence adversarial spam before it is persisted. This is kept
 * deliberately narrow: the model still handles semantic moderation, while
 * this layer handles patterns that are easy to obfuscate from a model.
 */
export function checkDeterministicMessageSafety(text: string): DeterministicSafetyResult {
    const normalized = text
        .normalize("NFKC")
        .replace(INVISIBLE_CHARACTERS, "")
        .toLowerCase();
    const words = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
    const compact = words.join("");

    const promptInjectionPatterns = [
        /(?:ignore|disregard|forget)(?:all|any|the)?(?:previous|prior|above)(?:instructions?|prompts?|rules?)/u,
        /(?:reveal|repeat|print|show)(?:the|your)?(?:system|developer|hidden)(?:message|prompt|instructions?)/u,
        /(?:system|developer|assistant)(?:message|prompt|instructions?)/u,
        /(?:youare|actas|pretendyouare)(?:now)?(?:a|an|the)?(?:moderator|assistant|system|ai)/u,
        /(?:override|bypass|disable)(?:the|your)?(?:safety|moderation|rules?|filter)/u,
    ];
    if (promptInjectionPatterns.some((pattern) => pattern.test(compact))) {
        return { safe: false, reason: "prompt injection" };
    }

    if (/(.)\1{11,}/u.test(normalized)) {
        return { safe: false, reason: "repeated characters" };
    }

    if (words.length >= 8) {
        const counts = new Map<string, number>();
        for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
        if (Math.max(...counts.values()) >= 6) {
            return { safe: false, reason: "repeated text" };
        }
    }

    // Long encoded blobs are a common way to hide payloads from text filters.
    if (/(?:[a-z\d+/]{80,}={0,2})/iu.test(normalized.replace(/\s+/gu, ""))) {
        return { safe: false, reason: "encoded payload" };
    }

    return { safe: true };
}

type ModerationResult = { flagged: boolean; categories: Record<string, boolean | null> };
type ModerationResponse = { results?: ModerationResult[] };

export type SafetyResult = { safe: boolean; reason: string };

/** Classify each input separately, so a display name cannot mask a message. */
export async function checkMessageSafety(text: string, displayName?: string | null): Promise<SafetyResult> {
    const inputs = displayName ? [text, displayName] : [text];
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        if (process.env.NODE_ENV !== "production") return { safe: true, reason: "local moderation disabled" };
        throw new Error("OPENAI_API_KEY is not configured");
    }

    const response = await fetch("https://api.openai.com/v1/moderations", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "omni-moderation-latest", input: inputs }),
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
    });
    if (!response.ok) throw new Error(`OpenAI moderation failed (${response.status})`);
    const data: ModerationResponse = await response.json();
    if (!Array.isArray(data.results) || data.results.length !== inputs.length) {
        throw new Error("OpenAI moderation returned an invalid result count");
    }
    for (const result of data.results) {
        if (typeof result?.flagged !== "boolean" || !result.categories || typeof result.categories !== "object") {
            throw new Error("OpenAI moderation returned an invalid result");
        }
        if (result.flagged) {
            const categories = Object.entries(result.categories)
                .filter(([, flagged]) => flagged === true)
                .map(([category]) => category);
            return { safe: false, reason: categories.join(", ") || "flagged by OpenAI moderation" };
        }
    }
    return { safe: true, reason: "not flagged" };
}
