# maimai CSV field guide (schema 2)

The database stores the underlying observations and audit events. The CSV formats those records for humans; display strings are not duplicated in the database. Every stored record in each selected maimai version has a CSV row whose `Record ID` is its storage key and whose `Record data (JSON)` is the complete stored value. Snapshot records also expand into convenient score rows. The original JSON preserves all source fields, numeric strings, unknown metadata, and exact player names.

## Everyday use

Filter `Record type` to `Score`. To match the graph’s snapshot selection, also filter `Used in leaderboard history` to `Yes`. To exclude moderator removals, filter `Removed` to `false`. Leaving KOP’s top 100 is not a moderator removal. Filtering these columns does not remove anything from the database.

`Score (%)` is a numeric percentage-point value: raw `3029910` becomes `302.9910`. It is already scaled; applying a spreadsheet’s percentage number format would multiply the displayed value by 100 again. `Score (raw)` retains the exact source integer. DX scores remain integers. UTF-8 with BOM supports Japanese names; fields use standard CSV quoting and CRLF records. Potential spreadsheet formulas in names are neutralized with a leading apostrophe, while their exact originals remain in JSON.

## Record types

| Record type | Meaning |
| --- | --- |
| Score | One original player row from one observation, including duplicate names and removed players. |
| Snapshot | Complete stored source observation, including empty rankings, alternate revisions, and unused fields. |
| Moderator removal | One stored removal event or legacy marker, even if no scores were ever observed for that player. |
| Roster observation | Immutable record of the KOP roster accepted by a collector. |
| Collection check | Immutable check outcome, including errors. Failure details and any received malformed payload are in JSON. |
| Latest roster | Current persisted roster pointer and names. It is a state record, not an extra observation. |
| Latest collection check | Current persisted refresh/backoff state. It is not an extra check event. |
| Other stored record | Any additional key in the version’s ranking namespace, retained verbatim rather than discarded. |

## Columns

| Columns | Meaning |
| --- | --- |
| Record type, Version, Player | Human-readable record category, game version, and exact display name (spreadsheet-escaped when necessary). Names are not stable account IDs. |
| Score (%), DX score, Score (raw) | Readable percentage points, integer DX score, and original integer score. Blank for non-score records. |
| Source rank | Rank supplied by SEGA for this observation. Never renumbered. |
| Site rank (snapshot) | Rank after current moderator removals for a selected leaderboard snapshot. Blank for removed players, non-selected observations, and players excluded from the latest roster. This is a current projection of history, not a new score observation. |
| Current status, Removed | Current observed KOP membership and moderator state at export. `Removed` is `true` or `false` for player rows; blank for unrelated audit records. KOP absence is not evidence of a ban. |
| Removal recorded at (UTC) | Earliest known stored removal time on score rows; the individual event time on removal rows. Blank if a legacy record has no timestamp. This is not a KOP ban date. |
| Source updated at (JST / UTC) | Source update time in Japan time and UTC. JST is UTC+09:00 with no daylight saving. |
| Score recorded at (JST / UTC) | Source-provided player score record time in both zones. |
| Collected at (UTC) | Collection timestamp stored with the observation. |
| Used in leaderboard history | `Yes` for the selected observation at that source timestamp; `No` for alternate observations. Existing legacy snapshots take precedence, otherwise earliest collection wins, with full-key ordering breaking ties. |
| Latest history snapshot | Whether this is the latest selected snapshot in that version. |
| Duplicate name in snapshot, Source row number | Detect ambiguous identities and retain the original one-based row order without merging players. |
| Roster updated at (JST), Roster checked at (UTC) | Source and collection times for roster state/events. |
| Roster basis | Whether current membership comes from a saved roster, the latest saved snapshot as fallback, or is unknown. |
| Collection status, Last collection check (UTC), Next collection check (UTC), Collection warning | Saved collection outcome and scheduling details. Internal failure details are retained in the audit record JSON. |
| Record ID, Snapshot ID | Persisted record key (score rows append `#row-N`) and the parent snapshot key. These distinguish revisions sharing a source timestamp. |
| Source URL | The public SEGA feed corresponding to the game version. |
| Record data (JSON) | Complete persisted value on audit/snapshot rows; exact source player object on score rows. This is the lossless data reference. |
| CSV schema version | `2`, identifying this column layout. |

Blank cells mean “not applicable” or unavailable, never a fabricated zero or timestamp. Boolean-like flags use Yes/No except `Removed`, which retains true/false. Current status, site rank, readable dates, and percentages are derived from the persisted records rather than separately stored copies.

## Retention and limits

New source observations, roster observations, check outcomes, and removal events are retained without expiration. Existing archives and legacy markers stay readable and unchanged. Legacy latest-only roster/check records are archived before replacement. CSV includes every stored revision, even though the leaderboard uses one snapshot per source timestamp. Repeated source observations can therefore contain identical score rows; use the snapshot-selection filter for analyses that need one daily history.

This records what the collector actually observes. Earlier overwritten metadata, dates with no visits, upstream updates between checks, and events during total database failure cannot be recovered or invented. No moderator identity or removal reason is available in the current token-based moderation flow. Audit expansion does not backfill those fields. Cloudflare KV propagation means an export is not an atomic cross-instance database snapshot; newly written records may take time to appear. If a listed record cannot be read, the export fails instead of silently omitting it.
