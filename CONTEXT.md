# StatsConnect Product Context

StatsConnect is a game-statistics hub whose navigation and launch flow connect independently branded game sites.

## Language

**Hub**:
The StatsConnect site that owns game discovery, connected profiles, and canonical launch routes.
_Avoid_: Portal, dashboard

**Game Site**:
An independently branded statistics application connected to the Hub.
_Avoid_: Micro-site, embedded dashboard

**Site Navigation**:
The shared top-level navigation experience used by the Hub and every Game Site.
_Avoid_: Header, top nav, page shell

**Game Switcher**:
The Site Navigation control that moves users between the Hub and Game Sites through canonical launch routes.
_Avoid_: App switcher, product picker

**Launch Route**:
A Hub route that resolves a connected profile before opening the requested Game Site.
_Avoid_: Redirect link, deep link

**Platform Backend**:
The shared Convex deployment that owns Hub data and namespaced game-statistics Modules.
_Avoid_: Global database, shared service

**Clash Upstream**:
The official Clash Royale data source. The Platform Backend's Clash Module owns its configuration, requests, validation, errors, and request logs.
_Avoid_: Supercell fetch helper, Clash API wrapper

**Profile Acquisition**:
The Game Site Module that normalizes player and clan tags, defines cache keys, loads domain data, refreshes it, and handles stale data and errors.
_Avoid_: Profile fetch hook, query-key helper

**Personalization Store**:
The Game Site persistence Interface for tracked profiles, recent visits, alert preferences, pairing, and profile observations.
_Avoid_: Local-storage state, personalization context

## Relationships

- The **Hub** publishes one **Launch Route** for each **Game Site**.
- Every **Game Site** uses the shared **Site Navigation**.
- The **Site Navigation** contains exactly one **Game Switcher**.
- The **Game Switcher** targets the **Hub** and its canonical **Launch Routes**.
- The **Platform Backend** keeps Hub and Game Site data in independently owned namespaces.
- The Platform Backend's Clash namespace is the only caller of the **Clash Upstream**.
- ClashCrown owns one **Profile Acquisition** Module for both player and clan domain data.
- ClashCrown can satisfy the **Personalization Store** with either a local or synchronized Adapter.

## Example dialogue

> **Dev:** "Should the BrawlStats Game Switcher link directly to ClashCrown?"
> **Domain expert:** "No. The shared Site Navigation sends that choice through the Hub's Clash Royale Launch Route so the connected profile can be resolved first."

## Flagged ambiguities

- "nav" previously meant both site-local links and cross-game navigation; **Site Navigation** is the whole shared experience, while **Game Switcher** names only the cross-game control.
