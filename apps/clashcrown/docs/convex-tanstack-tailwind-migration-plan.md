# StatsConnect Clash Royale Vite + TanStack Architecture

The Clash Royale experience uses the same frontend stack as the other StatsConnect Game Site. Its server implementation runs in the Platform Backend's `clash` namespace.

## Runtime

- Vite + React 19
- TanStack Router file routes under `src/routes`
- TanStack Query for browser query orchestration
- The canonical Convex Platform Backend for the database, scheduled ingestion, cached Clash Royale API calls, and live queries/actions
- Tailwind CSS 4 plus the existing global visual system
- Vercel static deployment with an SPA fallback to `index.html`

## Route ownership

Screen implementations remain under `src/pages` during the migration to minimize visual churn. Files under `src/routes` are the canonical TanStack route definitions and map every public URL to its existing screen.

Dynamic routes:

- `/players/$tag`
- `/players/$tag/upgrades`
- `/clans/$tag`
- `/clans/$tag/war`
- `/cards/$slug`

The small adapters in `src/components/Link.tsx`, `src/components/Image.tsx`, `src/components/Head.tsx`, and `src/lib/router.ts` preserve the existing component APIs without retaining a Next.js runtime dependency. They can be replaced incrementally with direct TanStack APIs as individual screens are refactored.

## Data and secrets

- Browser code reads only `VITE_CONVEX_URL` and `VITE_STATSCONNECT_ORIGIN`.
- Store Clash Royale API tokens in the Platform Backend deployment environment.
- The browser never calls the official Clash Royale API directly.
- This frontend migration did not change the cache, crawler, rollup, or cron code under `packages/backend/convex/clash`.

## StatsConnect integration

- The global Games switcher links directly to `{VITE_STATSCONNECT_ORIGIN}/bs/` and `{VITE_STATSCONNECT_ORIGIN}/cr/`.
- Saved StatsConnect profiles link directly to `/cr/players/{tag}` on the Clash Royale experience.
- The root Vercel SPA rewrite covers direct dynamic routes.
- `packages/auth` and the Platform Backend handle shared Google sign-in and saved-profile synchronization. The Clash Royale experience authorizes its separate personalization Module with device capabilities. See [`personalization-identity-adapter.md`](./personalization-identity-adapter.md).

## Verification

```bash
pnpm typecheck
```

Before deployment, verify that Vercel has `VITE_CONVEX_URL` and `VITE_STATSCONNECT_ORIGIN` configured for the intended environment.
