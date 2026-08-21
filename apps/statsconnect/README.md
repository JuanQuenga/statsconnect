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
