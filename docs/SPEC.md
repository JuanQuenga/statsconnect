# StatsConnect runtime specification

[ADR-0002](./adr/0002-unify-production-delivery-and-backend.md) governs production delivery and backend ownership. This file records the current runtime. [CONTRIBUTING.md](../CONTRIBUTING.md) has the commands and environment details.

## Product shape

StatsConnect is a game-statistics Hub with two distinct Game Site experiences:

- The StatsConnect Hub owns game discovery, connected profiles, and canonical Game Destinations.
- The Brawl Stars experience keeps its own design system and assets.
- The Clash Royale experience keeps its own design system and assets.
- The Hub and both Game Sites render the shared Site Navigation Module and its Game Switcher. Each Game Site keeps a routing Adapter for local routes. Cross-game choices navigate directly to same-origin `/bs/*` and `/cr/*` paths through the persistent application shell.

The Hub and Game Sites are independently built, mountable React applications in one pnpm monorepo. They remain isolated Modules even though a persistent Hub runtime swaps them in place in production.

## Production runtime

StatsConnect ships as one public Vercel deployment at `statsconnect.app`:

| Path | Module |
| --- | --- |
| `/` | StatsConnect Hub |
| `/bs/*` | Brawl Stars Game Site |
| `/cr/*` | Clash Royale Game Site |

`scripts/production-delivery.ts` defines public origins, route prefixes, output locations, build order, application-shell assets, and release ownership. Root workspace scripts, the root Vercel Adapter, and app Vite Adapters use that Interface. The unified build writes the Hub shell to `dist/`, the Brawl Stars experience to `dist/bs`, and the Clash Royale experience to `dist/cr`. Direct requests for any product route return the Hub document; its application manifest loads the requested Game Site without changing the canonical URL.

The public game prefixes are intentionally short and product-owned: `/bs` for Brawl Stars and `/cr` for Clash Royale. The legacy `/brawlstars/*` and `/clashroyale/*` paths permanently redirect to their matching canonical prefix while preserving the path suffix and query string.

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

The Clash Royale experience still authorizes personalization with device capabilities in the `clash` namespace. Those functions run on the Platform Backend, not a separate deployment.

## Runtime contracts

- `VITE_CONVEX_URL` points every frontend at the same Platform Backend deployment.
- The Brawl Stars experience may also use `VITE_CONVEX_SITE_URL` for the Platform Backend's HTTP Actions origin.
- Game Site base paths are `/bs/` and `/cr/` in the unified production build.
- The Game Switcher targets canonical same-origin Game Destinations. Saved profiles deep-link directly to their player routes.
- Secrets and upstream API credentials live in the Convex deployment environment, never in `VITE_*` variables.
- The root Vercel project builds previews without deploying Convex and owns normal production delivery of the frontend plus Platform Backend. The GitHub Actions backend workflow is manual recovery only.

## Status of the former Lakebed proposal

An earlier version proposed Lakebed capsules and called the repository's Convex code reference material. ADR-0002 superseded that proposal.

Lakebed is not a dependency, runtime, or accepted migration target in this repository. Replacing the Platform Backend or shared authentication requires a new ADR. This specification makes no such decision.
