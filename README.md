# StatsConnect

StatsConnect is the pnpm monorepo for the game-statistics hub and its connected game sites.

## Workspace

- `apps/statsconnect`: hub, connections, and canonical game destinations
- `apps/brawlstats`: Brawl Stars statistics site
- `apps/clashcrown`: Clash Royale statistics site
- `packages/backend`: the sole executable Convex Platform Backend
- `packages/auth`: shared authentication and saved-profile synchronization
- `packages/site-nav`: shared Site Navigation Module used by all three apps

Each game experience keeps its own visual system, routes, and search experience while the unified build serves them from one StatsConnect Vercel deployment. A persistent Hub runtime mounts the independently built experiences in place, so the shared Game Switcher can move between `/`, `/bs/*`, and `/cr/*` without reloading the document. The shared Site Navigation Module owns the sticky navigation, responsive behavior, accessibility, dimensions, and interaction states. All three apps use the shared Convex backend in `packages/backend`.

`scripts/production-delivery.ts` defines route prefixes, public origins, output locations, build order, and release ownership. The app Vite Adapters and root Vercel Adapter use that Interface.

For local setup, architecture, environment variables, contribution rules, deployment, operations, and the Convex cost model, read [CONTRIBUTING.md](./CONTRIBUTING.md).

## Production topology

- `apps/statsconnect`: `stats.juanquenga.com/`
- `apps/brawlstats`: `stats.juanquenga.com/bs/*`
- `apps/clashcrown`: `stats.juanquenga.com/cr/*`
- `packages/backend`: the shared Convex production deployment

The former `/brawlstars/*` and `/clashroyale/*` paths permanently redirect to `/bs/*` and `/cr/*`, preserving deep-link suffixes and query parameters.

The shared Game Switcher links directly to these same-origin paths. `/launch/:game` is retained only for old bookmarks and is not part of canonical navigation.

Production delivery uses one root Vercel project and one Convex deployment. Follow the release procedure in [CONTRIBUTING.md](./CONTRIBUTING.md#production-deployment) before releasing.

## Commands

```sh
pnpm dev:hub
pnpm dev:brawlstats
pnpm dev:clashcrown
pnpm --filter @statsconnect/backend dev
pnpm test:delivery
pnpm typecheck
```

Run Convex development, environment, and deployment commands through `@statsconnect/backend` or from `packages/backend`. App directories do not own executable Convex backends.
