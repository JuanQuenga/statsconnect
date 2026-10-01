# StatsConnect Hub

The StatsConnect Hub owns game discovery, connected profiles, and canonical Game Destinations. It is a React SPA built with Vite, TanStack Router and Query, Tailwind CSS, and the shared Site Navigation Module. Canonical navigation links directly to `/bs/*` and `/cr/*`; `/launch/:game` remains only for backward compatibility.

## Backend ownership

The Hub has no app-local backend. Its server Implementation lives in the Platform Backend's `hub` namespace at `packages/backend/convex`. Its shared authentication Interface lives in `packages/auth`.

Run backend commands from the repository root through `@statsconnect/backend`:

```sh
pnpm --filter @statsconnect/backend dev
pnpm --filter @statsconnect/backend typecheck
```

Convex writes the development deployment URL to `packages/backend/.env.local`. Set the same URL as `VITE_CONVEX_URL` for the Hub. See [`.env.example`](./.env.example) and the root [contributor guide](../../CONTRIBUTING.md) for environment and release details.

## Frontend commands

Run these from the repository root:

```sh
pnpm dev:hub
pnpm --filter statsconnect typecheck
pnpm --filter statsconnect build
```

The root unified release deploys the Hub. The app has no Convex or Vercel deployment command.

## PostHog and Sentry

The PostHog organization and project are both named `StatsConnect`. The US Cloud project ID is `640201`, on the capped Free plan with no card attached. Its [Activity page](https://us.posthog.com/project/640201/activity/events) is separate from the existing Piggies project.

The `statsconnect` Vercel project has `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`, and `VITE_SENTRY_DSN` configured for Preview on `feat/posthog-sentry`. These settings apply to subsequent branch deployments. Production activation still requires setting those variables for Production and deploying the branch's changes.

All three frontends use `@statsconnect/site-monitoring`. Set the following public ingestion values in each app’s `.env.local`, or in the environment used by the unified Vercel build:

- `VITE_POSTHOG_KEY`: the StatsConnect PostHog project token.
- `VITE_POSTHOG_HOST`: `https://us.i.posthog.com`, or `https://eu.i.posthog.com` for an EU project.
- `VITE_SENTRY_DSN`: the StatsConnect Sentry project DSN.
- `VITE_MONITORING_ENVIRONMENT`: `production`, `preview`, `development`, or `test`.
- `VITE_SENTRY_RELEASE`: the deployed commit SHA, when available.

Monitoring runs in production builds. For local verification, set `VITE_MONITORING_ENABLED=1` and `VITE_MONITORING_ENVIRONMENT=development` before starting Vite. Missing ingestion keys disable the corresponding service. Use the same keys for all three apps so game switches share one monitoring destination. Keep personal API keys and authentication tokens out of `VITE_*` variables.

PostHog captures page views on pathname changes and six connection events: `player_lookup_submitted`, `player_lookup_succeeded`, `player_lookup_failed`, `profile_save_submitted`, `profile_save_succeeded`, and `profile_save_failed`. Connection events include the game, not the player tag or name. Analytics use an anonymous identifier in local storage. Automatic form capture, session replay, surveys, feature flags, and user identification are disabled. Both integrations respect Do Not Track.

Sentry receives existing render, route, root, promise, and application-shell error reports. Reports retain error type, source positions, and the on-screen error reference. Arbitrary error messages, account data, request bodies, query parameters, and component state are omitted. Tracing and replay are disabled.

### Readable production stack traces

For private source-map uploads, set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` in the build environment. For the created project, the organization is `piggies` and the project is `statsconnect`. The Vite plugin generates hidden source maps only when all three values are present, uploads them, and deletes the `.map` files from the deployment output. Upload errors fail the build. Never prefix the upload token with `VITE_`.

### Verify data collection

Open the local site with monitoring enabled. Navigate to Connect, check a player tag, and confirm a profile. In PostHog Activity, verify the page views and connection events, filtering `environment=development`. In Sentry, confirm a deliberate local test error appears with its source position and error reference. Do not leave a test-error button in production.

Run `pnpm --filter @statsconnect/site-monitoring test`, the frontend typechecks, and `pnpm typecheck:delivery` before shipping changes.
