# BrawlStats.io Static Demo

Standalone archival mock for the recovered `JuanQuenga/brawlstats.io` site.

The current GitHub default branch for `JuanQuenga/brawlstats.io` only contains `README.md`, so the closest available source for the actual site is the archived local working tree.

Source material found on this machine:

- `/Users/juanquenga/iCloud Drive (Archive)/Documents/GitHub/brawlstats.io`
- `/Users/juanquenga/iCloud Drive (Archive)/Documents/old/brawlstats`
- iCloud mirror: `/Users/juanquenga/Library/Mobile Documents/com~apple~CloudDocs/Documents/GitHub/brawlstats.io`

This demo intentionally uses local static data and copied assets. It does not call the old `harmiox.com:3000` API or require PHP.

The root page now also uses current Brawl Stars art from the GitHub-backed Brawlify CDN. See `ASSET_SOURCES.md` for source URLs, folder patterns, and the mock-data boundary.

Static route mapping:

- `/` mirrors `index.php`
- `/players/` mirrors `players/index.php`
- `/bands/` mirrors `bands/index.php`
- `/leaderboards/` mirrors `leaderboards/index.php`
