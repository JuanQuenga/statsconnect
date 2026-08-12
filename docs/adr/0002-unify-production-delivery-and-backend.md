# Unify production delivery and backend

StatsConnect ships one public Vercel deployment at `stats.juanquenga.com` and one Convex production deployment. The Hub and each Game Site remain isolated SPA Modules within the pnpm monorepo, served at `/`, `/brawlstars`, and `/clashroyale`.

The Platform Backend Module owns the shared Convex deployment. Hub, Brawl Stars, and Clash Royale functions and game-owned tables are namespaced so each game retains a clear future split Seam.

## Consequences

Releases, identity, connected profiles, and shared navigation are consistent across the product. A single runtime increases blast radius and creates possible crawler contention, so game-owned data and functions must not directly reference another game's tables. If deploy coupling or noisy-neighbor pressure becomes material, the existing namespaces become separate deployment Adapters without splitting the monorepo.

This supersedes the backend and deployment consequence in ADR-0001. ADR-0001 still governs the shared Site Navigation Module.
