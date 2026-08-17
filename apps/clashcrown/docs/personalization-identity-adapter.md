# Personalization identity

The ClashCrown personalization Module has frontend code in the Game Site and backend code in `packages/backend/convex/clash/personalization.ts`. It runs on the Platform Backend and authorizes requests through a capability Interface.

## Current contract

- `@statsconnect/auth` and the Platform Backend handle shared Google sign-in and saved player profiles. The personalization Module does not use that account as its authorization key.
- Personalization data uses a capability-owned account in the Platform Backend's `clash` namespace. Every browser creates a 256-bit device secret locally. Convex stores only its SHA-256 digest.
- A paired browser receives its own device secret. Pairing uses a separate, high-entropy, one-time capability that expires after ten minutes. Exports omit raw device and pairing secrets.
- Local storage remains the offline fallback and cache. The v2 store imports the previous `clash-crown:favorite-profiles` and `clash-crown:recent-profiles` records on first use.

## Relationship to shared authentication

Shared authentication does not authorize capability-backed personalization. No Adapter converts a signed-in account into ownership of an existing capability account. The current personalization Module grants access through the pairing flow.

Any merge needs a migration contract that claims capability data, resolves conflicts, and revokes old devices. This document does not choose that design.

## Alert delivery boundary

Alert preferences and last observations sync through Convex. ClashCrown only compares observations when a tracked profile is opened or manually refreshed while the app is running. Browser notifications are best-effort and require the browser permission; there is no service worker push or claim of continuous background monitoring.
