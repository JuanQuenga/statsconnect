# Unified StatsConnect deployment

The public application is served from one Vercel deployment:

- `/` — StatsConnect Hub
- `/brawlstars/*` — BrawlStats
- `/clashroyale/*` — ClashCrown

`pnpm build:unified` builds the three isolated SPAs into the root `dist/` directory. The root `vercel.json` provides the path fallbacks. Vercel runs `pnpm deploy:unified`, which deploys the canonical Convex functions and injects the resulting `VITE_CONVEX_URL` while building all three frontends.

## Convex backend

`packages/backend` is the canonical backend Module. It contains one schema, one HTTP router, and one cron registry. Hub, Brawl Stars, and Clash Royale functions live under their own namespaces.

Only the production Vercel project should receive the unified `CONVEX_DEPLOY_KEY`. Child app builds must not independently deploy backend functions.

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
- `HUB_PROFILE_REFRESH_ENABLED`
- `HUB_PROFILE_REFRESH_BATCH`
- `HUB_PROFILE_REFRESH_MAX_TARGETS_PER_DAY`

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
7. Verify Hub connections, both player searches, pipeline status, API calls, and all 13 cron registrations.
8. Pause the old crawlers, take final exports, apply the final delta, and only then change the frontend Convex URL and public DNS.

After the first backend deployment, run `hub/internal/watchTargets:backfillConnectedProfiles` in bounded passes until `remaining` is false. Clash pruning migrates legacy crawler/clan rows gradually; do not expect exact deck rankings until one complete UTC day has warmed the 1-day board and seven complete days have warmed the 7-day board.

Verified authentication, payment provider secrets, a signature-verifying webhook/checkout adapter, and production entitlement events are separate required setup. Until they are configured, the Hub reports checkout as unavailable and premium mutations fail closed.

The game datasets currently contain no schema-declared cross-table document IDs. Their IDs are intentionally regenerated when moved into renamed tables. Hub data is imported as an unchanged snapshot because `viewerSettings.activeProfileId` references `connectedProfiles`.
