# Historical tracking

Clash Royale history starts when the application receives an official Clash Royale API response. It does not infer player seasons, reconstruct missed leaderboard positions, or turn event scores into trophies.

## Player observations

- A fresh player-profile fetch records trophies, best trophies, level, arena, clan association, relevant profile totals, Path of Legends fields, a compact current-deck summary, and aggregate collection progression.
- Full card collections and raw API payloads are not copied into history. This keeps each snapshot small and avoids an unbounded array inside a document.
- Consecutive identical profiles update `lastObservedAt` on the existing row. A new row is written only when a meaningful tracked field changes.
- The existing battle-log crawler also records a partial observation for its target from the newest returned battle: starting trophies, battle deck, and clan association. These rows are labelled as battle-log observations and never imply that profile-only totals were fetched.
- Full and migrated player snapshots expire after three years. The existing `profileHistory` trophy rows can be migrated with the Platform Backend's internal, resumable `clash/history:startLegacyBackfill` mutation. The migration copies only tag, name, trophy value, and original timestamp because those are the only historical fields present.

The API provides `currentPathOfLegendSeasonResult`, `lastPathOfLegendSeasonResult`, and `bestPathOfLegendSeasonResult`, but no stable season identifier. The UI therefore presents these as API field snapshots and does not assign month or season names.

## Leaderboard observations

- Fresh event-board and location-ranking responses store at most the top 200 entries.
- Metadata, snapshots, and entries use separate tables so no snapshot document can grow with the board.
- Identical boards update their last-observed timestamp without duplicating entries.
- Changed snapshots are retained for two years. The first real capture for every API board is marked as a baseline and retained so an old board never becomes a fabricated empty season.
- Comparisons read at most 200 indexed entries from each of two selected snapshots.

## Indexing and cleanup

All profile, board, snapshot, entry, deduplication, and retention reads use declared indexes and bounded `take` or pagination calls. The existing six-hour crawler prune job also runs `history.pruneHistoryBatch`. Each transaction removes at most 128 player rows and ten leaderboard snapshots (plus their capped entries), and the action repeats bounded batches until the current tick is clear.

Board and snapshot list queries are capped at 200 and 100 rows respectively. Hot profile reads are capped at 120 snapshots. These limits are intentional coverage boundaries surfaced in the UI, not implicit claims that the archive is complete.
