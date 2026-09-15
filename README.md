# StatsConnect

StatsConnect brings Brawl Stars and Clash Royale statistics into one platform. Search players and clubs or clans, explore game statistics, and connect profiles across both games.

Development of [BrawlStars](https://github.com/JuanQuenga/BrawlStars) and [ClashCrown](https://github.com/JuanQuenga/ClashCrown) continues here. Both experiences share navigation, account connections, and a Convex backend.

[Open StatsConnect](https://stats.juanquenga.com/) · [Brawl Stars](https://stats.juanquenga.com/bs/) · [Clash Royale](https://stats.juanquenga.com/cr/)

## Contributing

Start with the [local setup guide](./CONTRIBUTING.md#local-setup). It covers Node.js 24, pnpm 10.12.3, environment templates, and your Convex development deployment.

For UI work without upstream API keys, see [development without upstream credentials](./CONTRIBUTING.md#development-without-upstream-credentials) and the [Clash Royale demo mode](./apps/clashcrown/README.md#reviewing-the-rankings-ui-without-convex). Live statistics require server-side credentials.

Read [making and verifying changes](./CONTRIBUTING.md#making-a-change) before submitting a pull request. Keep changes focused on one app or shared package.

## Workspace

- `apps/statsconnect`: hub, connections, and canonical game destinations
- `apps/brawlstats`: Brawl Stars statistics site
- `apps/clashcrown`: Clash Royale statistics site
- `packages/backend`: the sole executable Convex Platform Backend
- `packages/auth`: shared authentication and saved-profile synchronization
- `packages/site-nav`: shared Site Navigation Module used by all three apps

Each game keeps its own design, routes, and search experience. One Vercel deployment serves all three apps, and the shared Game Switcher moves between them without reloading the document. All apps use the Convex backend in `packages/backend`.

`scripts/production-delivery.ts` defines route prefixes, public origins, output locations, build order, and release ownership.

For local setup, architecture, environment variables, contribution rules, deployment, operations, and the Convex cost model, read [CONTRIBUTING.md](./CONTRIBUTING.md).

## Production topology

- `apps/statsconnect`: `stats.juanquenga.com/`
- `apps/brawlstats`: `stats.juanquenga.com/bs/*`
- `apps/clashcrown`: `stats.juanquenga.com/cr/*`
- `packages/backend`: the shared Convex production deployment

The former `/brawlstars/*` and `/clashroyale/*` paths permanently redirect to `/bs/*` and `/cr/*`, preserving deep-link suffixes and query parameters.

The shared Game Switcher links directly to these same-origin paths. `/launch/:game` is retained only for old bookmarks and is not part of canonical navigation.

Production delivery uses one root Vercel project and one Convex deployment. Follow the release procedure in [CONTRIBUTING.md](./CONTRIBUTING.md#production-deployment) before releasing.

## Commands

```sh
pnpm dev:hub
pnpm dev:brawlstats
pnpm dev:clashcrown
pnpm --filter @statsconnect/backend dev
pnpm test:delivery
pnpm typecheck
```

Run Convex development, environment, and deployment commands through `@statsconnect/backend` or from `packages/backend`. App directories do not own executable Convex backends.

## License and game assets

The Brawl Stars app has a [PolyForm Noncommercial License 1.0.0](./apps/brawlstats/LICENSE). This repository does not yet provide a repository-wide license for the remaining code. Public visibility does not grant additional reuse rights.

Third-party game artwork, logos, names, and other assets remain the property of their respective owners. See the [Brawl Stars asset sources](./apps/brawlstats/ASSET_SOURCES.md) for attribution.

StatsConnect is not affiliated with, endorsed, sponsored, or specifically approved by Supercell. Supercell is not responsible for this content. See [Supercell's Fan Content Policy](https://supercell.com/en/fan-content-policy/).
