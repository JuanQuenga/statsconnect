# StatsConnect promo video

A vertical (1080×1920, 60 fps) promo built from code. Each shot in `scenes/` is an HTML page with a deterministic `seek(t)`. `render.mjs` screenshots every frame in headless Chromium and mixes the music and per-scene SFX cues with ffmpeg.

```sh
pnpm install --ignore-workspace   # Playwright only; not part of the pnpm workspace
node render.mjs                   # → out/statsconnect-promo.mp4
node render.mjs --scene 03 --contact --fps 30   # contact sheet for one shot
```

Requires `ffmpeg` on PATH. `STORYBOARD.md` describes the shots, and `RULES.md` is the scene contract.

## Credits

- Music: "High-Energy Adventure Theme" (intro), CC0, via [OpenGameArt](https://opengameart.org/content/high-energy-adventure-theme).
- Sound effects: Kenney Impact Sounds, Interface Sounds, UI Audio, and Digital Audio, CC0, via [kenney.nl](https://kenney.nl). `whoosh.ogg` is filtered noise generated with sox.
- Game art: Brawl Stars and Clash Royale assets belong to Supercell and are used under [Supercell's Fan Content Policy](https://supercell.com/en/fan-content-policy/).
