# Asset Sources

This site uses local game-specific assets plus current Brawl Stars assets served by Brawlify's CDN, and metadata from BrawlAPI. The assets retain their historical provenance while the public experience is now branded under StatsConnect.

## GitHub-backed CDN

- Repository: https://github.com/Brawlify/CDN
- CDN base: https://cdn.brawlify.com
- License: MIT for the CDN repository; Supercell fan content rules still apply.

Useful folders:

- `brawlers/borders/{id}.png`
- `brawlers/portraits/{id}.png` for the larger roster cards
- `brawlers/model/{id}.png`
- `gadgets/regular/{id}.png` and `star-powers/regular/{id}.png`
- `club-badges/regular/{id}.png`
- `game-modes/regular/{id}.png`
- `maps/regular/{id}.png`
- `profile-icons/regular/{id}.png`

BrawlAPI currently advertises `borderless` gadget and Star Power URLs that
return 404 for newer abilities. The frontend uses the ability ID with Brawlify's
working `regular` folders instead. Vince and Cosmo are also absent from the
current Brawlify brawler image folders. Their unmodified 250 × 154 PNGs from
Supercell Support are stored under `public/assets/brawlers/portraits/` and used
across roster, player, and detail pages until larger official portraits exist.
Sources: `https://support.supercell.com/images/BS-Cosmo.png?v=1787919511`
and `https://support.supercell.com/images/BS-Vince.png?v=1787919601`.

## Metadata APIs

- Brawler catalog: `https://api.brawlapi.com/v1/brawlers` (proxied as `/api/brawlers`)
- Maps catalog: `https://api.brawlapi.com/v1/maps` (proxied as `/api/maps`)
- Game modes: `https://api.brawlapi.com/v1/gamemodes` (proxied as `/api/gamemodes`)

Player, club, battle, event, and ranking statistics come from the official Brawl Stars API through Convex.

## First-party map meta

Win rate, use rate, and team composition aggregates are computed by the Brawl Stars experience from official battle logs stored in Convex. They are **not** Brawlify proprietary stats. Map detail responses join BrawlAPI map metadata with Convex `mapBrawlerStats`.

## Local brand assets

Site logo and recovered icons live under `public/assets/img/` (copied from `assets/img/`).

The homepage arena background and character-group hero under `public/assets/generated/` were originally generated for the former BrawlStats.io experience with OpenAI image generation on 2026-08-10. They remain Brawl Stars visual assets under StatsConnect; the hero is fan art depicting the official Brawl Stars characters Colt, Shelly, and Spike.

## Fan Content Notice

This content is not affiliated with, endorsed, sponsored, or specifically approved by Supercell. Supercell is not responsible for it. Follow Supercell's Fan Content Policy when publishing or distributing the site.
