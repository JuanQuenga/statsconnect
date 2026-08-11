# Asset Sources

This site uses local brand assets plus current Brawl Stars assets served by Brawlify's CDN, and metadata from BrawlAPI.

## GitHub-backed CDN

- Repository: https://github.com/Brawlify/CDN
- CDN base: https://cdn.brawlify.com
- License: MIT for the CDN repository; Supercell fan content rules still apply.

Useful folders:

- `brawlers/borders/{id}.png`
- `brawlers/model/{id}.png`
- `club-badges/regular/{id}.png`
- `game-modes/regular/{id}.png`
- `maps/regular/{id}.png`
- `profile-icons/regular/{id}.png`

## Metadata APIs

- Brawler catalog: `https://api.brawlapi.com/v1/brawlers` (proxied as `/api/brawlers`)
- Maps catalog: `https://api.brawlapi.com/v1/maps` (proxied as `/api/maps`)
- Game modes: `https://api.brawlapi.com/v1/gamemodes` (proxied as `/api/gamemodes`)

Player, club, battle, event, and ranking statistics come from the official Brawl Stars API through Convex.

## First-party map meta

Win rate, use rate, and team composition aggregates are computed by BrawlStats from official battle logs stored in Convex. They are **not** Brawlify proprietary stats. Map detail responses join BrawlAPI map metadata with Convex `mapBrawlerStats`.

## Local brand assets

Site logo and recovered icons live under `public/assets/img/` (copied from `assets/img/`).

The homepage arena background and character-group hero under `public/assets/generated/` were generated for BrawlStats.io with OpenAI image generation on 2026-08-10. The hero is fan art depicting the official Brawl Stars characters Colt, Shelly, and Spike.

## Fan Content Notice

This content is not affiliated with, endorsed, sponsored, or specifically approved by Supercell. Supercell is not responsible for it. Follow Supercell's Fan Content Policy when publishing or distributing the site.
