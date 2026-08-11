# BrawlStats.io Modernization Plan

## Status

Implemented (2026-08): React SPA + shadcn Base UI + maps meta pipeline.

## Target Stack (current)

- Framework: Vite + React 19
- Router: TanStack Router
- Data fetching: TanStack Query against Convex HTTP Actions
- Styling: Tailwind CSS v4
- Components: shadcn/ui with Base UI (`base-nova`)
- Backend: Convex HTTP Actions, schema, mutations, crons

## Routes

- `/` — home
- `/players` — player profiles (`?tag=`)
- `/clubs` — club profiles (`?tag=`); `/bands` redirects here
- `/leaderboards` — players / clubs / brawlers
- `/maps` — catalog + live rotation
- `/maps/$mapId` — map meta detail
- `/gamemodes/$modeId` — maps for a mode

## Map meta

- Ingest on player lookup + 15m rankings cron
- Tables: `seenBattles`, `mapBrawlerStats`, `mapTeamStats`, `ingestCursors`
- Tier lists gated by minimum pick count

## Visual direction

Keep the BrawlStats.io brand (logo, name, competitive gold/teal-on-navy identity) while using the modern component system — not a generic purple dashboard clone.
