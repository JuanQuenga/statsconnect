# StatsConnect — v1 Build Spec (authoritative)

One hub site for the user's game stats. No per-game branding in hub chrome — **StatsConnect is the only brand**. Connects to existing per-game backends without touching them:

- **Clash Royale** — data fetched **directly from the official Supercell API** by StatsConnect's own Convex deployment (ClashCrown has no HTTP surface; its Convex actions are not a stable cross-app service boundary).
- **Brawl Stars** — data fetched through brawlstats.io's existing public Convex HTTP route `GET {site-url}/api/player?tag=%23TAG`.

The frontend only ever sees StatsConnect contracts. Old service names (ClashCrown, brawlstats.io) never appear in UI copy, errors, titles, or payload fields.

## 0. Resolved decisions (conflicts settled)

| Question | Decision | Rationale |
|---|---|---|
| Profiles per game | **One connected profile per game per viewer** in v1 | Simpler; multi-profile (labels, per-game picker, cap 5) is deferred to v1.1 |
| Game ID form | **Kebab-case everywhere**: `"clash-royale" \| "brawl-stars"` — same value in URLs, Convex schema, and TS types | One canonical form, no slug↔id mapping layer |
| Clash Royale source | Direct official API with StatsConnect-owned token | ClashCrown exposes no HTTP route; calling its actions cross-deployment couples the apps |
| Connections storage | StatsConnect's own Convex tables keyed by anonymous device UUID (`ownerKey = "session:<uuid>"`) | Real hub data; clean path to auth later; game backends stay read-only |
| Tag form | Stored normalized **without `#`** (uppercase); rendered/`#`-prefixed only at display and upstream-API boundaries; **no `#` in URLs** | Matches ClashCrown convention; avoids `%23` in paths |
| Active profile | Single `activeProfileId` in `viewerSettings` (last game opened); per-game "active" is trivially the game's only connection | Follows one-profile-per-game |
| Hub name search | Out of scope — connect is **tag-first only** | Always works; no dependency on ClashCrown's name directory |

Pinned stack (matches brawlstats.io): Vite, React 19, TypeScript strict (no `any`), TanStack Router (file-based) + TanStack Query, Convex, Tailwind CSS 4 via `@tailwindcss/vite`, shadcn-style components (`base-nova`, CSS variables), lucide-react, **pnpm**. SPA deploy to Vercel with the same rewrite as brawlstats.io.

## 1. Route map (TanStack Router, file-based under `src/routes/`)

| File | Renders / behavior | Data |
|---|---|---|
| `__root.tsx` | `AppShell` (sticky nav + footer) + `<Outlet />`; `notFoundComponent` | Router context provides `queryClient` |
| `index.tsx` | Hub home: zero-state (wordmark, "Your game stats, one hub", **Connect a game** CTA, quiet two-tile catalog) **or** Connected-games board | `profiles.getHubState`; light summary per connection |
| `connect/index.tsx` | Pick a game (plain-text tiles, no game logos) | none |
| `connect/$game.tsx` | Tag entry → client format validation → live existence check → confirm panel (name + 2–3 preview stats) → **Save & open dashboard** | `profiles.connect` action |
| `games/$game/index.tsx` | `beforeLoad`: redirect to `/games/$game/$tag` for the connected tag, else `/connect/$game` | `profiles.getHubState` |
| `games/$game/$tag.tsx` | Per-game dashboard (branch UI on `$game`); if `$tag` isn't the saved connection, render read-only with a "Connect this profile" offer | `profileData.getStats` via TanStack Query |
| `settings/index.tsx` | `beforeLoad` redirect → `/settings/connections` | none |
| `settings/connections.tsx` | Manage rows grouped by game: open, reconnect, disconnect (confirm dialog) | `profiles.getHubState`, `profiles.disconnect`, `profiles.setActive` |
| `$.tsx` | Catch-all 404 | none |

Example URLs: `/`, `/connect/brawl-stars`, `/games/clash-royale/2PPGL9YL`, `/settings/connections`. Tags in paths carry **no `#`**.

Post-connect landing: the newly connected game's dashboard (never back to the empty home).

Out of hub v1: ClashCrown meta/decks/clans/tournaments; brawlstats maps/leaderboards/clubs. No cross-links with foreign branding.

## 2. Component inventory

All components are **reimplemented inside StatsConnect** — never imported across repos.

### Shell & primitives (patterns from brawlstats.io)
- `layout/AppShell.tsx` — skip link, sticky blurred header, main column, footer
- `layout/SiteNav.tsx` — StatsConnect text wordmark (left) · **GameSwitcher** (center-left) · Connect/Settings (right); mobile drawer with Menu/X toggle
- `layout/FooterNotice.tsx` — Supercell fan-content disclaimer, StatsConnect copy
- `ui/` shadcn-style set: `button`, `input`, `badge`, `card`, `tabs`, `table`, `select`, `dropdown-menu`, `dialog`, `skeleton`, `separator`
- `ui-helpers.tsx` — `PageStatus` (loading/error/success/info), `EmptyState`
- `lib/utils.ts` (`cn`), `components.json` (`style: "base-nova"`), `lib/tags.ts` (normalize/validate, regex below), `lib/api.ts` (typed fetch + `ApiError`)

### Dashboard blocks (structure informed by ClashCrown's player sections)
- `StatCard` / `StatGrid` — label/value tiles fed by `Metric[]`
- `ProfileHero` — name, `#TAG`, headline stat, affiliation chip, game-specific art allowed here
- `RecentMatches` — battle list with result pips
- `RosterGrid` — cards (CR) / brawlers (BS) from `ProfileItem[]`
- `LoadoutRow` — current deck (CR only in v1)
- `UpcomingList` — chest cycle (CR only in v1)
- `SectionTabs` — CR dashboard: Statistics / Battles / Decks / Cards; BS is a single scroll page in v1
- `LoadingState` / `ErrorState` — full-page async states

### Hub-specific (new)
- `GameSwitcher` — `DropdownMenu`: connected games (label `Game · Name`) → navigate to that game's dashboard; grey "not connected" rows with inline Connect; separator; **Manage connections**; **Connect a game**
- `ConnectedGameBoard` — returning-user home: one bordered row per connection (game name text, player name + `#TAG`, 2–4 headline stats, last-opened) with **Open dashboard** primary CTA
- `ConnectTagForm` — input + validate + confirm flow
- `GameDashboardFrame` — sets `data-game` attribute to scope accent CSS vars

## 3. Shared TypeScript contracts (`src/lib/contracts.ts`, mirrored in `convex/adapters/types.ts`)

```ts
export type GameId = "clash-royale" | "brawl-stars";

export type ProfileDisplay = {
  name: string;
  avatarUrl: string | null;
  headline: { label: string; value: number } | null;
  affiliation: { name: string; tag: string | null } | null;
};

export type ProfileSummary = {
  game: GameId;
  playerTag: string; // always "#TAG" at the public boundary
  display: ProfileDisplay;
};

export type ConnectedProfile = {
  id: string;
  game: GameId;
  playerTag: string;
  display: ProfileDisplay;
  connectedAt: number;
  updatedAt: number;
  lastSyncedAt: number;
};

export type Metric = {
  key: string;
  label: string;
  value: number;
  format: "integer" | "percent";
};

export type ProfileItem = {
  kind: "card" | "brawler";
  id: string;
  name: string;
  level: number | null;
  rank: number | null;
  score: number | null;
  bestScore: number | null;
  imageUrl: string | null;
};

export type RecentMatch = {
  id: string;
  occurredAt: number | null;
  mode: string;
  map: string | null;
  result: "win" | "loss" | "draw" | "ranked" | "unknown";
  rank: number | null;
  scoreDelta: number | null;
};

export type UpcomingItem = { index: number; label: string };

export type ProfileStats = {
  game: GameId;
  playerTag: string;
  summary: ProfileSummary;
  metrics: Metric[];
  roster: ProfileItem[];
  currentLoadout: ProfileItem[];
  recentMatches: RecentMatch[];
  upcoming: UpcomingItem[];
  warnings: string[];
};

export type CacheMetadata = {
  state: "hit" | "refreshed" | "stale" | "stub";
  fetchedAt: number;
  expiresAt: number;
};

export type AdapterResult<T> = { data: T; cache: CacheMetadata };

export type ProfileErrorCode =
  | "INVALID_VIEWER"
  | "PROFILE_NOT_CONNECTED"
  | "INVALID_TAG"
  | "PROFILE_NOT_FOUND"
  | "NOT_CONFIGURED"
  | "UPSTREAM_FORBIDDEN"
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "BAD_UPSTREAM_RESPONSE";
```

**Game mappings.** Clash Royale — headline: trophies; avatar: favorite-card image or null; affiliation: clan; metrics: trophies, best trophies, wins, losses, battle count, three-crown wins, exp level; roster: cards; loadout: current deck + support cards; recent: battlelog; upcoming: chest cycle. Brawl Stars — headline: trophies; avatar: Brawlify icon URL from `player.icon.id`; affiliation: club; metrics: trophies, highest trophies, exp level, exp points, 3v3/solo/duo wins; roster: brawlers; loadout: empty (v1); recent: battle log; upcoming: empty (v1).

## 4. Tag handling

Both games share the Supercell alphabet. One helper (`src/lib/tags.ts` and `convex/adapters/tags.ts`):

```ts
const TAG_RE = /^[0289PYLQGRJCUV]{3,15}$/;
// normalizeTag: trim, strip spaces and leading '#', uppercase, test TAG_RE
// invalid → throw INVALID_TAG. Storage/URL form: no '#'. Display/API form: '#' + tag (URL-encoded upstream).
```

## 5. Convex schema (`convex/schema.ts`)

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const gameIdValidator = v.union(
  v.literal("clash-royale"),
  v.literal("brawl-stars"),
);

export const profileDisplayValidator = v.object({
  name: v.string(),
  avatarUrl: v.optional(v.string()),
  headline: v.optional(v.object({ label: v.string(), value: v.number() })),
  affiliation: v.optional(
    v.object({ name: v.string(), tag: v.optional(v.string()) }),
  ),
});

export default defineSchema({
  connectedProfiles: defineTable({
    ownerKey: v.string(),           // "session:<uuid>" now, "auth:<tokenIdentifier>" later
    game: gameIdValidator,
    playerTag: v.string(),          // canonical uppercase, no '#'
    display: profileDisplayValidator, // snapshot: render switcher/home without upstream calls
    connectedAt: v.number(),
    updatedAt: v.number(),
    lastSyncedAt: v.number(),
  })
    .index("by_owner_key_and_game", ["ownerKey", "game"])
    .index("by_owner_key_and_connected_at", ["ownerKey", "connectedAt"]),

  viewerSettings: defineTable({
    ownerKey: v.string(),
    activeProfileId: v.union(v.id("connectedProfiles"), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner_key", ["ownerKey"]),

  profileCache: defineTable({
    game: gameIdValidator,
    playerTag: v.string(),
    resource: v.union(v.literal("summary"), v.literal("stats")),
    payload: v.string(),            // JSON of validated ProfileSummary | ProfileStats
    schemaVersion: v.number(),
    source: v.union(v.literal("direct"), v.literal("service"), v.literal("stub")),
    fetchedAt: v.number(),
    expiresAt: v.number(),
    staleUntil: v.number(),
  })
    .index("by_game_and_player_tag_and_resource", ["game", "playerTag", "resource"])
    .index("by_stale_until", ["staleUntil"]),
});
```

Invariants:
- `by_owner_key_and_game` is unique in mutations — connecting a different tag for a game **replaces** that game's connection; reconnecting the same tag refreshes `display` but preserves `connectedAt`.
- `activeProfileId` must reference a profile with the same `ownerKey`; disconnecting the active profile falls back to the newest remaining connection or `null`.
- Cache rows are shared across viewers (public data); pruned only after `staleUntil`.
- Parsed cache JSON enters as `unknown` and passes a strict type guard before use.
- Every registered function has both `args` and `returns` validators; indexed lookups only, no `.filter()`.

## 6. Adapter interface & backend layout

```text
convex/
  adapters/
    types.ts        # contracts above + upstream payload types (StatsConnect-owned)
    tags.ts
    registry.ts     # getAdapter(game: GameId): GameAdapter (live or stub per STATSCONNECT_ADAPTER_MODE)
    clash.ts        # direct official Clash Royale API
    brawl.ts        # brawlstats.io /api/player service route
    stub.ts         # deterministic fixtures, both games
  internal/
    profileCache.ts   # internal read-through cache queries/mutations
    profileWrites.ts  # internal connection upserts / active handling
  profiles.ts       # public connection management
  profileData.ts    # public stats/summary actions
  schema.ts
```

```ts
export interface GameAdapter {
  readonly game: GameId;
  normalizeTag(input: string): string; // uppercase, no '#'; throws INVALID_TAG
  connectProfile(tag: string): Promise<AdapterResult<ProfileSummary>>; // live-validates before persist; may prime caches
  getProfileSummary(tag: string): Promise<AdapterResult<ProfileSummary>>;
  getStats(tag: string): Promise<AdapterResult<ProfileStats>>;
}
```

External requests live in Convex **actions**; DB access goes through internal queries/mutations.

### Clash adapter (direct)
- `GET {CLASH_ROYALE_API_BASE_URL}/players/%23TAG` (+ `/battlelog`, `/upcomingchests` in parallel for `getStats`), `Authorization: Bearer {CLASH_ROYALE_API_TOKEN}`.
- Error mapping: local/400 → `INVALID_TAG`; 403 → `UPSTREAM_FORBIDDEN` (note: Supercell tokens are IP-allowlisted — surface an operational message); 404 → `PROFILE_NOT_FOUND`; 429 → `RATE_LIMITED`; 5xx/network → `UPSTREAM_UNAVAILABLE`; missing token → `NOT_CONFIGURED`; bad shape → `BAD_UPSTREAM_RESPONSE`.

### Brawl adapter (service)
- `GET {BRAWLSTATS_SERVICE_URL}/api/player?tag=%23TAG` — the `.convex.site` HTTP Actions URL, no trailing slash. Returns `{ player, battleLog: { items?: [] } }`; one successful fetch populates **both** summary and stats caches, and preserves the old service's ingestion side effect.
- Known limitation (accepted): the route collapses battle-log failure into `{ items: [] }`, so "no battles" and "battle-log failed" are indistinguishable. Render the empty list; do not invent an error.
- StatsConnect never holds the Brawl Stars API token.

### Cache behavior (read-through, in `internal/profileCache.ts`)
1. Normalize tag → look up `profileCache` by (game, tag, resource).
2. `expiresAt > now` → return `state: "hit"`.
3. Else call adapter; validate/normalize; atomically upsert affected resources (`state: "refreshed"`); refresh `display` + `lastSyncedAt` on the connected profile.
4. On upstream failure: return cached row with `state: "stale"` if `staleUntil > now`; else throw the standardized error.
- TTLs: Clash 900 s, Brawl 300 s, stub 60 s; stale window 24 h.
- No public `force` refresh parameter (protects shared upstream quota).
- UI shows a small stale indicator but keeps rendering data.

### Background pipelines

- Every 10 minutes, an internal cron refreshes expired summary and stats cache entries for up to 10 distinct connected `(game, playerTag)` pairs, oldest first. It uses the same adapter-backed read-through path as foreground requests and isolates failures per resource.
- Every hour, an internal pruning cron removes bounded batches of cache rows past `staleUntil` when no connected profile references the pair, plus connect-throttle rows older than the throttle window. Neither job adds a public function.

### Stub mode
`STATSCONNECT_ADAPTER_MODE = "live" | "stub"` (deployment env, default `live`). Stub adapter implements `GameAdapter` with **deterministic** fixtures derived from the normalized tag, real contract shapes, representative metrics/roster/loadout/matches/upcoming, `cache.state: "stub"`. Never silently enabled in production; in live mode missing config throws `NOT_CONFIGURED`. Stub rows either skip the shared cache or persist with `source: "stub"` and the 60 s TTL.

## 7. Public API surface

| Function | Type | Args | Returns |
|---|---|---|---|
| `profiles.getHubState` | query | `{ viewerId: string }` | `{ activeProfileId: string \| null; profiles: ConnectedProfile[] }` (owner-scoped, ordered by `connectedAt`) |
| `profiles.connect` | action | `{ viewerId, game: GameId, playerTag: string }` | `{ profile: ConnectedProfile; activeProfileId: string; summary: AdapterResult<ProfileSummary> }` — live-validates first; no row persisted on failure (unless stub mode) |
| `profiles.disconnect` | mutation | `{ viewerId, profileId }` | `{ removed: boolean; activeProfileId: string \| null }` — verifies ownership |
| `profiles.setActive` | mutation | `{ viewerId, profileId }` | `{ activeProfileId: string }` — verifies ownership |
| `profileData.getSummary` | action | `{ viewerId, profileId }` | `AdapterResult<ProfileSummary>` |
| `profileData.getStats` | action | `{ viewerId, profileId }` | `AdapterResult<ProfileStats>` — the primary dashboard fetch |

Viewer model: browser generates a crypto-random UUID once, persists in `localStorage` (`statsconnect:viewer-id`), passes it as `viewerId`; backend maps to `ownerKey = "session:<uuid>"`. This is personalization, not auth. Later: derive `ownerKey` from `ctx.auth.getUserIdentity().tokenIdentifier`, stop accepting client `viewerId`, migrate `session:` rows post-sign-in. Frontend calls these through a thin typed client (`ConvexHttpClient` wrapped in TanStack Query fetchers; `ConvexProvider` + `useQuery` acceptable for `getHubState` reactivity). Until `convex codegen` can run (needs auth), keep a hand-written `api`-shaped typed wrapper so `tsc --noEmit` passes without `convex/_generated`.

Error payloads mention StatsConnect or the game name — never the old service brands. Rate-limit `profiles.connect` before public launch (tag-cycling bypasses the cache).

## 8. Environment variables

| Variable | Where | Required | Purpose |
|---|---|---|---|
| `VITE_CONVEX_URL` | Frontend (Vite) | Yes | StatsConnect's own Convex deployment URL |
| `CLASH_ROYALE_API_TOKEN` | StatsConnect Convex | For CR live data | Official Supercell bearer token (never `VITE_`-prefixed) |
| `CLASH_ROYALE_API_BASE_URL` | StatsConnect Convex | No (default `https://api.clashroyale.com/v1`) | Override/proxy |
| `CLASH_ROYALE_CACHE_TTL_SECONDS` | StatsConnect Convex | No (default `900`) | CR cache TTL |
| `BRAWLSTATS_SERVICE_URL` | StatsConnect Convex | For BS live data | brawlstats.io `.convex.site` HTTP Actions URL |
| `BRAWLSTATS_CACHE_TTL_SECONDS` | StatsConnect Convex | No (default `300`) | BS cache TTL |
| `STATSCONNECT_ADAPTER_MODE` | StatsConnect Convex | No (default `live`) | `live` \| `stub` |

Tokens live only in Convex deployment env. No Brawlify key needed for icon URLs.

## 9. Visual direction

**Concept: "arcade broadcast console."** The hub is a 10-foot UI — a smart-TV / game-console lobby, not a dashboard. Content sits on a dark stage; large focusable tiles replace list rows; statistics read like a scoreboard.

- **Identity:** text-only StatsConnect wordmark plus a neutral geometric mark (`src/components/brand/Mark.tsx`: a beveled keycap with three ascending signal bars). No game logos and no game-branded colour in the hub chrome. Game art (badges, icons, card/brawler images) allowed **only inside** `/games/$game/...` content.
- **Dark-first, single theme in v1** (no light mode). Tokens on `:root`:

| Token | Value | Role |
|---|---|---|
| `--background` | `#05070d` | Stage |
| `--foreground` | `#eaf0fb` | Text |
| `--card` | `#0c111c` | Panels |
| `--muted` / `--secondary` | `#141b2b` | Secondary surface |
| `--muted-foreground` | `#7d8aa3` | Supporting text |
| `--border` | `color-mix(in oklab, #8ea3c4 16%, transparent)` | Hairlines |
| `--primary` | `#5cc8ff` | Neutral hub accent |
| `--destructive` | `#ff6b7a` | Errors |
| `--ambient` / `--ambient-2` | `#5cc8ff` / `#7c8cff` | Live stage lighting (see below) |

- **Ambient stage lighting (the signature trait):** `AmbientProvider` (`src/components/lobby/ambient.tsx`) tracks which game currently owns the screen. Focusing or hovering a game tile — or opening its dashboard — sets `data-ambient="<gameId>"` on the shell, and `[data-ambient="…"]` rewrites `--ambient` / `--ambient-2`. Three blurred colour pools behind the page (`.stage-light`) cross-fade over 900 ms, so the whole console changes colour with the selection. The stage keeps the last colour rather than snapping back on blur.
- **Per-game accents** are unchanged and still scoped by `[data-game="…"]` (`clash-royale` → `#ee66ef` / `#1f93ff`, `brawl-stars` → `#ffd166` / `#2dd4bf`). They drive tile frames, stat values, tab state, and the ambient pools.
- **Type:** display `Chakra Petch` (squared, techy — headings, buttons, labels), body `Barlow`, numerals `Barlow Condensed` via the `.numeric` utility (tabular, `line-height: 0.9`). Google Fonts in `index.html`; mapped through Tailwind 4 `@theme inline` (`--font-display`, `--font-sans`, `--font-numeric`).
- **Chrome:** angular console plating instead of rounded cards. `.bevel` cuts the top-left and bottom-right corners via `clip-path`; `.bevel-sm` / `.bevel-lg` set the cut size. Surfaces are `.surface-card` / bordered `bg-card/60` with `backdrop-filter`. A faint machined grid (`.plated`) and a fixed film-grain overlay give the stage texture.
- **Layout:** console top bar (mark, game switcher, channel links, live clock) + content column `mx-auto max-w-[1600px] px-5 md:px-10` + a bottom hint bar showing D-pad key legends and the Supercell disclaimer. Section headings use `Panel` (uppercase label, zero-padded count, hairline rule). Eyebrows are `.eyebrow` (`text-[11px] uppercase tracking-[0.32em]`).
- **Focus is a first-class visual, not an afterthought.** `.tile` lifts 6 px, gains a 2 px accent frame (`::after`, clip-path matched to the bevel), reveals arcade corner brackets (`::before`), washes its interior in the game accent (`.tile-glow`), and throws an outer `drop-shadow` glow. Because `clip-path` swallows outlines and box-shadows, outer glow uses `filter: drop-shadow(...)` and brackets sit inside the bevel.
- **Navigation:** `TileNav` gives lobby rows and grids D-pad behaviour — arrow keys move to the spatially nearest `[data-tile]` in the pressed direction rather than following tab order. Horizontal rows use the `.rail` snap scroller.
- **Motion:** one orchestrated boot-in per screen (`.boot-in`, `.stagger` with 60–550 ms delays) plus the ambient cross-fade. Animations use `fill-mode: backwards` so they release `transform` and never block the focus lift. No auto-rotating heroes. Everything is disabled under `prefers-reduced-motion`.

## 10. Vercel

`vercel.json` identical to brawlstats.io:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

## 11. Ordered v1 feature list

1. **Scaffold** — pnpm + Vite + React 19 + TS strict; TanStack Router file routes + generated `routeTree.gen.ts`; Tailwind 4 `@tailwindcss/vite`; `index.css` tokens (§9); shadcn-style `ui/` primitives; `AppShell`/`SiteNav`/`FooterNotice`; `$.tsx` 404; `vercel.json`; `lib/tags.ts`; `lib/contracts.ts`; viewer-ID helper. `tsc --noEmit` green.
2. **Convex backend skeleton** — `schema.ts`, adapter types/registry/tags, **stub adapter first**, internal cache + writes, public `profiles.*` and `profileData.*` with full validators. Try `pnpm exec convex codegen` once; if it demands auth, ship the hand-written typed wrapper and note it.
3. **Connect-profile flow** — `/connect`, `/connect/$game`, `ConnectTagForm` (format check → live/stub existence check → confirm with preview stats → save & open dashboard). Errors via `PageStatus`.
4. **Hub home** — zero-state and `ConnectedGameBoard` from `getHubState`; post-connect landing on the game dashboard.
5. **Per-game dashboards (stubbed data)** — `/games/$game/index` redirect, `/games/$game/$tag` with `GameDashboardFrame`, `ProfileHero`, `StatGrid`, `RecentMatches`, `RosterGrid`; CR adds `SectionTabs` (Statistics/Battles/Decks/Cards), `LoadoutRow`, `UpcomingList`; BS is single-scroll. Skeleton loading, `ErrorState`, stale indicator.
6. **Live adapters** — `clash.ts` (direct official API) and `brawl.ts` (service route) behind the registry; read-through cache per §6; error mapping per §7; stub mode remains switchable via env.
7. **Game switcher + settings** — `GameSwitcher` in nav (connected games, not-connected rows with inline Connect, Manage, Connect-a-game); `/settings/connections` with disconnect confirm dialog and active fallback logic.
8. **Polish & guardrails** — motion pass, empty states, a11y (skip link, focus rings), connect rate limiting, `lastOpenedAt`-style touch on dashboard open (`updatedAt`), final copy sweep for brand leaks.

Deferred past v1: multiple profiles per game (cap 5, labels, per-game picker), profile history, global meta pages (`GameMetaAdapter`), auth (WorkOS) + `session:`→`auth:` migration, light theme, BS in-page tabs, direct Brawl API mode.
