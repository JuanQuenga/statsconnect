# BrawlStats.io

Live Brawl Stars statistics: players, clubs, maps/meta, events, and official rankings. The frontend is a React SPA (Vite + TanStack Router/Query + Tailwind CSS v4 + shadcn/ui Base UI). Authenticated Supercell API traffic stays on Convex HTTP Actions.

## What Works

- Player search by tag — profile totals, brawler roster, recent battles
- Club search by tag — metadata, roster, top members, trophy distribution (`/bands` redirects to `/clubs`)
- Global and country player/club leaderboards, plus per-brawler trophy rankings
- Maps catalog and detail pages with live rotation, mode filters, archive toggle
- First-party map meta (win rate / use rate) aggregated from official battle logs
- Durable battle-log crawler with queue/run telemetry at `/beta`
- Current event rotation and brawler catalog artwork
- Loading, empty, invalid-tag, missing-configuration, and upstream-error states

The browser never receives the Supercell API token.

## Stack

- React 19 + Vite
- TanStack Router + TanStack Query
- Tailwind CSS v4 + shadcn/ui (Base UI / `base-nova`)
- Convex (HTTP Actions, schema, mutations, crons)
- Official Brawl Stars API for live player, club, battle, event, and ranking data
- BrawlAPI for public map/brawler/gamemode metadata
- Brawlify CDN for game artwork

## Setup

```sh
pnpm install
pnpm convex dev
```

Create a key at [developer.brawlstars.com](https://developer.brawlstars.com), then store it only in Convex:

```sh
pnpm convex env set BRAWL_STARS_API_TOKEN your-token
```

`convex dev` normally writes `VITE_CONVEX_URL` to `.env.local`; the frontend converts that `.convex.cloud` URL to the matching `.convex.site` HTTP Actions URL. You may instead set `VITE_CONVEX_SITE_URL` explicitly. See [`.env.example`](./.env.example).

In another terminal:

```sh
pnpm dev
```

### API IP allow-listing

Supercell API keys are tied to allowed source IPs. If the Convex deployment cannot use a directly allow-listed address, put a fixed-egress proxy in front of the official API and set:

```sh
pnpm convex env set BRAWL_STARS_API_BASE_URL https://your-proxy.example/v1
```

## Commands

```sh
pnpm typecheck       # TypeScript verification
pnpm dev             # Frontend development server
pnpm dev:backend     # Convex development deployment
pnpm build           # Production frontend bundle
pnpm deploy:backend  # Deploy Convex functions
```

## Routes

- `/`
- `/players?tag=%23PLAYER_TAG`
- `/clubs?tag=%23CLUB_TAG` (and `/bands` → `/clubs`)
- `/leaderboards`
- `/maps`
- `/maps/$mapId`
- `/gamemodes/$modeId`
- `/beta` (noindex crawler telemetry)

## StatsConnect hub

The global Games switcher sends game changes through `{VITE_STATSCONNECT_ORIGIN}/launch/:game`. StatsConnect owns the connected tags and launches BrawlStats at `/players?tag=TAG`. Set `VITE_STATSCONNECT_ORIGIN` to the deployed hub origin; it defaults to `https://statsconnect.com`.

## Map meta crawler

Map win/use rates are **first-party**, not scraped from Brawlify:

1. Every successful `/api/player` lookup ingests its battle log and adds that player to the durable crawl queue
2. A six-hour discovery job adds global ranking players and members of top clubs
3. A two-minute worker claims due targets, ingests only newer battles, and retries failures with exponential backoff
4. Aggregates live in `mapBrawlerStats` / `mapTeamStats` (deduped via `seenBattles`)
5. `/beta` exposes bounded queue health, API volume, ingestion coverage, and recent run history
6. A six-hour maintenance job removes expired dedupe records and telemetry

Crawler tuning is optional and belongs in Convex environment variables:

```sh
pnpm convex env set BRAWL_DISCOVER_LIMIT 200
pnpm convex env set BRAWL_CLUB_SEED 10
pnpm convex env set BRAWL_CRAWL_BATCH 8
pnpm convex env set BRAWL_CRAWL_REVISIT_MINUTES 30
```

Map detail UI hides tier lists until a brawler has enough picks (default 25).

Credit BrawlAPI/Brawlify CDN for static artwork and map metadata only.

## Data and Assets

See [`ASSET_SOURCES.md`](./ASSET_SOURCES.md).

## License and Fan Content Notice

The source code is available under the PolyForm Noncommercial License 1.0.0. Third-party game artwork, logos, names, and other assets remain the property of their respective owners.

This content is not affiliated with, endorsed, sponsored, or specifically approved by Supercell. Supercell is not responsible for it. See [Supercell's Fan Content Policy](https://supercell.com/en/fan-content-policy/).
