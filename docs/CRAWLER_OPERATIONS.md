# Crawler operations runbook

This runbook covers the Brawl Stars and Clash Royale crawlers plus the Hub's due-profile refresher in the shared Convex deployment. It is for operators deciding whether to keep, throttle, or stop scheduled work. The cost model is intentionally separate from billing: run `pnpm estimate:crawler-cost` for a deterministic configuration estimate, then compare it with the live Convex dashboard.

## Scope and source of truth

- Configuration defaults live in [`scripts/crawler-cost.config.json`](../scripts/crawler-cost.config.json).
- The estimator is [`scripts/estimate-crawler-cost.mjs`](../scripts/estimate-crawler-cost.mjs). It does not make network requests.
- The Convex dashboard is authoritative for current usage, limits, function failures, and billing. The estimator is a planning model, not an invoice calculator.
- The Brawl `/beta` page reports queue depth, due targets, recent runs, battles, and API calls. The Clash `/beta` page reports due targets, API calls, counters, recent runs, and rollup freshness.
- The Hub refreshes a configured batch of indexed due player targets every ten minutes (ten by default, hard-capped at twenty). Connected profiles and verified premium watches share one deduplicated target per game/entity/tag.

The estimator includes scheduled crawl, discovery, Clash rollup, renewable tracked-clan polling, and a worst-case Hub due-profile lane. It excludes product reads, manual lookups, retries, bandwidth, storage, and data-dependent pruning. Change the JSON assumptions when the implementation changes; do not silently compare a model with a different deployment.

## Dated production baseline

The following values are observations from the parent audit, recorded **2026-08-13**. They are a historical production baseline, not live billing facts and not a claim about the current state:

| Area | Audit observation | Use in operations |
| --- | ---: | --- |
| Brawl upstream traffic | 492 requests/hour | Compare with the estimator and the Brawl `/beta` hourly fetch counter. Investigate any unexplained increase. |
| Brawl queue | 619 targets, 470 overdue | Treat the overdue ratio as backlog pressure; do not raise batch size just to make the number move without checking rate limits and OCC warnings. |
| Clash upstream traffic | 264 requests/hour | Compare with Clash `/beta` and the Clash API budget. |
| Clash queue | 200+ due | Use the bounded dashboard count; confirm exact queue state from Convex before changing capacity. |
| Clash rollup | 60,307 rows read; partial result | This is the retired pre-control design. After rollout, compare it with bounded candidate normalization and exact-board publication rather than treating it as a current limit. |
| Hub | 3 connected profiles | This is a product-state snapshot, not a subscriber or billing count. |
| Contention | Recent OCC warnings | Assume shared-deployment contention is possible until recent runs, latency, and Convex logs show otherwise. |

## Normal operating budget

1. Before changing a crawler, run the estimator with the proposed settings. For an emergency throttle, for example:

   ```sh
   pnpm estimate:crawler-cost --set jobs.0.batchSize=1 --set jobs.2.batchSize=1
   ```

   Use the JSON output for a ticket or spreadsheet:

   ```sh
   pnpm estimate:crawler-cost --json > /tmp/crawler-cost.json
   ```

2. Compare three independent signals: upstream requests/hour, due backlog, and Convex function/database usage. A lower upstream rate does not guarantee lower Convex usage if rollups or retries are dominating.
3. Keep a monthly budget in the Convex dashboard for function calls, reads/writes, storage, and upstream requests. Record the plan-specific hard limits there; this repository intentionally does not hard-code plan pricing or limits.
4. Review at least daily while the queues are material: latest run success, failures, due count, requests/hour, rollup freshness, and OCC/conflict warnings.
5. Alert at 50%, 75%, 90%, and 100% of each monthly budget. At 90%, freeze tuning that increases work and prepare the emergency throttle. At 100%, stop nonessential scheduled work and preserve enough capacity for recovery and operator queries.

## Kill switches and throttles

Both game crawlers now have runtime kill switches. They stop new scheduled upstream work while leaving pruning, cached reads, telemetry, and status pages available:

- `BRAWL_CRAWLER_ENABLED=false` stops Brawl discovery and crawl work.
- `BRAWL_PUBLIC_API_ENABLED=false` stops new public Brawl upstream cache fills while cached player responses remain available.
- `CLASH_CRAWLER_ENABLED=false` stops Clash discovery, battle-log crawl, and background clan watches.
- `CLASH_CLAN_WATCH_ENABLED=false` stops only renewable background clan watches.

`HUB_PROFILE_REFRESH_ENABLED=false` stops the shared Hub due-profile refresher. `HUB_PROFILE_REFRESH_BATCH` defaults to ten, and `HUB_PROFILE_REFRESH_MAX_TARGETS_PER_DAY` defaults to a hard 480 target attempts. `BETA_ADMIN_KEY` protects the manual Clash queue control; it is not a cron kill switch.

For a soft throttle, update Convex environment values and record the change and expected estimator output:

| Game | Lower-cost controls | Notes |
| --- | --- | --- |
| Brawl | `BRAWL_CRAWL_BATCH`, `BRAWL_CRAWL_REVISIT_MINUTES`, `BRAWL_PROFILE_REVISIT_HOURS`, `BRAWL_DISCOVER_LIMIT`, `BRAWL_CLUB_SEED`, `BRAWL_CRAWL_MAX_CALLS_PER_HOUR` | Batch 1, a longer adaptive base revisit, and a lower hourly reservation limit reduce work. Profiles default to a separate 12-hour cadence. |
| Clash | `CLASH_CRAWL_BATCH`, `CLASH_CRAWL_REQUEST_BUDGET_PER_RUN`, `CLASH_CRAWL_DAILY_REQUEST_BUDGET`, `CLASH_DISCOVER_REQUEST_BUDGET_PER_RUN`, `CLASH_DISCOVER_DAILY_REQUEST_BUDGET`, `CLASH_CLAN_WATCH_DAILY_REQUEST_BUDGET` | Daily/per-run reservations are hard caps. Clash crawl revisit is tier-specific in code and defaults to 45 minutes for the fixed sample. |
| Hub | `HUB_PROFILE_REFRESH_BATCH`, `HUB_PROFILE_REFRESH_MAX_TARGETS_PER_DAY` | Limits are target attempts, not raw provider requests; the cost model conservatively assumes three requests per target. |

For an immediate hard stop:

1. Set the relevant game or Hub kill switch to `false`. Remove a cron registration and deploy only if an environment switch cannot be changed safely.
2. If manual Clash queueing is contributing, rotate or clear `BETA_ADMIN_KEY` in the Convex environment.
3. Confirm from `/beta` and recent pipeline runs that no new crawler runs are starting. Keep telemetry and read-only dashboards available.
4. Re-enable one job at a time after the upstream and Convex budgets are below the alert threshold.

Do not use an upstream API token removal as the primary kill switch: it creates avoidable failed runs and telemetry noise. If credentials are suspected compromised, revoke them separately and treat the resulting failures as an incident.

## Target lifecycle

The intended lifecycle is:

```text
discovery / lookup
  -> upsert target (deduplicated by tag)
  -> due queue
  -> lease/claim batch
  -> upstream fetch
  -> ingest + telemetry
  -> success revisit OR failure backoff/disable
```

- Brawl targets are leased for five minutes. Battle logs use adaptive polling from `BRAWL_CRAWL_REVISIT_MINUTES`; profiles default to a separate 12-hour cadence; failures use exponential backoff capped at 24 hours. Public one-time lookups are cache-only, and legacy lookup targets expire after 24 hours.
- Clash targets are leased for five minutes. Fixed, featured, and community tiers revisit on different cadences and expire unless rediscovered; manual targets expire after 90 days. Three consecutive failed fetches disable a target, and later discovery can revive it.
- Opening an unauthenticated Clash clan page creates only a one-off observation retained for seven days. Background clan work requires an explicit renewable seven-day watch and remains bounded by per-run/daily budgets.
- Hub refresh targets are deduplicated by game/entity/tag. Connected profiles contribute free demand; only a verified identity with an active entitlement can create premium watch demand. A target becomes idle when both counts reach zero.
- A high overdue count can mean insufficient capacity, repeated failures, a stopped cron, or a lease/contention problem. Check recent runs and failure rate before increasing batch size.
- A target count is not a subscriber count. Targets can be discovered from rankings, clans, battle sightings, lookups, or manual queueing.

## Telemetry and incident thresholds

Capture a before/after snapshot for every operational change:

- Brawl: total and overdue targets, API calls in the last hour, failures, recent crawl/discovery runs, battles ingested, and capped probes.
- Clash: due count, API calls and failures in the last hour, daily reservations by job, `playerFetches`/`playerFetchFailures`, recent runs, exact-board `rankingsComputedAt`, and warming/normalizing rollup notes.
- Hub: due-target claim counts and refresh failures from function logs, watch-target demand counts, and adapter-specific upstream volume. Hub refresh has no public status page yet.
- Shared deployment: Convex function latency/errors, OCC warnings, database reads/writes, storage growth, and scheduled function failures.

Escalate when any of these persists for two observation windows: upstream traffic exceeds the approved budget, failure rate is rising, due backlog grows while runs report success, OCC warnings recur, or rollup remains partial. A sudden traffic spike with no corresponding batch/config change is an incident until explained.

## Emergency procedure

1. Save the current `/beta` metrics, Convex usage snapshot, recent run log, and relevant OCC/error messages.
2. Freeze manual queueing and apply the soft throttle: crawl batch 1, longer Brawl revisit, lower hard reservation limits, and the smallest discovery limits that preserve basic coverage.
3. If usage or contention continues to rise, activate the game and/or Hub kill switches and leave read-only telemetry running.
4. Check upstream status/rate limits, Convex limits, failed function arguments, and target failure distributions. Do not bulk-delete targets as a first response.
5. Re-enable discovery only after the queue is understood; then re-enable crawl at batch 1 and increase gradually while watching requests/hour and OCC warnings.
6. Record the incident’s start/end time, settings, estimator output, live usage, root cause, and recovery decision.

## Premium subscriber unit economics

Use allocated cost, not a guessed share of the whole Convex invoice:

```text
crawler_cost_per_active_premium = monthly_crawler_cost / active_premium_subscribers
net_revenue_per_subscriber = price - payment_fees - taxes/refunds - support_cost
contribution_margin = net_revenue_per_subscriber - crawler_cost_per_active_premium - other_variable_costs
break_even_subscribers = monthly_fixed_cost / contribution_margin
```

Keep the following inputs explicit and dated: premium price, payment fee rate, active premium subscribers, monthly Convex usage by workload, upstream/API cost, storage/bandwidth allocation, support cost, and any entitlement-specific refresh rate. Price or plan limits must come from current commercial records and the live provider dashboard; this runbook contains none of those live facts.

The estimator's `hub.profile-refresh` job is a worst-case mixed-adapter lane, not premium-only cost. Allocate its measured cost between connected free profiles and verified premium watches using active demand/refresh counts. Do not divide the full shared deployment bill by premium subscribers unless the allocation policy intentionally assigns public traffic and Hub traffic to the premium product.

Premium is currently a fail-closed foundation: the public offer truthfully says checkout is unavailable, and premium watch mutations require verified Convex auth plus an active entitlement. Do not model browser viewer UUIDs, connected profiles, or unauthenticated clan watches as subscribers. Production activation still requires verified auth configuration, a signature-verifying payment webhook, provider secrets, and checkout/product configuration.

## Rollout and migration order

1. Deploy the optional-field schema and backend functions before deploying clients that call the new access/status signatures.
2. Configure and verify the documented crawler controls. Start with conservative limits; keep both game kill switches available during migration.
3. Run `hub/internal/watchTargets:backfillConnectedProfiles` repeatedly until it returns `remaining: false`, then validate connected-profile counts against deduplicated Hub targets.
4. Let Clash pruning retire legacy permanent crawl targets and legacy clan-tracking rows. Explicitly renew only clan watches that still have real demand.
5. Keep Clash legacy deck rankings hidden. The exact 1-day board needs one complete UTC day of incremental coverage; the 7-day board needs seven complete days.
6. Verify telemetry, budgets, due queues, cache hit behavior, and OCC logs before increasing limits or enabling premium billing. Regenerate Convex API types during the deployment push.
