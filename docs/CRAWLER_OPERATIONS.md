# Crawler operations runbook

This runbook covers the Brawl Stars and Clash Royale crawlers in the shared Convex deployment. It is for operators deciding whether to keep, throttle, or stop scheduled work. The cost model is intentionally separate from billing: run `pnpm estimate:crawler-cost` for a deterministic configuration estimate, then compare it with the live Convex dashboard.

## Scope and source of truth

- Configuration defaults live in [`scripts/crawler-cost.config.json`](../scripts/crawler-cost.config.json).
- The estimator is [`scripts/estimate-crawler-cost.mjs`](../scripts/estimate-crawler-cost.mjs). It does not make network requests.
- The Convex dashboard is authoritative for current usage, limits, function failures, and billing. The estimator is a planning model, not an invoice calculator.
- The Brawl `/beta` page reports queue depth, due targets, recent runs, battles, and API calls. The Clash `/beta` page reports due targets, API calls, counters, recent runs, and rollup freshness.

The estimator includes scheduled crawl, discovery, Clash rollup, and tracked-clan polling. It excludes product reads, manual lookups, retries, bandwidth, storage, hub cache traffic, and data-dependent pruning. Change the JSON assumptions when the implementation changes; do not silently compare a model with a different deployment.

## Dated production baseline

The following values are observations from the parent audit, recorded **2026-08-13**. They are a historical production baseline, not live billing facts and not a claim about the current state:

| Area | Audit observation | Use in operations |
| --- | ---: | --- |
| Brawl upstream traffic | 492 requests/hour | Compare with the estimator and the Brawl `/beta` hourly fetch counter. Investigate any unexplained increase. |
| Brawl queue | 619 targets, 470 overdue | Treat the overdue ratio as backlog pressure; do not raise batch size just to make the number move without checking rate limits and OCC warnings. |
| Clash upstream traffic | 264 requests/hour | Compare with Clash `/beta` and the Clash API budget. |
| Clash queue | 200+ due | Use the bounded dashboard count; confirm exact queue state from Convex before changing capacity. |
| Clash rollup | 60,307 rows read; partial result | Keep the 60,000-row read cap visible in incident notes. A partial rollup is a data-freshness issue as well as a usage signal. |
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

There is currently no runtime `CRAWLER_ENABLED=false` switch in the unified crawler. `BETA_ADMIN_KEY` protects the manual Brawl queue-control action; it is not a cron kill switch.

For a soft throttle, update Convex environment values and record the change and expected estimator output:

| Game | Lower-cost controls | Notes |
| --- | --- | --- |
| Brawl | `BRAWL_CRAWL_BATCH`, `BRAWL_CRAWL_REVISIT_MINUTES`, `BRAWL_DISCOVER_LIMIT`, `BRAWL_CLUB_SEED` | Batch 1 and a longer revisit interval reduce target work. Discovery limits reduce the next seed pass. |
| Clash | `CLASH_CRAWL_BATCH`, `CLASH_DISCOVER_LIMIT`, `CLASH_CLAN_SEED` | Clash crawl revisit is currently a code constant of 45 minutes; changing it requires a reviewed deployment. |

For an immediate hard stop:

1. Disable or remove the relevant crawler cron registrations in `packages/backend/convex/crons.ts` (and the standalone app cron file if that deployment is still active), then deploy the reviewed change.
2. If manual Brawl queueing is contributing, rotate or clear `BETA_ADMIN_KEY` in the Convex environment.
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

- Brawl targets are leased for five minutes. A successful target is revisited after `BRAWL_CRAWL_REVISIT_MINUTES`; failures use exponential backoff capped at 24 hours.
- Clash targets are leased for five minutes and normally revisited after 45 minutes. Three consecutive failed fetches disable a target; later discovery can revive it and reset the failure count.
- A high overdue count can mean insufficient capacity, repeated failures, a stopped cron, or a lease/contention problem. Check recent runs and failure rate before increasing batch size.
- A target count is not a subscriber count. Targets can be discovered from rankings, clans, battle sightings, lookups, or manual queueing.

## Telemetry and incident thresholds

Capture a before/after snapshot for every operational change:

- Brawl: total and overdue targets, API calls in the last hour, failures, recent crawl/discovery runs, battles ingested, and capped probes.
- Clash: due count, API calls and failures in the last hour, `playerFetches`/`playerFetchFailures`, recent runs, rollup `rankingsComputedAt`, `rowsRead`, and whether the result says it is partial.
- Shared deployment: Convex function latency/errors, OCC warnings, database reads/writes, storage growth, and scheduled function failures.

Escalate when any of these persists for two observation windows: upstream traffic exceeds the approved budget, failure rate is rising, due backlog grows while runs report success, OCC warnings recur, or rollup remains partial. A sudden traffic spike with no corresponding batch/config change is an incident until explained.

## Emergency procedure

1. Save the current `/beta` metrics, Convex usage snapshot, recent run log, and relevant OCC/error messages.
2. Freeze manual queueing and apply the soft throttle: crawl batch 1, longer Brawl revisit, and the smallest discovery limits that preserve basic coverage.
3. If usage or contention continues to rise, hard-stop the crawler crons and leave read-only telemetry running.
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

If premium refreshes are more frequent than the public crawler, model that workload as a separate job. Do not divide the full shared deployment bill by premium subscribers unless the allocation policy intentionally assigns public traffic and hub traffic to the premium product.
