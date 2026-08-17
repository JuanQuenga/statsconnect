# StatsConnect runtime specification

[ADR-0002](./adr/0002-unify-production-delivery-and-backend.md) governs production delivery and backend ownership. This file records the current runtime. [CONTRIBUTING.md](../CONTRIBUTING.md) has the commands and environment details.

## Product shape

StatsConnect is a game-statistics Hub with two Game Sites:

- The StatsConnect Hub owns game discovery, connected profiles, and canonical Launch Routes.
- BrawlStats owns the Brawl Stars statistics experience.
- ClashCrown owns the Clash Royale statistics experience.
- The Hub and both Game Sites render the shared Site Navigation Module and its Game Switcher. Each Game Site keeps a routing Adapter for local routes. Cross-game choices go through the Hub's Launch Routes.

The Hub and Game Sites are React SPAs in one pnpm monorepo. They remain isolated Modules even though production serves them together.

## Production runtime

StatsConnect ships as one public Vercel deployment at `stats.juanquenga.com`:

| Path | Module |
| --- | --- |
| `/` | StatsConnect Hub |
| `/brawlstars/*` | BrawlStats Game Site |
| `/clashroyale/*` | ClashCrown Game Site |

`scripts/production-delivery.ts` defines public origins, route prefixes, output locations, build order, and release ownership. Root workspace scripts, the root Vercel Adapter, and app Vite Adapters use that Interface. The unified build writes the Hub to `dist/`, BrawlStats to `dist/brawlstars`, and ClashCrown to `dist/clashroyale`.

## Platform Backend

`packages/backend/convex` is the sole executable Platform Backend. It owns the Convex schema, HTTP router, cron registry, authentication, Hub functions, and namespaced game-statistics Modules:

- `hub/*` owns Hub data and shared account profile synchronization.
- `brawl/*` owns Brawl Stars data, ingestion, and HTTP Actions.
- `clash/*` owns Clash Royale data, ingestion, and personalization.

Game-owned data and functions do not directly reference another game's tables. ADR-0002 keeps each namespace as a future split Seam. The current runtime still has one executable backend.

Frontend code uses typed function references and types from the canonical generated Interface. App directories have no Convex schemas, functions, crons, generated backend Interfaces, or backend deployment commands.

## Identity and connected profiles

`@statsconnect/auth`, Better Auth, and the Platform Backend provide shared Google sign-in. The Platform Backend stores authenticated saved profiles in the Hub namespace and syncs them with browser profile state.

The Hub creates a browser-local viewer UUID only to throttle profile previews. The UUID does not own connected profiles or grant access to account data.

ClashCrown still authorizes personalization with device capabilities in the `clash` namespace. Those functions run on the Platform Backend, not a separate deployment.

## Runtime contracts

- `VITE_CONVEX_URL` points every frontend at the same Platform Backend deployment.
- BrawlStats may also use `VITE_CONVEX_SITE_URL` for the Platform Backend's HTTP Actions origin.
- Game Site base paths are `/brawlstars/` and `/clashroyale/` in the unified production build.
- The Game Switcher targets the Hub and its Launch Routes rather than linking directly between Game Sites.
- Secrets and upstream API credentials live in the Convex deployment environment, never in `VITE_*` variables.
- The root Vercel project builds previews without deploying Convex and owns normal production delivery of the frontend plus Platform Backend. The GitHub Actions backend workflow is manual recovery only.

## Status of the former Lakebed proposal

An earlier version proposed Lakebed capsules and called the repository's Convex code reference material. ADR-0002 superseded that proposal.

Lakebed is not a dependency, runtime, or accepted migration target in this repository. Replacing the Platform Backend or shared authentication requires a new ADR. This specification makes no such decision.
