# ClashCrown Vite + TanStack Architecture

ClashCrown now uses the same frontend architecture as the other StatsConnect game surface while retaining its existing Convex backend.

## Runtime

- Vite + React 19
- TanStack Router file routes under `src/routes`
- TanStack Query for browser query orchestration
- Convex for the database, scheduled ingestion, cached Clash Royale API calls, and live queries/actions
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
- Clash Royale API tokens remain in the Convex deployment environment.
- The browser never calls the official Clash Royale API directly.
- Existing Convex cache, crawler, rollup, and cron behavior remains unchanged.

## StatsConnect integration

- The global Games switcher links to `{VITE_STATSCONNECT_ORIGIN}/launch/:game`.
- StatsConnect resolves the user's connected tag and launches `/players/{tag}` on ClashCrown.
- Direct dynamic routes are covered by the Vercel SPA rewrite.
- Full shared identity and linked-tag hydration remain part of the Lakebed capsule migration described in the StatsConnect v2 spec.

## Verification

```bash
pnpm typecheck
```

Before deployment, verify that Vercel has `VITE_CONVEX_URL` and `VITE_STATSCONNECT_ORIGIN` configured for the intended environment.
