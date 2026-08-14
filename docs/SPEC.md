# StatsConnect — current product and platform specification

This document describes the implementation in this monorepo. It supersedes the
unimplemented Lakebed-capsule proposal that previously occupied this file.

StatsConnect is a shared Hub plus two game-specific sites backed by one Convex
deployment. The Hub can save browser-local player connections and launch or
render game views. BrawlStats and Royale Stats keep their own game-specific UI.

| Surface | Unified path | Responsibility |
|---|---|---|
| StatsConnect Hub | `/` | Connect profiles, switch games, shared access catalog |
| BrawlStats | `/brawlstars/*` | Brawl Stars tools and presentation |
| Royale Stats | `/clashroyale/*` | Clash Royale tools and presentation |
| Canonical backend | `packages/backend/convex` | Shared schema, functions, HTTP routes, and crons |

The deploy topology and data-migration procedure are in
[`docs/UNIFIED_DEPLOYMENT.md`](./UNIFIED_DEPLOYMENT.md).

---

## 1. Identity and authorization

### Shipped browser identity

The Hub currently creates a random UUID with `crypto.randomUUID()` and stores it
under `statsconnect:viewer-id` in browser local storage. Backend Hub functions
validate it and store the derived `session:<uuid>` owner key.

This identifier is useful for low-risk personalization, but it is **not
authentication**:

- it is controlled by the browser;
- it does not prove a person or account;
- it is not shared automatically across devices or origins;
- anyone who obtains the value can replay it.

Consequently, the viewer UUID may connect, select, and remove public game
profiles for that browser. It must never authorize purchases, premium access,
billing changes, or account-level watch mutations.

### Verified account boundary

Premium ownership is keyed only by the `tokenIdentifier` returned from
`ctx.auth.getUserIdentity()` after Convex verifies an auth provider token. The
repository does not currently configure an auth provider, so no browser can
obtain premium access or create/cancel premium watches in production today.

The premium mutations are intentionally present but fail closed with
`AUTH_REQUIRED` until verified auth is configured. They never accept `viewerId`
or `ownerKey` as an authorization input.

Provider selection and sign-in UI remain integration work. When they are added:

1. configure a supported Convex auth provider and its issuer/audience;
2. send its token through the Convex client on every StatsConnect surface;
3. use `identity.tokenIdentifier` as the single cross-site entitlement subject;
4. define an explicit account-link migration if an identity provider changes;
5. do not migrate browser UUIDs directly into authenticated account ownership
   without a signed-in, user-confirmed claim flow.

The previous Lakebed Auth design was never implemented and is not an authority
for the current application.

---

## 2. Shared access model

Access is one StatsConnect-wide tier, not a separate purchase per game.
`hub/accessModel.ts` is the central plan definition.

| Limit | Free | StatsConnect+ |
|---|---:|---:|
| Connected players per game in the Hub | 1 | 1 |
| Watched players per game | 0 | 3 |
| Watched clubs per game | 0 | 1 |

Free access is derived when no active entitlement exists. A premium entitlement
grants access only while its status is `active` or `grace_period` and it has not
expired. `past_due`, `canceled`, and `expired` entitlements resolve to free.

### StatsConnect+ offer contract

The shared offer is intended to cover all supported StatsConnect game sites:

- ad-free StatsConnect experiences;
- background profile snapshots;
- priority refresh scheduling;
- longer retained history;
- up to 3 watched players and 1 watched club per game.

The access query reports `availability: "foundation"` and
`checkoutAvailable: false`. The Hub must not show a purchase action while those
values remain in effect. Each benefit is a product contract for later game-site
integration, not a claim that every site already enforces it.

Refresh is best-effort. Product copy must not imply guaranteed battle capture.
Upstream APIs can be delayed, unavailable, rate-limited, or expose only a
bounded recent history.

---

## 3. Entitlements and billing boundary

`accountEntitlements` stores the normalized access state for one verified auth
subject. It can retain provider customer/subscription references, expiry,
cancel-at-period-end state, and cancellation time, but never secrets.

`billingEventReceipts` is an idempotency ledger keyed by provider and event ID.
The internal `applyBillingUpdate` mutation ignores duplicate webhook events and
prevents an older event from overwriting newer entitlement state.

Payment-provider code is isolated behind the narrow
`PaymentProviderWebhookAdapter` contract. No provider SDK, checkout session,
price ID, webhook route, or secret is included in this foundation. Checkout is
not live.

### Real payment integration requirements

A future provider integration must:

1. receive the raw webhook body in an HTTP action;
2. verify the provider signature before parsing or writing anything;
3. map provider customer/subscription metadata to a verified StatsConnect auth
   subject established during authenticated checkout;
4. normalize the event through `BillingEntitlementUpdate`;
5. call the internal idempotent entitlement mutation;
6. handle activation, renewal, grace, past-due, cancellation, and expiry events;
7. keep provider secrets in deployment environment variables;
8. test duplicate and out-of-order webhook delivery;
9. expose checkout only after verified identity, prices, portal behavior,
   refunds, and webhook replay handling are complete.

An email address, browser UUID, player tag, or provider customer ID alone is not
an authorization key.

---

## 4. Watch demand and upstream targets

### Subscriber demand

`watchDemands` records one verified subject's request for a normalized
`(game, entity, tag)` target. It includes:

- premium tier;
- `active`, `canceled`, or `expired` status;
- optional entitlement-aligned expiry;
- explicit cancellation time;
- created and updated timestamps.

Creating and canceling watches requires verified auth. Creation also checks the
current premium entitlement and the per-game player/club quotas in the central
plan model. Canceling, expiring, or losing premium access decrements target
demand.

### Deduplicated target

`watchTargets` has one row per canonical key:

```text
<game>:<player|club>:<normalized-tag>
```

The row contains `connectedProfileCount`, `watcherCount`, effective free or
premium tier, status, cadence, next due time, activity/poll timestamps, and
failure count. Many browsers and premium subscribers therefore share one
upstream poll.

Browser-local Hub connections contribute only `connectedProfileCount`; they do
not create premium demand. Premium demand raises the effective target tier and
selects active scheduling. A target becomes idle only when both counts reach
zero.

Player targets are integrated with the Hub profile adapter. Club targets and
game crawler ingestion are schema-ready but remain game-team integration work;
this foundation does not change Brawl or Clash crawler internals.

---

## 5. Adaptive scheduling and caching

Scheduling uses deterministic jitter so targets do not become due at the same
instant:

| Class | Window | Intended use |
|---|---:|---|
| Active | about 30 minutes (25–35m) | Premium watches and recently opened profiles |
| Warm | about 2 hours (105–135m) | Connected profiles inactive for 12h–7d |
| Cold | 6–12 hours | Connected profiles inactive for more than 7d |
| Lookup expiry | 24–72 hours | Stale fallback lifetime for cached lookups |

Premium watchers always select active cadence. Otherwise cadence adapts from the
last recorded profile activity.

The Hub refresh cron no longer scans hundreds of expired cache rows and probes
for connections. It atomically claims a bounded batch from the
`watchTargets.by_status_and_entity_and_next_due_at` index. Claiming moves each
due time forward as a short lease, which limits duplicate work from overlapping
cron runs.

The claim transaction also reserves against `hubRefreshBudgets`, so overlapping
workers cannot exceed the configured UTC-day target-attempt cap. Operators can
set `HUB_PROFILE_REFRESH_ENABLED=false`, lower `HUB_PROFILE_REFRESH_BATCH`, or
lower `HUB_PROFILE_REFRESH_MAX_TARGETS_PER_DAY` without changing target demand.

For player refreshes, the cron loads the stats resource once. Each adapter primes
the summary cache from the same response. In particular, the Clash adapter's
player response is reused for both stats and summary instead of issuing a second
profile request. Cache writes for both resources remain one transaction.

Game-specific caches and crawlers may later consume `watchTargets`, but they
must preserve the one-target/one-upstream-poll invariant.

---

## 6. Current Hub routes

| Path | Behavior |
|---|---|
| `/` | Landing page or connected-profile lobby |
| `/connect` | Choose a game |
| `/connect/:game` | Preview and save one browser-local player tag |
| `/launch/:game` | Resolve a saved tag and open the game surface |
| `/games/:game` | Hub game entry route |
| `/games/:game/:tag` | Hub profile dashboard route |
| `/settings/connections` | Open, replace, select, or remove browser connections |
| `*` | Not found |

The shared site navigation routes between the Hub, BrawlStats, and Royale Stats.
Browser connections are convenience state only and should be described as
connected “to this browser.”

---

## 7. Schema rollout and migration

The new entitlement, billing receipt, watch demand, watch target, and Hub refresh
budget tables are additive. `connectedProfiles.refreshTargetKey` is optional so
an existing deployment can accept the schema before old rows are migrated.

After deployment:

1. let the hourly `backfillConnectedProfiles` cron register legacy connections
   in bounded batches, or invoke the internal mutation until it reports
   `remaining: false`;
2. compare connected-profile counts grouped by game/tag with each target's
   `connectedProfileCount`;
3. confirm the due-target cron reads `watchTargets` directly and no longer uses
   expired-cache candidate scanning;
4. monitor target failures and upstream request volume before increasing the
   refresh budget;
5. keep `refreshTargetKey` optional until production data has been verified and
   a later migration intentionally tightens it.

Deploy schema/functions before a frontend that depends on `hub/access:getAccess`.
Regenerate committed Convex API types from a configured deployment as part of
the normal deploy workflow.

---

## 8. Acceptance checks

- [ ] A new browser receives a UUID in local storage and can connect one player
      per game.
- [ ] Copy describes those connections as browser-local, not authenticated.
- [ ] Unauthenticated access resolves to free and premium mutations return
      `AUTH_REQUIRED`.
- [ ] Only verified `tokenIdentifier` subjects can own entitlements or watches.
- [ ] Active premium access applies across all supported games.
- [ ] Watch quotas enforce 3 players and 1 club per game.
- [ ] Multiple subscribers to the same game/entity/tag increment one target's
      watcher count rather than create duplicate targets.
- [ ] Cancellation, expiry, and inactive entitlements remove active demand.
- [ ] Due player refresh selects directly from the watch target due-time index.
- [ ] A stats refresh primes summary and performs one Clash player fetch.
- [ ] Checkout remains unavailable until a verified provider adapter and webhook
      integration are deployed.
- [ ] Product copy promises best-effort refresh, never guaranteed battle capture.
