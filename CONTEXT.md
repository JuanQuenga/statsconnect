# StatsConnect Product Context

StatsConnect is a game-statistics hub whose shared navigation connects distinct game experiences under one public product and deployment.

## Language

**Hub**:
The StatsConnect site that owns game discovery, connected profiles, and canonical game destinations.
_Avoid_: Portal, dashboard

**Game Site**:
A game-specific statistics application under the StatsConnect product. Each Game Site can retain its own visual system and assets while sharing platform structure and services.
_Avoid_: Micro-site, embedded dashboard

**Site Navigation**:
The shared top-level navigation experience used by the Hub and every Game Site.
_Avoid_: Header, top nav, page shell

**Game Switcher**:
The Site Navigation control that moves users directly between the Hub and Game Sites, using their canonical hosts in production.
_Avoid_: App switcher, product picker

**Game Destination**:
A canonical Game Site URL, optionally including a connected player profile.
_Avoid_: External site, domain redirect

**Platform Backend**:
The shared Convex deployment that owns Hub data and namespaced game-statistics Modules.
_Avoid_: Global database, shared service

**Clash Upstream**:
The official Clash Royale data source. The Platform Backend's Clash Module owns its configuration, requests, validation, errors, and request logs.
_Avoid_: Supercell fetch helper, Clash API wrapper

**Profile Acquisition**:
The Game Site Module that normalizes player and clan tags, defines cache keys, loads domain data, refreshes it, and handles stale data and errors.
_Avoid_: Profile fetch hook, query-key helper

**Profile Tracking**:
The shared account-backed Interface behind Track Profile. It owns cross-game tracked-profile membership for the Hub and both Game Sites; it is distinct from browser-local convenience state and from premium Watch Demand.
_Avoid_: Recent profile, saved dashboard card, refresh subscription

**Personalization Store**:
The Game Site-owned persistence Interface for browser-local recent visits, dashboard state, saved convenience profiles, alert preferences, pairing, and profile observations. It remains separate from account-backed Profile Tracking.
_Avoid_: Account tracking, refresh demand, personalization context

**Watch Demand**:
The premium entitlement-backed request to keep a player or club refresh target active. It is separate from free account-backed Profile Tracking membership and Game Site personalization state.
_Avoid_: Track Profile, saved profile, recent visit

## Relationships

- The unified deployment publishes one canonical **Game Destination** for each **Game Site**.
- Every **Game Site** uses the shared **Site Navigation**.
- The **Site Navigation** contains exactly one **Game Switcher**.
- The **Game Switcher** links directly to `bs.statsconnect.app` and `cr.statsconnect.app` **Game Destinations** in production. Each cross-game choice loads a new document. Preview hosts retain `/bs/*` and `/cr/*` paths.
- The Hub owns the shared **Profile Tracking** Interface, and both Game Sites use its Track Profile contract.
- **Profile Tracking** membership can contribute free refresh demand, while premium **Watch Demand** remains a separate entitlement-backed request.
- Each Game Site keeps its own **Personalization Store** for browser-local recent, dashboard, and saved convenience state.
- The **Platform Backend** keeps Hub and Game Site data in independently owned namespaces.
- The Platform Backend's Clash namespace is the only caller of the **Clash Upstream**.
- The Clash Royale experience owns one **Profile Acquisition** Module for both player and clan domain data.
- The Clash Royale experience can satisfy the **Personalization Store** with either a local or synchronized Adapter.

## Example dialogue

> **Dev:** "Should the Brawl Stars Game Switcher link directly to the Clash Royale experience?"
> **Domain expert:** "Yes. The shared Site Navigation points straight to `https://cr.statsconnect.app`, and saved profiles point to `https://cr.statsconnect.app/players/{tag}`."

## Flagged ambiguities

- "nav" previously meant both site-local links and cross-game navigation; **Site Navigation** is the whole shared experience, while **Game Switcher** names only the cross-game control.
- `/launch/:game` remains a compatibility route for old links; canonical navigation does not emit it.
