# Unify production delivery and backend

StatsConnect ships one public Vercel deployment at `stats.juanquenga.com` and one Convex production deployment. The Hub and each Game Site remain independently built, mountable Modules within the pnpm monorepo, served at `/`, `/bs`, and `/cr`. A persistent Hub application shell owns the browser document and swaps Game Sites in place for cross-game navigation.

The public game routes are owned by StatsConnect: `/bs` is the Brawl Stars experience and `/cr` is the Clash Royale experience. Each experience keeps its own design system, assets, fonts, and local route contract while sharing the Site Navigation, identity, profile tracking, Platform Backend, and delivery topology. The former `/brawlstars/*` and `/clashroyale/*` paths are permanent compatibility redirects to the canonical prefixes.

The Platform Backend Module owns the shared Convex deployment. Hub, Brawl Stars, and Clash Royale functions and game-owned tables are namespaced so each game retains a clear future split Seam.

## Consequences

Releases, identity, connected profiles, and shared navigation are consistent across the product. The application shell prevents document reloads while the separate build outputs and mount contracts preserve each Game Site's routing, assets, and visual system. A single runtime increases blast radius and creates possible crawler contention, so game-owned data and functions must not directly reference another game's tables. If deploy coupling or noisy-neighbor pressure becomes material, the existing namespaces become separate deployment Adapters without splitting the monorepo.

This supersedes the backend and deployment consequence in ADR-0001. ADR-0001 still governs the shared Site Navigation Module.
