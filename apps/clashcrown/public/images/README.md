# Vendored Clash Royale Images

The sync manifest is pinned to RoyaleAPI/cr-api-assets commit
`b4530a1043b213ee2baf9c50a3d0d7fae22c2313`. The clan-badge id mapping and arena
metadata come from the `master` branch of
[RoyaleAPI/cr-api-data](https://github.com/RoyaleAPI/cr-api-data) (`docs/json`).

These assets are vendored under the [Supercell Fan Content Policy](https://supercell.com/en/fan-content-policy/).
They are for this fan project only and must not be hotlinked as a CDN.

`art/hero-ranked-legends-2026.png` is user-supplied official promotional art
used by the leaderboard hero.

To refresh the pinned asset set, review the SHA in `scripts/sync-assets.mjs`,
then run:

```sh
node scripts/sync-assets.mjs
```

The script is dependency-free, validates PNG magic bytes, and reports added,
updated, and unchanged files by category.
