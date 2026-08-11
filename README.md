# StatsConnect

StatsConnect is the pnpm monorepo for the game-statistics hub and its connected game sites.

## Workspace

- `apps/statsconnect` — hub, connections, and canonical launch routes
- `apps/brawlstats` — Brawl Stars statistics site
- `apps/clashcrown` — Clash Royale statistics site
- `packages/site-nav` — shared Site Navigation Module used by all three apps

Each app keeps its own brand, routes, search experience, backend, and deployment configuration. The shared Site Navigation Module owns the sticky shell, Games switcher, responsive behavior, accessibility, dimensions, and interaction states.

## Commands

```sh
pnpm dev:hub
pnpm dev:brawlstats
pnpm dev:clashcrown
pnpm typecheck
```

Run app-specific Convex commands from the app directory or with `pnpm --filter <package-name>`.
