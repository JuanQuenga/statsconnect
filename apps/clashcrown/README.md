# Clash Crown

Clash Crown is a full Clash Royale companion website built with Vite, React, TypeScript, TanStack Router, TanStack Query, Tailwind CSS, and Convex.

## Features

- Search any player tag and load live profile stats, battle history, current deck, card collection, and upcoming chests.
- Search any clan tag and load live clan stats, weekly donations, war trophies, and the complete member roster.
- Build an eight-card deck from the live card catalog and copy the official Clash Royale deck link.
- Cache Clash Royale API responses in Convex, record player/clan progression snapshots, and serve stale data when the upstream API is temporarily unavailable.
- Use `/players/CCDEMO` and `/clans/CCDEMO` without credentials for the built-in demo.
- Crawl player battle logs on a Convex cron schedule and fold them into daily deck and card aggregates, so deck win rate and usage can eventually be served from real observations rather than guessed at.

## Battle-log pipeline

The official API exposes battles per player only, 25 at a time, so deck statistics have to be accumulated. Four crons in `convex/crons.ts` do that:

| Job | Interval | What it does |
| --- | --- | --- |
| `discover` | 6h | Seeds the crawl queue from the Path of Legends leaderboard and the rosters of the top clans. Supercell retired the trophy-road player leaderboard, so those are the only live sources of player tags. |
| `crawl` | 2m | Fetches a batch of battle logs sequentially and folds each battle into per-day deck and card counters. |
| `rollup` | 30m | Materialises the 1-day and 7-day deck leaderboards. |
| `prune` | 6h | Drops aggregates past the 30-day retention window. |

Battles are deduped on a side-independent fingerprint, so crawling both participants counts a battle once. Draft, mirror, and 2v2 modes are excluded because the deck is not the player's own.

Visit `/beta` on the deployed site to watch queue depth, ingest counters, API failure rate, recent cron runs, and the early meta preview. The page is `noindex` and stays out of the nav.

## Local setup

1. Install dependencies with `pnpm install`.
2. Run `pnpm convex:dev` once to create or connect a Convex deployment. Set the resulting deployment URL as `VITE_CONVEX_URL` in `.env.local`; Convex also writes `CONVEX_DEPLOYMENT`.
3. Create a key at the [official Clash Royale developer portal](https://developer.clashroyale.com/) with `45.79.218.79` as its allowed IP address. This is the fixed egress IP documented by the [RoyaleAPI proxy](https://docs.royaleapi.com/proxy.html). Add the key and proxy URL to the Convex environment:

   ```bash
   pnpm exec convex env set CLASH_ROYALE_API_TOKEN your_token
   pnpm exec convex env set CLASH_ROYALE_API_BASE_URL https://proxy.royaleapi.dev/v1
   ```

4. Run the Vite development workflow with `pnpm dev`.

Clash Royale API keys only accept individual source IPs, while Convex uses a regional egress range. The fixed-egress proxy keeps the token server-side and forwards requests to the official `/v1` API from the allowlisted IP.

## Checks

```bash
pnpm typecheck
```

## Environment

See `.env-example`. The Clash Royale token belongs in the Convex environment, never in a browser-exposed variable.

`VITE_STATSCONNECT_ORIGIN` controls the hub links in the shared Games switcher. It defaults to `https://statsconnect.com`.

The pipeline reads these optional Convex environment variables, so it can be tuned without a redeploy:

| Variable | Default | Purpose |
| --- | --- | --- |
| `BETA_ADMIN_KEY` | unset | Required by the "queue a player" control on `/beta`. Without it the control is inert. |
| `CLASH_CRAWL_BATCH` | `8` | Battle logs fetched per crawl tick. Batch size × tick rate is the API request rate. |
| `CLASH_DISCOVER_LIMIT` | `200` | Path of Legends leaderboard entries seeded per discovery run. |
| `CLASH_CLAN_SEED` | `20` | Top clans whose rosters are seeded per discovery run. One request each. |
| `CLASH_RANKING_SIZE` | `100` | Decks kept per mode per window in the materialised leaderboard. |
| `CLASH_MIN_DECK_USES` | `5` | Observations a deck needs before it is ranked at all. |

This project is not affiliated with, endorsed, sponsored, or specifically approved by Supercell.
