# Unify production delivery and backend

StatsConnect ships one public Vercel deployment and one Convex production deployment. The Hub uses `statsconnect.app`; Game Sites use `bs.statsconnect.app` and `cr.statsconnect.app`. The Hub and each Game Site remain independently built, mountable Modules within the pnpm monorepo. The root application shell selects the application by exact production hostname. Cross-game navigation loads a new document.

Domain migration note: the original unified host was `stats.juanquenga.com`, followed by apex `/bs` and `/cr` game routes. The game subdomains retain the same backend and root build output. Old hosts remain temporary auth compatibility origins during rollout. Redirect verification and browser-data limitations are documented in [Unified StatsConnect deployment](../UNIFIED_DEPLOYMENT.md).

Each experience keeps its own design system, assets, fonts, and local route contract while sharing the Site Navigation, identity, profile tracking, Platform Backend, and delivery topology. Assets remain namespaced under `/bs` and `/cr`; game routers use root paths on their own hosts. Old apex game routes redirect to the matching game host, excluding static assets. Preview hosts retain path-based app switching.

The Platform Backend Module owns the shared Convex deployment. Hub, Brawl Stars, and Clash Royale functions and game-owned tables are namespaced so each game retains a clear future split Seam.

## Consequences

Releases, identity, connected profiles, and shared navigation are consistent across the product. Auth, profile, and locale cookies share `.statsconnect.app`, with legacy `.juanquenga.com` compatibility retained. Cross-game production navigation reloads the document, while separate build outputs preserve each Game Site's assets and visual system. A shared backend increases blast radius and creates possible crawler contention, so game-owned data and functions must not directly reference another game's tables. If deploy coupling or noisy-neighbor pressure becomes material, the existing namespaces become separate deployment Adapters without splitting the monorepo.

This supersedes the backend and deployment consequence in ADR-0001. ADR-0001 still governs the shared Site Navigation Module.
