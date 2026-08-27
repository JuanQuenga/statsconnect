# Vendored Clash Royale Images

The sync manifest is pinned to RoyaleAPI/cr-api-assets commit
`b4530a1043b213ee2baf9c50a3d0d7fae22c2313`. The clan-badge id mapping and arena
metadata come from the `master` branch of
[RoyaleAPI/cr-api-data](https://github.com/RoyaleAPI/cr-api-data) (`docs/json`).

These assets are vendored under the [Supercell Fan Content Policy](https://supercell.com/en/fan-content-policy/).
They are for this fan project only and must not be hotlinked as a CDN.

`art/hero-ranked-legends-2026.png` is user-supplied official promotional art
used by the leaderboard hero.

`icons/home-crown-v2.webp`, `cards/unknown-v2.webp`, and
`clan-badges/no-clan-v2.webp` are original generated support artwork used for
small navigation and missing-data states. They do not replace identifiable
Supercell character, card, arena, badge, or promotional artwork.

`../apple-touch-icon-blue.png` is a deterministic derivative of the official
`../apple-touch-icon.png`: the near-black RGB matte is made transparent and
only purple crown pixels are remapped to the established Clash blue while
gold and white shading is preserved. It is used only in the shared game nav.

To refresh the pinned asset set, review the SHA in `scripts/sync-assets.mjs`,
then run:

```sh
node scripts/sync-assets.mjs
```

The script is dependency-free, validates PNG magic bytes, and reports added,
updated, and unchanged files by category.
