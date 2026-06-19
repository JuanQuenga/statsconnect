# BrawlStats.io Modernization Plan

## Goal

Migrate the recovered static/PHP-era BrawlStats.io demo into a modern, maintainable web app while preserving the original product shape:

- Home page at `/`
- Player profile at `/players/:tag`
- Band profile at `/bands/:tag`
- Leaderboards at `/leaderboards/:option`
- Recovered game assets available for visual fidelity

The current GitHub default branch only contained `README.md`. The closest available implementation source is the recovered local archive, now represented by this static demo plus `recovered-assets/`.

## Target Stack

- Framework: TanStack Start
- Router: TanStack Router
- Data fetching/cache: TanStack Query
- Styling: Tailwind CSS v4
- Component base: shadcn/ui initialized with Base UI primitives
- Forms: TanStack Form or lightweight controlled React forms
- Tables: TanStack Table for leaderboards and band members
- Validation: Zod for route/search params and API response shape

## Architecture

Use route-level data boundaries:

- `/` renders the simple recovered landing page state.
- `/players/$tag` loads a player profile and brawler collection.
- `/bands/$tag` loads band metadata and members.
- `/leaderboards/$option` loads player, band, or brawler leaderboards.

Keep the recovered static demo routes during migration as a visual reference, then replace them route by route with TanStack pages.

## Data Strategy

Start with local fixtures that match the recovered PHP templates:

- `fixtures/player-profile.json`
- `fixtures/band-profile.json`
- `fixtures/leaderboard.json`
- `fixtures/brawlers.json`

Wrap fixture access behind repository functions such as `getPlayerProfile(tag)`, `getBand(tag)`, and `getLeaderboard(option)`. This keeps the app ready for a future API without coupling components to mock data.

## Asset Strategy

Keep recovered assets in source control for now:

- `assets/` contains the demo-ready subset.
- `recovered-assets/brawlstats.io/` contains the recovered site asset tree.
- `recovered-assets/old-brawlstats/` contains older recovered image assets.

During the modern rebuild, normalize asset names and move only used assets into `public/assets/brawlstats/`. Keep the full recovered tree until visual parity is confirmed.

## UI Migration

1. Initialize TanStack Start.
2. Initialize Tailwind CSS v4.
3. Initialize shadcn non-interactively with Base UI:

   ```bash
   npx shadcn@latest init -d --base base-ui
   ```

4. Add only needed shadcn components first:

   ```bash
   npx shadcn@latest add button input table card dropdown-menu
   ```

5. Rebuild page shells with shared layout components:

   - `AppShell`
   - `SiteNav`
   - `SearchHeader`
   - `FooterNotice`

6. Rebuild domain components:

   - `PlayerIdentity`
   - `BandBadge`
   - `XpBar`
   - `StatTile`
   - `BrawlerCard`
   - `MemberTable`
   - `LeaderboardTable`

## Visual Parity Checklist

- Navbar keeps the recovered `BRAWLSTATS.IO` logo/title treatment.
- Home page keeps the recovered `Coming Soon!` state unless product direction changes.
- Player page keeps the original search header, identity row, XP bar, stat row, and brawler cards.
- Band page keeps the badge/name/header, description, trophy stats, and member table.
- Leaderboard page keeps the board header and row density.
- Mobile layout has no horizontal overflow.
- All referenced images resolve locally.

## Implementation Phases

### Phase 1: Static parity

- Keep the current static HTML demo working.
- Add fixture JSON extracted from current demo data.
- Document recovered source paths and asset provenance.

### Phase 2: TanStack scaffold

- Add TanStack Start app structure.
- Configure Tailwind v4.
- Configure shadcn with Base UI.
- Add route files matching the recovered URLs.

### Phase 3: Component migration

- Port static HTML sections into React components.
- Replace hand-written tables with TanStack Table where sorting/filtering matters.
- Keep visual styling close to the recovered design before modernizing.

### Phase 4: Data layer

- Move mock data access behind query functions.
- Add TanStack Query hooks for player, band, and leaderboard pages.
- Add loading, empty, invalid tag, and not found states matching the old PHP branches.

### Phase 5: Polish and deployment

- Add responsive QA screenshots.
- Add lint/typecheck/build checks.
- Deploy as a static or server-rendered app depending on API needs.
- Decide whether the full `recovered-assets/` tree stays in the repo or moves to archival storage.

## Open Questions

- Should the site preserve the 2017 visual design exactly, or become a modernized BrawlStats revival?
- Should the public routes remain `/players/:tag` and `/bands/:tag`, or should tags move into search params?
- Is there a surviving API source worth reviving, or should the first modern version stay fixture-backed?
- Should `recovered-assets/` be kept in Git long term, or uploaded to object storage after migration?
