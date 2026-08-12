# Personalization identity boundary

ClashCrown personalization is owned entirely by `apps/clashcrown` and does not assume an authentication API that StatsConnect does not currently expose.

## Current contract

- The only stable StatsConnect integration available to ClashCrown is the site-navigation origin contract (`VITE_STATSCONNECT_ORIGIN` / `NEXT_PUBLIC_STATSCONNECT_ORIGIN`). It provides navigation, not an authenticated subject or access token.
- Personal data therefore uses a capability-owned Convex account. Every browser creates a 256-bit device secret locally; only its SHA-256 digest is stored in Convex.
- A paired browser receives its own device secret. Pairing uses a separate, high-entropy, one-time capability that expires after ten minutes. The raw device and pairing secrets are never included in exports.
- Local storage remains the offline fallback and cache. The v2 store imports the previous `clash-crown:favorite-profiles` and `clash-crown:recent-profiles` records on first use.

## Future StatsConnect adapter

When StatsConnect publishes a stable authenticated identity contract, add a ClashCrown-only adapter with this shape:

```ts
export type StatsConnectIdentityAdapter = {
  status: "loading" | "anonymous" | "authenticated";
  stableSubject: string | null;
  fetchConvexToken: () => Promise<string | null>;
};
```

The token must be issued for the ClashCrown Convex deployment and sent through `ConvexProviderWithAuth`. Backend ownership must be derived from `ctx.auth.getUserIdentity().tokenIdentifier`; a client-provided subject must never authorize access.

Migration should be an explicit, authenticated mutation that claims the current capability account, merges its bounded profiles and recents into the authenticated account, and then revokes the capability devices. Until that full contract exists, the pairing flow remains the secure and usable identity mechanism—there is intentionally no guessed cookie, cross-origin local-storage read, or TODO authentication branch.

## Alert delivery boundary

Alert preferences and last observations sync through Convex. ClashCrown only compares observations when a tracked profile is opened or manually refreshed while the app is running. Browser notifications are best-effort and require the browser permission; there is no service worker push or claim of continuous background monitoring.
