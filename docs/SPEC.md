# StatsConnect — v2 Build Spec (authoritative)

**Overwolf-style hub.** StatsConnect is a lobby/launcher only. Each game keeps its own site, design, and layout. Shared account via **[Lakebed Auth](https://docs.lakebed.dev/auth/)**.

| Product | Domain (prod) | Role |
|---|---|---|
| **StatsConnect** | `statsconnect.com` (TBD) / `*.lakebed.app` until custom domain | Hub: login, connect tags, launch |
| **ClashCrown** | `clashcrown.vercel.app` until custom domain | Clash Royale app (own UI) |
| **brawlstats.io** | `brawlstats.io` | Brawl Stars app (own UI) |

Supersedes v1 embedded-dashboard SPEC and the WorkOS draft. In-hub game dashboards are **out of scope**. Game sites own their data UIs.

---

## 0. Resolved decisions

| Question | Decision | Rationale |
|---|---|---|
| Product shape | **Hub + launch-out** | Each game keeps unique design/layout |
| Auth | **Lakebed Auth** (guest + Google) | First-party; no OAuth dashboards, keys, or redirect URI registration; [`docs.lakebed.dev/auth`](https://docs.lakebed.dev/auth/) |
| Runtime for shared identity | **Lakebed capsules** for any surface that must share `userId` | Lakebed Auth is the capsule identity layer — not a drop-in for Convex |
| Identity key | `ctx.auth.userId` (`google:usr_…`) → `ownerKey = userId` | Opaque, immutable; stable across a capsule’s deploy URL and custom domain; never key on email or `identityAliases` |
| Cross-site same account | Same Google account → same `userId` on each Lakebed capsule | Stable `google:usr_…` subjects; old pairwise `google:ps_…` aliases are migration-only |
| Per-origin tokens | **Each site signs in separately** | Tokens are origin-bound and cannot be replayed on another hostname; UX = `<SignInWithGoogle />` once per site, same account |
| Silent cross-domain SSO cookie | **Not available** with Lakebed Auth on separate apex domains | Accept one Google consent / sign-in per origin; IdP may make repeat visits fast |
| Anonymous / guest | Guests can browse hub catalog; **connect/save requires Google** (`!auth.isGuest`) | Matches “shared account” product; guest ids are not durable cross-device |
| Connections storage | StatsConnect capsule DB only | Hub is source of truth for `user ↔ game ↔ tag` |
| Game-site linked tag | Each game capsule stores `linkedTag` keyed by same `userId`; upserted on launch handshake | Sites usable without calling hub every page load |
| Hub brand in chrome | StatsConnect only | Destination names ok on launch CTAs |
| Cross-game navigation | **Shared Site Navigation Module on all three sites** | Structure, responsive behavior, and the Games switcher stay consistent while each site supplies its brand, local links, search, and routing adapters |
| Tag form | Normalized **without `#`** (uppercase) | Same as prior convention |
| Profiles per game | **One linked tag per game per user** | Multi-profile deferred |
| WorkOS / Clerk / Convex Auth | **Rejected for v2** | Replaced by Lakebed Auth |

### Stack implication (explicit)

Lakebed Auth does **not** plug into the current Vite + React 19 + Convex apps. Shared-account v2 means:

1. **StatsConnect hub** is rebuilt (or greenfielded) as a **Lakebed capsule** (`server/index.ts` + `client/index.tsx`, Preact, `lakebed/client` auth UI).
2. **ClashCrown** and **brawlstats.io** must also be Lakebed capsules (or migrate their auth surfaces to Lakebed) before `userId` is truly shared. Until then, use **handshake-only** linking (hub signs a short-lived link payload; game site stores tag under whatever local auth it has) — weaker, temporary.

Existing Convex dashboard code in this repo is reference / scrap for lobby UI ideas, not the v2 runtime.

### Current migration bridge

StatsConnect, ClashCrown, and brawlstats.io live in one pnpm monorepo. A shared Site Navigation Module owns the sticky shell, responsive menu, Games switcher, dimensions, accessibility, and interaction states. Each app supplies brand, local links, search, and routing adapters. The switcher routes through the hub's `/launch/:game` surface. This completes launch navigation, but it does not replace the Lakebed identity and handshake work required for shared authenticated `userId` and automatic linked-tag hydration.

---

## 1. Auth architecture (Lakebed)

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  StatsConnect   │     │   ClashCrown     │     │  brawlstats.io  │
│  Lakebed capsule│     │  Lakebed capsule │     │ Lakebed capsule │
│  SignInWithGoogle│    │ SignInWithGoogle │     │ SignInWithGoogle│
└────────┬────────┘     └────────┬─────────┘     └────────┬────────┘
         │                       │                        │
         │   same Google account → same ctx.auth.userId   │
         │   (tokens still origin-bound per hostname)     │
         └───────────────────────┴────────────────────────┘
                         Lakebed Auth
```

### Contract (from Lakebed docs)

```ts
type Auth = {
  userId: string;          // === subject for authenticated; google:usr_...
  subject?: string;
  identityAliases?: string[]; // migration only — never key new data on these
  displayName: string;
  provider: "guest" | "google";
  isGuest: boolean;
  isAuthenticated: boolean;
  isLoading?: boolean;     // client-only
  email?: string;          // profile only — never an authz key
  emailVerified?: boolean;
  picture?: string;
};
```

### Rules
1. Key all user-owned rows on `ctx.auth.userId` only.
2. Never authorize by email; never infer account links from email.
3. Require `!ctx.auth.isGuest` (Google) for connect / disconnect / handshake.
4. Client: `useAuth()`, `<SignInWithGoogle />`, `signInWithGoogle()`, `signOut()` from `lakebed/client`.
5. Dev: `npx lakebed auth as alice` or `?lakebed_guest=alice` for guest testing; real Google works on localhost via `npx lakebed dev`.
6. Sign-out is per origin (clears that hostname’s session / private query caches).

### Hub auth UX
- Show signed-out / guest lobby with **Sign in with Google**.
- Gate **Connect** and **Save** behind Google.
- Account chip: picture + displayName + Sign out.

No `/callback` WorkOS routes. No `WORKOS_*` env. No `auth.config.ts`.

---

## 2. Hub route map (Lakebed client router)

App-relative routes via `lakebed/client` (`Router` / `Routes` / `Route` / `Link`):

| Path | Behavior |
|---|---|
| `/` | Lobby: connected launch tiles or zero-state |
| `/connect` | Pick a game |
| `/connect/:game` | Tag entry → preview → **Save & launch** |
| `/launch/:game` | Resolve the saved tag; launch the game site or send an unconnected user to `/connect/:game` |
| `/settings/connections` | Launch / reconnect / disconnect |
| `*` | 404 |

**No** in-hub `/games/:game/:tag` dashboards.

### Launch URLs
`shared/destinations.ts` (pure; env via server if needed):

| Game | Open URL template |
|---|---|
| `clash-royale` | `{CLASHCROWN_ORIGIN}/players/{tag}` |
| `brawl-stars` | `{BRAWLSTATS_ORIGIN}/players?tag={tag}` |

Post-connect: navigate to destination (top-level `location.assign`). Optional `from=statsconnect`.

### Cross-site game switcher

StatsConnect, ClashCrown, and brawlstats.io render the shared **Site Navigation** Module, including its compact **Games** control. The game sites link through the hub's canonical `/launch/:game` routes rather than needing access to another game's saved tag:

1. User selects a game from any site.
2. Browser opens `{STATSCONNECT_ORIGIN}/launch/:game`.
3. Hub resolves the connection for its authenticated user.
4. Connected users are redirected to the destination profile; unconnected users are redirected to `/connect/:game`.

The Site Navigation structure, spacing, responsive behavior, and interaction states are shared. Each app supplies its own brand, local links, search, active-route adapter, and theme tokens. A persistent iframe or runtime-loaded remote shell is not used.

---

## 3. Connection + handshake

### Hub schema (concept)
```
connectedProfiles: ownerId (userId) + game + playerTag + display snapshot + timestamps
viewerSettings: ownerId + activeProfileId
previewCache (optional): short TTL for tag existence checks
```

Index: `by_owner_game`, `by_owner_connected_at`.

### Connect flow
1. Server mutation rejects guests.
2. Validate tag format (shared pure helper).
3. Preview existence (hub `endpoints` or mutation that `fetch`es upstream — **claimed deploy** required for outbound fetch).
4. Upsert `connectedProfiles` for `(ownerId, game)`.
5. Handshake endpoint on game capsule: `POST /api/hub/link` with hub-signed payload `{ userId, game, playerTag, exp }` using shared secret in `.env.lakebed.server`.
6. Launch browser to destination URL.

### Game capsule
```
userLinks: ownerId (same userId) + playerTag + updatedAt
```
Authenticated load → default to linked tag when present.

---

## 4. Hub UI inventory (slim)

- Lobby shell / nav / footer (StatsConnect brand)
- Launch tiles / connected board / game picker
- Games switcher: hub, Brawl Stars, and Clash Royale
- Connect tag form
- Sign-in / account controls (`SignInWithGoogle`, `useAuth`)
- **Not in hub:** full CR/BS dashboards, Convex adapters, WorkOS callbacks

Lobby visual language (bevel tiles, stage light) can be reimplemented in the capsule client as desired.

---

## 5. Preview without owning dashboards

| Game | Preview source |
|---|---|
| Brawl Stars | `GET {BRAWLSTATS_SERVICE_URL}/api/player?tag=%23TAG` (name + headlines only) |
| Clash Royale | Official API token in hub `.env.lakebed.server` **or** ClashCrown preview endpoint |

Outbound `fetch` requires a **claimed** Lakebed deploy.

---

## 6. Capsule server surface (hub)

| Kind | Name | Auth | Purpose |
|---|---|---|---|
| query | `hubState` | Google | Connections for `ctx.auth.userId` |
| mutation | `connect` | Google | Upsert + optional handshake |
| mutation | `disconnect` | Google | Remove; best-effort unlink |
| mutation | `setActive` | Google | Last launched |
| mutation / endpoint | `preview` | Google | Tag existence + snapshot |
| endpoint | (game sites) `/api/hub/link` | Hub HMAC / secret | Upsert `userLinks` |

Rate-limit connect/preview per `userId` in capsule logic.

---

## 7. Brand & copy

- Hub chrome: StatsConnect only.
- Launch CTAs may name destinations.
- Supercell fan-content disclaimer on hub footer.

---

## 8. Build order

1. **Greenfield hub capsule** — `npx lakebed new statsconnect`; Google sign-in; lobby shell.
2. **Connections schema + mutations** — keyed on `ctx.auth.userId`; guest-gated.
3. **Connect + launch** — preview → save → `location.assign` destination.
4. **Cross-site switcher** — add the Games control to StatsConnect, ClashCrown, and brawlstats.io; route game-site selections through `/launch/:game`.
5. **Migrate / rebuild game sites as Lakebed capsules** (or auth islands) — same Google → same `userId`.
6. **Handshake** — hub → game `/api/hub/link`; store `linkedTag`.
7. **Lobby polish** — tiles, settings, empty states.
8. **Retire Convex hub** in this repo once capsule is canonical (or replace tree).

---

## 9. Deferred

- Multi-profile per game
- True silent SSO across apex domains (not offered by Lakebed Auth)
- Central cross-origin logout
- In-hub full dashboards (rejected)
- Keeping long-term Convex + Lakebed Auth hybrid (unsupported)

---

## 10. Acceptance checks

- [ ] Google sign-in works on hub via Lakebed (`SignInWithGoogle`) with zero OAuth dashboard setup
- [ ] `ctx.auth.userId` is stable for the same Google user across hub deploy URL and custom domain
- [ ] Same Google account on a game Lakebed capsule yields the **same** `userId` as the hub
- [ ] Connecting a tag persists for that `userId` after reload
- [ ] Launch opens the correct game site URL for the saved tag
- [ ] The Games switcher is available on all three sites and routes through the hub launcher
- [ ] Selecting an unconnected game from the switcher opens that game's connection flow
- [ ] Handshake sets `linkedTag` on the game capsule
- [ ] Guests cannot save connections
- [ ] Hub has no in-app CR/BS dashboard routes
- [ ] No WorkOS / Convex Auth wiring remains in the hub capsule
