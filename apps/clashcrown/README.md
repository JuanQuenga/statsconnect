# StatsConnect Clash Royale Game Site

The Clash Royale experience is a companion Game Site under StatsConnect, built with Vite, React, TypeScript, TanStack Router, TanStack Query, Tailwind CSS, and Convex. Its server implementation lives in the Platform Backend's `clash` namespace at `packages/backend/convex`. In unified production it is mounted at `https://statsconnect.app/cr`.

## Features

- Search any player tag and load live profile stats, battle history, current deck, card collection, and upcoming chests.
- Search any clan tag and load live clan stats, weekly donations, war trophies, and the complete member roster.
- Build an eight-card deck from the live card catalog and copy the official Clash Royale deck link.
- Cache Clash Royale API responses in Convex, record player/clan progression snapshots, and serve stale data when the upstream API is temporarily unavailable.
- Use `/players/CCDEMO` and `/clans/CCDEMO` without credentials for the built-in demo. In unified production these are `/cr/players/CCDEMO` and `/cr/clans/CCDEMO`.
- Crawl player battle logs on a Convex cron schedule and fold them into daily deck and card aggregates, so deck win rate and usage can eventually be served from real observations rather than guessed at.

## Battle-log pipeline

The official API returns 25 battles per player. `packages/backend/convex/crons.ts` registers four jobs that accumulate deck statistics:

| Job | Interval | What it does |
| --- | --- | --- |
| `discover` | 6h | Seeds the crawl queue from the Path of Legends leaderboard and the rosters of the top clans. Supercell retired the trophy-road player leaderboard, so those are the only live sources of player tags. |
| `crawl` | 2m | Fetches a batch of battle logs sequentially and folds each battle into per-day deck and card counters. |
| `rollup` | 30m | Materialises the 1-day and 7-day deck leaderboards. |
| `prune` | 6h | Drops aggregates past the 30-day retention window. |

Battles are deduped on a side-independent fingerprint, so crawling both participants counts a battle once. Draft, mirror, and 2v2 modes are excluded because the deck is not the player's own.

Visit `/cr/beta` on the unified deployed site (or `/beta` during local development) to watch queue depth, ingest counters, API failure rate, recent cron runs, and the early meta preview. The page is `noindex` and stays out of the nav.

## Local setup

Run setup commands from the repository root:

1. Install dependencies with `pnpm install`.
2. Run `pnpm --filter @statsconnect/backend dev` once to create or connect the canonical Convex development deployment. Convex writes its selector and URLs to `packages/backend/.env.local`. Set that deployment URL as `VITE_CONVEX_URL` in `apps/clashcrown/.env.local`.
3. Create a key at the [official Clash Royale developer portal](https://developer.clashroyale.com/) with `45.79.218.79` as its allowed IP address. This is the fixed egress IP documented by the [RoyaleAPI proxy](https://docs.royaleapi.com/proxy.html). Add the key and proxy URL to the Convex environment:

   ```bash
   pnpm --dir packages/backend exec convex env set CLASH_ROYALE_API_TOKEN your_token
   pnpm --dir packages/backend exec convex env set CLASH_ROYALE_API_BASE_URL https://proxy.royaleapi.dev/v1
   ```

4. Run the Vite development workflow with `pnpm dev:clashcrown`.

### Reviewing the rankings UI without Convex

Leaderboards are live-only by default. For local UI work, set this explicit
dev-only flag in `apps/clashcrown/.env.local`:

```bash
VITE_CLASHCROWN_DATA_MODE=demo
```

Restart Vite after changing the flag, then open `/leaderboards`. The page shows
a `Demo data · local only` label and uses deterministic fixture rows; it makes
no Convex requests. Player and clan `CCDEMO` profile routes remain separate
demo fixtures. Remove the flag (or set `VITE_CLASHCROWN_DATA_MODE=live`) when
testing the real Convex path. The demo mode is guarded by Vite's development
flag and cannot activate in a production build.

Clash Royale API keys only accept individual source IPs, while Convex uses a regional egress range. The fixed-egress proxy keeps the token server-side and forwards requests to the official `/v1` API from the allowlisted IP.

## Checks

```bash
pnpm --filter clash-crown typecheck
pnpm --filter @statsconnect/backend typecheck
```

## Environment

See `.env-example`. The Clash Royale token belongs in the Convex environment, never in a browser-exposed variable.

`VITE_STATSCONNECT_ORIGIN` controls the shared origin used by direct Hub, `/bs/*`, and `/cr/*` links in the Games switcher. It defaults to `https://statsconnect.app`.

Legacy `/clashroyale/*` URLs permanently redirect to the matching `/cr/*` URL.

The Platform Backend pipeline reads these optional Convex environment variables, so it can be tuned without a redeploy:

| Variable | Default | Purpose |
| --- | --- | --- |
| `BETA_ADMIN_KEY` | unset | Required by the "queue a player" control on `/beta`. Without it the control is inert. |
| `CLASH_CRAWLER_ENABLED` | `true` | Global kill switch for discovery, battle-log crawling, and background clan watches. |
| `CLASH_CLAN_WATCH_ENABLED` | `true` | Independent kill switch for expiring clan watches. |
| `CLASH_CRAWL_BATCH` | `8` | Battle logs fetched per crawl tick. Batch size × tick rate is the API request rate. |
| `CLASH_CRAWL_REQUEST_BUDGET_PER_RUN` | `8` | Hard request reservation cap for one crawl tick. |
| `CLASH_CRAWL_DAILY_REQUEST_BUDGET` | `4000` | Hard daily battle-log request budget. Unused reservations are released. |
| `CLASH_DISCOVER_LIMIT` | `200` | Path of Legends leaderboard entries seeded per discovery run. |
| `CLASH_CLAN_SEED` | `20` | Top clans whose rosters are seeded per discovery run. One request each. |
| `CLASH_FIXED_SAMPLE_SIZE` | `50` | Top leaderboard players retained in the durable fixed sample tier. |
| `CLASH_DISCOVER_REQUEST_BUDGET_PER_RUN` | `12` | Hard request reservation cap for one discovery run. |
| `CLASH_DISCOVER_DAILY_REQUEST_BUDGET` | `60` | Hard daily discovery request budget. |
| `CLASH_CLAN_WATCH_REQUEST_BUDGET_PER_RUN` | `9` | Hard request cap for one background clan-watch tick (three requests per clan). |
| `CLASH_CLAN_WATCH_DAILY_REQUEST_BUDGET` | `36` | Hard daily background clan-watch request budget. |
| `CLASH_RANKING_SIZE` | `100` | Decks kept per mode per window in the materialised leaderboard. |
| `CLASH_MIN_DECK_USES` | `5` | Observations a deck needs before it is ranked at all. |

This project is not affiliated with, endorsed, sponsored, or specifically approved by Supercell.
