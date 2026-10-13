# Scene rules

Every scene is one HTML file in `scenes/`, rendered frame by frame at 1080×1920, 60 fps. Read `STORYBOARD.md` for your shot, and read these rules before you write code.

## Contract

```html
<!doctype html>
<html><head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="../lib/stage.css">
  <script src="../lib/stage.js"></script>
  <style>/* scene styles */</style>
</head><body>
  <div id="stage"><!-- elements --></div>
  <script>
    window.SCENE = {
      beats: 8,
      sfx: [ { beat: 0, name: "slam", gain: 0.8 }, { beat: 2.5, name: "pop" } ],
    };
    const { BEAT, beats, range, ease, pop, hit, shake, count, fmt, lerp, clamp, rng } = Stage;
    window.seek = (t) => { /* set every animated style from t (seconds since the scene started) */ };
  </script>
</body></html>
```

- `seek(t)` must be a **pure function of t**. The renderer calls it in order, but it must also work when it jumps to any t. Set every animated property every call.
- **Banned:** CSS `animation`/`transition`, `requestAnimationFrame`, `setTimeout`, `Date`, `performance.now()`, `Math.random()` (use `Stage.rng(seed)`), video, web audio, and network URLs. Only use files in `../assets/`.
- Animate with `transform`/`translate`/`scale`/`rotate`, `opacity`, `filter`, or text content. Keep it cheap. No huge blur filters on full-screen layers.
- **Timing is in beats.** `BEAT = 0.4644 s` (129.2 BPM). Beat k starts at `t = beats(k)`. Big moments land exactly on a beat, and secondary ones on half beats. The cut to your scene lands on a strong downbeat, so **frame t=0 must already look strong.** No fade from black, no empty frame. Something should be mid-slam at t=0.
- The last half beat (beats 7.5–8) can push into an exit (zoom punch, whip, flash), but don't fade to black. The next scene hard-cuts in.

## Look: game-native, never generic SaaS

Use the brawlstats / Clash Royale visual language: bold, loud, and playful.
- **Type:** `.brawl-type` (TotalBlack, uppercase, thick ink outline + hard drop shadow) for Brawl and hub shots, and `.clash-type` (Supercell Magic) for Clash shots. Headlines are HUGE (120–260 px). Keep body text to a minimum. This is a phone video, so nothing smaller than 40 px except the legal line.
- **Shapes:** thick ink outlines (6–10 px `var(--ink)`), hard ink drop shadows (`0 14px 0 var(--ink)`), chunky gold buttons (`.btn-gold`), and panels (`.panel`, `.paper`). Character art should bleed out of panels.
- **Palette:** `--navy`, `--panel`, `--gold`, `--cyan`, `--red`, `--green`, `--ink`. Brawl shots lean deep blue + yellow, and Clash shots lean royal blue + gold with light paper panels.
- **Motion:** snappy. Use overshoot pops (`pop`), impact pulses (`hit`) for scale kicks, flashes, and camera shake. Keep a slow drift or push-in on backgrounds so the frame is never static. Stagger groups on half beats.
- **Keep the frame full.** Safe area: keep all text inside x 60–1020 and y 160–1760 (phone UI covers the edges).

## Sound

Put sound cues in `SCENE.sfx` as `{ beat, name, gain }` (gain 0–1, default 0.6). Available names:
`slam` (metal impact), `punch` (heavy hit), `thud` (soft hit), `bell` (big ring, for the logo), `pop` (item appears), `click`, `tick`, `key` (keyboard), `select`, `confirm` (success chime), `powerup`, `rise` (sweep up), `sparkle`, `whoosh`.
Cue every visible impact. Don't stack more than 3 sounds on one instant. Keep `tick`/`key` gains low (0.3–0.45). Music is already mixed underneath.

## Assets (`../assets/`)

- `img/`: `statsconnect-mark.png` (hex logo, 512²), `cosmo-bust.png` (Brawl-style robot, transparent, 512²), `ronin-bust.png` (Clash-style ronin, transparent, 512²), `hub-worlds-2026-mobile.webp` (1086×1448, Clash dragon + Brawl robot key art), `hub-worlds-2026-wide.webp` (1942×809), `brawl-stars-2026-feature.webp` (1536×1024, robot in space observatory), `clash-royale-2026-feature.webp` (1536×1024, dragon smashing castle), `trophy.png` (gold trophy, transparent), `chest-legendary.png`, `hog-rider.png`, `giant.png`, `prince.png`, `the-bowler.png` (Clash character cutouts).
- `brawlers/*.png`: 12 Brawl Stars portraits (800×668, square-ish with dark outline). Files: 16000000 Shelly, 16000001 Colt, 16000002 Bull, 16000003 Brock, 16000004 Rico, 16000005 Spike, 16000007 Jessie, 16000008 Nita, 16000010 El Primo, 16000011 Mortis, 16000012 Crow, 16000023 Leon.
- `cards/*.png`: Clash Royale card art, 150×180 with frame: hog-rider, musketeer, fireball, the-log, ice-spirit, skeletons, cannon, valkyrie.

Players and numbers are fictional. Never show real player names.

## Check your work

From `tools/promo-video/`:
- `node render.mjs --scene NN --contact --fps 30` writes `out/NN-*-contact.png` (one tile per half beat, labeled). **Open it with Read and look at it.** Fix anything that's clipped, unreadable, empty, overlapping wrongly, or off-brand. Repeat until it's good. Do at least 2 look-and-fix rounds.
- `node render.mjs --scene NN --fps 30` renders a preview MP4 with audio. Use it to check for runtime errors (they print as ⚠).
- Only edit your own scene file. Don't edit `lib/`, `render.mjs`, or other scenes.
