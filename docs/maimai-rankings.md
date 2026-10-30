# maimai KOP8th history

The qualifying-results section is automatic. Both official schedules close on 23 November 2026 at 23:59 JST, represented as the exclusive boundary `2026-11-24T00:00:00+09:00`. Before then, the section is hidden. After closing, it waits for an archived SEGA snapshot dated at or after that boundary, then displays the top two International or top seven Japan finishers, plus a separate Japan LCQ list for places 8–15. It uses the latest eligible snapshot, preserves SEGA's ordering for tied ranks, and waits if leading places are missing. These are qualifying positions from the feed, not confirmation that finalists completed registration or attended. No moderator action or additional API/storage is needed. Rules: https://maimai.sega.jp/kop8th/maimai/ and https://maimai.sega.com/kop8th/maimai_itr_en/.

Download all saved snapshots as CSV from `/api/maimai/kop8th/csv`, also linked in the page's “About this history” section. The export includes both versions by default; `?server=ex` or `?server=m` limits it to one. Downloads only read saved history and never trigger collection. Each row includes the version, source update, collection time, rank, player name, score, sub-score, and record date. An empty cache returns 404; unavailable storage returns 503.

`/maimai/kop8th` defaults to International. `?server=ex` selects International and `?server=m` selects Japan Ver.; the API uses the same parameter at `/api/maimai/kop8th`.

The first visitor to a version collects its current SEGA feed. After that, the first visit after 02:00 JST (International) or 07:00 JST (Japan) checks again. If the source has not published the expected daily update, or a request fails, another visit can retry after 30 minutes. An open visible tab checks every 30 minutes and on returning to the tab. There is no scheduler, Worker, or historical backfill: days without visitors can be missed.

Configure the existing `CF_ACCOUNT_ID`, `CF_KV_NAMESPACE_ID`, and `CF_API_TOKEN` on the Next.js server. The token needs KV read/list/write access to that namespace. Production returns an unavailable response if KV is not configured. Development without KV uses process-local memory, surviving HMR but not restarts. No additional secrets are required.

Snapshots are stored without expiration under `maimai:kop8th:{international|japan}:snapshot:{sourceTimestampMilliseconds}`. Each value contains `collectedAt` and the complete original `payload`, including fields not used by the graph. Existing timestamps are never intentionally rewritten, even if SEGA later changes their contents. The `:check` key stores refresh timing/status separately. Archives are the source of truth; there is no mutable history index. Reads paginate and load at most six archive values concurrently, retaining loaded immutable snapshots in memory.

Cloudflare KV is eventually consistent. Per-process single-flight refreshes and stable archive keys prevent duplicate graph entries, but simultaneous instances may fetch and write the same timestamp. This is not a distributed exactly-once collector. Storage and upstream failures are logged with a `[maimai:version]` prefix and surfaced in the page without deleting history.

Player identity is exact display name within a server. Search alone normalizes full-width text. Renames start new histories; duplicate names in a snapshot are excluded from connected series and still displayed in the standings. Missing players produce gaps. Scores are SEGA's numeric totals, not assumed percentages. Both source timestamp formats are interpreted as JST.

Placement arrows and score differences compare exact player names against the latest snapshot from the previous JST calendar day. Missing days, new/renamed players, and duplicate names have no change indicator. The graph defaults to score and selects the top ten; the searchable table supports sorting, left-side selection markers, and horizontal scrolling on mobile.

Validation: `bun test lib/server/maimai*.test.ts lib/server/cf-kv.test.ts lib/shared/maimai*.test.ts components/maimai/RankingChart.test.tsx`, `bunx tsc --noEmit --incremental false`, and `bun run build`.
