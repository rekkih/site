/** In-process identity state with idle expiry and a hard cardinality limit. */
export class BoundedIdentityMap<T> {
    readonly boundedIdentityMap = true;
    private readonly entries = new Map<string, { value: T; expiresAt: number }>();

    constructor(private readonly ttlMs: number, private readonly maxEntries: number) {
        if (ttlMs <= 0 || maxEntries <= 0) throw new Error("Invalid identity cache limits");
        const timer = setInterval(() => this.prune(), Math.max(1_000, Math.min(ttlMs, 60_000)));
        timer.unref?.();
    }

    get size(): number { return this.entries.size; }

    get(key: string, now = Date.now()): T | undefined {
        const entry = this.entries.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt <= now) {
            this.entries.delete(key);
            return undefined;
        }
        return entry.value;
    }

    set(key: string, value: T, now = Date.now()): void {
        // Map insertion order is the last write order, so this evicts the
        // least recently active identity when capacity is reached.
        this.entries.delete(key);
        if (this.entries.size >= this.maxEntries) this.prune(now);
        while (this.entries.size >= this.maxEntries) {
            this.entries.delete(this.entries.keys().next().value!);
        }
        this.entries.set(key, { value, expiresAt: now + this.ttlMs });
    }

    delete(key: string): void { this.entries.delete(key); }

    prune(now = Date.now()): void {
        for (const [key, entry] of this.entries) {
            if (entry.expiresAt <= now) this.entries.delete(key);
        }
    }
}

export function isBoundedIdentityMap<T>(value: unknown): value is BoundedIdentityMap<T> {
    return typeof value === "object" && value !== null &&
        "boundedIdentityMap" in value && value.boundedIdentityMap === true;
}
