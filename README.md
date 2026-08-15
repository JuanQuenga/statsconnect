# StatsConnect

StatsConnect is the pnpm monorepo for the game-statistics hub and its connected game sites.

## Workspace

- `apps/statsconnect` — hub, connections, and canonical launch routes
- `apps/brawlstats` — Brawl Stars statistics site
- `apps/clashcrown` — Clash Royale statistics site
- `packages/site-nav` — shared Site Navigation Module used by all three apps

Each app keeps its own brand, routes, and search experience while the unified build serves them from one Vercel deployment. The shared Site Navigation Module owns the sticky shell, Games switcher, responsive behavior, accessibility, dimensions, and interaction states. All three apps use the shared Convex backend in `packages/backend`.

For local setup, architecture, environment variables, contribution rules, deployment, operations, and the Convex cost model, read [CONTRIBUTING.md](./CONTRIBUTING.md).

## Production topology

- `apps/statsconnect` → `stats.juanquenga.com/`
- `apps/brawlstats` → `stats.juanquenga.com/brawlstars/*`
- `apps/clashcrown` → `stats.juanquenga.com/clashroyale/*`
- `packages/backend` → the shared Convex production deployment

The target architecture is one root Vercel project and one Convex deployment. Production delivery is currently in a partially merged state; follow the release blockers and deployment procedure in [CONTRIBUTING.md](./CONTRIBUTING.md#production-deployment) before releasing.

## Commands

```sh
pnpm dev:hub
pnpm dev:brawlstats
pnpm dev:clashcrown
pnpm typecheck
```

Run app-specific Convex commands from the app directory or with `pnpm --filter <package-name>`.
