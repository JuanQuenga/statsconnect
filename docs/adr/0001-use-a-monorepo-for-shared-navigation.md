# Use a monorepo for shared navigation

The StatsConnect Hub, Brawl Stars experience, and Clash Royale experience live in one pnpm monorepo so the Site Navigation Module can be imported from one source and changed consistently. We chose this over a published package because separate package versions would drift, and over a runtime-loaded remote shell because a remote failure could remove primary navigation from every site.

## Consequences

Each app retains its own deployment configuration, backend, visual system, links, search, and routing adapter. Shared navigation structure and behavior live only in `packages/site-nav`.
