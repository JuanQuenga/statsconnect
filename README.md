# StatsConnect

StatsConnect is the pnpm monorepo for the game-statistics hub and its connected game sites.

## Workspace

- `apps/statsconnect` — hub, connections, and canonical launch routes
- `apps/brawlstats` — Brawl Stars statistics site
- `apps/clashcrown` — Clash Royale statistics site
- `packages/site-nav` — shared Site Navigation Module used by all three apps

Each app keeps its own brand, routes, search experience, and Vercel deployment. The shared Site Navigation Module owns the sticky shell, Games switcher, responsive behavior, accessibility, dimensions, and interaction states. All three apps use the shared Convex backend in `packages/backend`.

## Production topology

- `apps/statsconnect` → `stats.juanquenga.com`
- `apps/brawlstats` → `brawlstats.juanquenga.com`
- `apps/clashcrown` → `clashcrown.juanquenga.com`
- `packages/backend` → the shared Convex production deployment

Each frontend is a separate Vercel project connected to this repository. Its ignored-build command limits deployments to changes in that app, the shared UI packages, or workspace dependency files. Backend changes deploy through `.github/workflows/convex-production.yml` and do not rebuild the frontends.

## Commands

```sh
pnpm dev:hub
pnpm dev:brawlstats
pnpm dev:clashcrown
pnpm typecheck
```

Run app-specific Convex commands from the app directory or with `pnpm --filter <package-name>`.
