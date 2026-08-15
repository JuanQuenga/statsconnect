# Unified StatsConnect deployment

The public application is served from one Vercel deployment:

- `/` — StatsConnect Hub
- `/brawlstars/*` — BrawlStats
- `/clashroyale/*` — ClashCrown

`pnpm build:unified` builds the three isolated SPAs into the root `dist/` directory. The root `vercel.json` provides the path fallbacks. Vercel runs `pnpm deploy:unified`, which deploys the canonical Convex functions and injects the resulting `VITE_CONVEX_URL` while building all three frontends.

The GitHub Actions backend workflow is manual recovery-only. Vercel owns normal production releases so one commit cannot race two Convex deployments.

## Convex backend

`packages/backend` is the canonical backend Module. It contains one schema, one HTTP router, and one cron registry. Hub, Brawl Stars, and Clash Royale functions live under their own namespaces.

Only the production Vercel project should receive the unified `CONVEX_DEPLOY_KEY`. Child app builds must not independently deploy backend functions.

The unified deployment needs these environment variable names copied from the existing deployments:

- `BRAWL_STARS_API_BASE_URL`
- `BRAWL_STARS_API_TOKEN`
- `CLASH_ROYALE_API_BASE_URL`
- `CLASH_ROYALE_API_TOKEN`
- `CLASH_ROYALE_CACHE_TTL_SECONDS`
- `BETA_ADMIN_KEY`
- `BRAWLSTATS_CACHE_TTL_SECONDS`
- `BRAWLSTATS_SERVICE_URL`
- `STATSCONNECT_ADAPTER_MODE`
- `SITE_URL`
- `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

For Better Auth, set `SITE_URL=https://stats.juanquenga.com`. Register the production Convex HTTP Actions callback URL with Google as `https://<production-deployment>.convex.site/api/auth/callback/google`. Google credentials and the Better Auth secret belong only in the Convex production environment.

Backups do not contain deployment code, environment variables, or scheduled functions. Copy these separately and verify them before traffic is switched.

## Safe data migration

Do not import into an existing production deployment. Create a fresh target deployment and keep all three current production deployments available for rollback.

1. Export a current snapshot from each production deployment.
2. Import the Hub snapshot unchanged so `connectedProfiles` references retain their IDs.
3. Extract the BrawlStats and ClashCrown snapshot ZIP files into separate directories.
4. Prepare the game-owned tables:

   ```sh
   node scripts/prepare-convex-import.mjs brawl <brawl-snapshot-dir> <brawl-output-dir>
   node scripts/prepare-convex-import.mjs clash <clash-snapshot-dir> <clash-output-dir>
   ```

5. Compare every generated `manifest.json` count with its source deployment.
6. Import each generated JSONL file into the table matching its filename with `pnpm --dir packages/backend exec convex import --table <table> <file>`.
7. Verify Hub connections, both player searches, pipeline status, API calls, and all nine cron registrations.
8. Pause the old crawlers, take final exports, apply the final delta, and only then change the frontend Convex URL and public DNS.

The game datasets currently contain no schema-declared cross-table document IDs. Their IDs are intentionally regenerated when moved into renamed tables. Hub data is imported as an unchanged snapshot because `viewerSettings.activeProfileId` references `connectedProfiles`.
