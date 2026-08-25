# Unified StatsConnect deployment

One Vercel deployment serves the public application:

- `/`: StatsConnect Hub
- `/bs/*`: Brawl Stars experience
- `/cr/*`: Clash Royale experience

`scripts/production-delivery.ts` is the executable source of truth for the ordered app builds, route prefixes, output directories, public origins, and generated application-shell manifest. `pnpm build:unified` builds three independently mountable applications into the root `dist/` directory. The root `vercel.json` hosting Adapter returns the persistent Hub document for product routes; the Hub runtime selects and mounts the experience that owns the requested path.

The previous `/brawlstars/*` and `/clashroyale/*` URLs remain supported through permanent Vercel redirects to `/bs/*` and `/cr/*`. Redirects retain deep-link suffixes and query parameters, so existing profile, player, and beta links continue to resolve.

If the legacy `brawlstats.juanquenga.com` or `clashcrown.juanquenga.com` hostnames remain attached to a Vercel project, configure domain-level permanent redirects to `https://stats.juanquenga.com/bs` and `https://stats.juanquenga.com/cr` respectively. Hostname redirects are an external domain setting; the root project route rules cover only path aliases on the canonical host.

The shared Better Auth configuration continues to trust those two legacy origins temporarily so sessions can cross the redirect during rollout. Remove them after the external redirects and DNS migration are confirmed; `/bs` and `/cr` themselves are same-origin paths under `https://stats.juanquenga.com` and require no separate trusted origins.

Vercel runs `pnpm build:vercel`. Production builds deploy the canonical Convex functions and inject the resulting `VITE_CONVEX_URL` while building all three frontends. Preview and development builds only build the frontends; they require a preview-scoped `VITE_CONVEX_URL` and never receive `CONVEX_DEPLOY_KEY`.

The Hub document (`/index.html`) and `application-shell-manifest.json` are served with `Cache-Control: no-cache, must-revalidate` so releases reach returning browsers immediately; hashed Vite assets keep their immutable caching. `trailingSlash: false` canonicalizes URLs without trailing slashes with a 308 redirect, keeping one URL per route across the Hub shell and both Game Sites.

The GitHub Actions backend workflow is manual recovery-only. Vercel owns normal production releases so one commit cannot race two Convex deployments.

## Convex backend

`packages/backend` is the canonical backend Module. It contains one schema, one HTTP router, and one cron registry. Hub, Brawl Stars, and Clash Royale functions live under their own namespaces.

Set the unified `CONVEX_DEPLOY_KEY` only on the production Vercel project. Child app builds must not independently deploy backend functions.

The unification retired the three app-local `vercel.json` files. Normal releases belong to the root Vercel project. `.github/workflows/convex-production.yml` is a manual, emergency-only backend recovery Adapter. Do not run it alongside a normal production release.

The unified deployment needs these environment variable names copied from the existing deployments:

- `BRAWL_STARS_API_BASE_URL`
- `BRAWL_STARS_API_TOKEN`
- `BRAWL_CRAWLER_ENABLED`
- `BRAWL_PUBLIC_API_ENABLED`
- `BRAWL_CRAWL_MAX_CALLS_PER_HOUR`
- `BRAWL_PUBLIC_MAX_CALLS_PER_HOUR`
- `BRAWL_DISCOVER_LIMIT`
- `BRAWL_CLUB_SEED`
- `BRAWL_CRAWL_BATCH`
- `BRAWL_CRAWL_REVISIT_MINUTES`
- `BRAWL_PROFILE_REVISIT_HOURS`
- `BRAWL_PLAYER_PROFILE_CACHE_SECONDS`
- `BRAWL_PLAYER_BATTLE_CACHE_SECONDS`
- `CLASH_ROYALE_API_BASE_URL`
- `CLASH_ROYALE_API_TOKEN`
- `CLASH_ROYALE_CACHE_TTL_SECONDS`
- `CLASH_CRAWLER_ENABLED`
- `CLASH_CLAN_WATCH_ENABLED`
- `CLASH_CRAWL_BATCH`
- `CLASH_CRAWL_REQUEST_BUDGET_PER_RUN`
- `CLASH_CRAWL_DAILY_REQUEST_BUDGET`
- `CLASH_DISCOVER_LIMIT`
- `CLASH_CLAN_SEED`
- `CLASH_FIXED_SAMPLE_SIZE`
- `CLASH_DISCOVER_REQUEST_BUDGET_PER_RUN`
- `CLASH_DISCOVER_DAILY_REQUEST_BUDGET`
- `CLASH_CLAN_WATCH_REQUEST_BUDGET_PER_RUN`
- `CLASH_CLAN_WATCH_DAILY_REQUEST_BUDGET`
- `CLASH_RANKING_SIZE`
- `CLASH_MIN_DECK_USES`
- `BETA_ADMIN_KEY`
- `BRAWLSTATS_CACHE_TTL_SECONDS`
- `BRAWLSTATS_SERVICE_URL`
- `STATSCONNECT_ADAPTER_MODE`
- `SITE_URL`
- `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

For Better Auth, set `SITE_URL=https://stats.juanquenga.com`. Register the production Convex HTTP Actions callback URL with Google as `https://<production-deployment>.convex.site/api/auth/callback/google`. Google credentials and the Better Auth secret belong only in the Convex production environment.

The Brawl HTTP cache defaults are 900 seconds for player profiles and 120 seconds for battle logs. Existing deployments may keep `BRAWL_PROFILE_CACHE_TTL_SECONDS` and `BRAWL_BATTLE_LOG_CACHE_TTL_SECONDS`; both are accepted as lower-priority aliases while the documented names above are preferred.

Backups do not contain deployment code, environment variables, or scheduled functions. Copy and verify them before switching traffic.

## Safe data migration

Do not import into an existing production deployment. Create a fresh target deployment and keep all three current production deployments available for rollback.

1. Export a current snapshot from each production deployment.
2. Import `savedProfiles`, `connectThrottles`, and `profileCache` from the Hub snapshot as individual tables. Do not import the removed `connectedProfiles` or `viewerSettings` tables.
3. Extract the legacy BrawlStats and ClashCrown snapshot ZIP files into separate directories.
4. Prepare the game-owned tables:

   ```sh
   node scripts/prepare-convex-import.mjs brawl <brawl-snapshot-dir> <brawl-output-dir>
   node scripts/prepare-convex-import.mjs clash <clash-snapshot-dir> <clash-output-dir>
   ```

5. Compare every generated `manifest.json` count with its source deployment.
6. Import each generated JSONL file into the table matching its filename with `pnpm --dir packages/backend exec convex import --table <table> <file>`.
7. Verify Hub connections, both player searches, pipeline status, API calls, and all 11 cron registrations.
8. Pause the old crawlers, take final exports, apply the final delta, and only then change the frontend Convex URL and public DNS.

The game datasets currently contain no schema-declared cross-table document IDs. Their IDs are regenerated when they move into renamed tables. Account profiles keep their owner IDs when `savedProfiles` is imported. Old viewer-owned `connectedProfiles` rows cannot be matched to an account and have no automatic server migration. Browser profiles still migrate from the previous Site Navigation storage when that browser opens the new app.
