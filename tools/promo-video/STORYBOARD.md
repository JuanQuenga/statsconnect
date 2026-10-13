# StatsConnect promo storyboard

Vertical 1080×1920, about 23 s, for X / TikTok / Reels. StatsConnect is one hub for Brawl Stars and Clash Royale stats. Enter a player tag, see the full profile, and share the win rate with your club or clan. Sites: `statsconnect.app`, `bs.statsconnect.app` (Brawl), and `cr.statsconnect.app` (Clash).

Each scene is 8 beats (3.715 s) and hard-cuts to the next on a downbeat. The music has a big hit on every beat 0.

Fictional players: Brawl **NOVA** `#2PP8Q0LY`, Clash **KingRonin** `#9QJ2LG0C`.

---

## 01-hook: "TWO GAMES. ONE HUB."
- Background: `hub-worlds-2026-mobile.webp` covers the frame, with a slow push-in (scale 1.08→1.18 across the scene) and a dark navy gradient at top and bottom so the text pops.
- b0: **TWO GAMES.** slams in at top-third, gold, ~220 px (scale 2.6→1 with overshoot, screen shake, white flash pulse). It's mid-slam at t=0.
- b2: `cosmo-bust.png` punches up from bottom-left and `ronin-bust.png` from bottom-right (~520 px each, ink drop shadow, slight rotation).
- b4: **ONE HUB.** slams in below, cyan, same size, with a shake.
- b6: `statsconnect-mark.png` pops in center (~260 px) with a burst of 12 gold rays/sparks radiating out.
- b7.5: everything scales up fast toward camera with a white flash (exit punch).
- SFX: slam b0, punch b2, punch b2.5, slam b4, pop b6, sparkle b6.25, whoosh b7.5.

## 02-search: "DROP YOUR TAG"
- Background: navy with big diagonal stripes in `--panel` color scrolling slowly, plus soft cyan glow.
- b0: header **DROP YOUR TAG** slams in at top (brawl-type, white with gold "TAG").
- b0: big `.panel` (≈940 px wide) sits mid-screen. Inside it is a white tag input field (ink border, ~150 px tall). The `#` is grey, and the typed text is ink TotalBlack ~96 px with a blinking caret. Make the caret blink deterministic from t.
- b1 → b5: types `2PP8Q0LY` one character per half beat (8 characters). Each keystroke gives the field a tiny scale kick.
- b5.5: chunky gold **GO** button below the field, ~600×200, pops in.
- b6: the button presses (translateY 14 px, shadow collapses) with a shockwave ring and gold particle burst. A "PLAYER FOUND!" green chip pops above the panel at b6.5.
- b7.5: panel zooms toward camera with a flash (exit).
- SFX: whoosh b0, key on every keystroke (gain 0.4), pop b5.5, punch b6, confirm b6.5, whoosh b7.5.

## 03-brawl: Brawl Stars profile
- Background: `brawl-stars-2026-feature.webp` cropped to cover the frame (robot visible near top), darkened about 45% with a navy gradient. Slow drift.
- Top chip: **BRAWL STARS** in a yellow pill with ink outline, plus `bs.statsconnect.app` small under it.
- b0: profile `.panel` slams in from below (≈960 wide). Header **NOVA** (brawl-type ~130 px) and tag `#2PP8Q0LY` in a dark pill.
- b0.5 → b3: `trophy.png` (~180 px) next to a trophy count rolling 0 → **52,318** (brawl-type gold ~150 px). Kick on landing at b3.
- b3 → b6: 3×3 grid of brawler portraits pops in one per half beat (use 9 of the 12, each tile ~250 px in an ink-bordered rounded frame with a little rank badge number). Stagger pops.
- b6: big red/gold stamp **64% WIN RATE** slams diagonally across the lower part of the panel (rotate −8°, scale 2→1, shake).
- b7.5: whip exit (fast x translate + motion blur via skew).
- SFX: slam b0, rise b0.5, thud b3, pop on each portrait (gain 0.45), slam b6, whoosh b7.5.

## 04-clash: Clash Royale profile
- Clash look: royal blue + gold, `.clash-type` Supercell font, light `.paper` panels.
- Background: `clash-royale-2026-feature.webp` cover-cropped (dragon visible), darkened about 35% with a royal-blue gradient. Slow push.
- Top chip: **CLASH ROYALE** in a gold pill, plus `cr.statsconnect.app`.
- b0: paper panel slams in. **KingRonin** header (clash-type ~110 px) with tag pill. `ronin-bust.png` (~380 px) peeks out over the top-right corner of the panel, bleeding outside it.
- b0.5 → b4: current deck. 8 cards (all files in `cards/`) in a 4×2 grid, each ~200 px wide, flip in one per half beat (rotateY 90→0 with overshoot pop). Use `perspective` on the parent.
- b4.5: trophy row with `trophy.png` plus a count rolling to **9,000**, plus "ARENA: LEGENDARY" label.
- b6: stamp **412 THREE-CROWN WINS** slams (gold, rotated, shake). `chest-legendary.png` pops beside it.
- b7.5: exit punch (zoom + flash).
- SFX: slam b0, pop on each card flip (gain 0.4), rise b4.5, slam b6, sparkle b6.25, whoosh b7.5.

## 05-share: "SHARE THE FLEX"
- Background: navy with a big rotating sunburst of alternating `--panel`/`--panel-top` rays from center (slow rotation), plus vignette.
- b0: share card slides up from below with overshoot (portrait card ≈760×1000, `.panel` style, slight −4° tilt). Card content: small StatsConnect mark + "NOVA" + huge **64%** (brawl-type gold ~300 px) + **WIN RATE** under it + a row of 3 brawler portraits + bottom strip "Make your own → statsconnect.app".
- b2, b2.5, b3: three chat bubbles pop in around the card (white `.paper` bubbles with ink tails), text in ink ~48 px: "gg 🔥" (no emoji; use "gg!!"), "how is that 64%??", "send me the link".
- b4: three copies/mini-cards fly from the card to three chips at the bottom: **CLUB**, **CLAN**, **SQUAD** (gold chips that pop when the card lands, b4.5/b5/b5.5).
- b6: headline **SHARE THE FLEX.** slams at top (brawl-type ~170 px, white with gold "FLEX").
- b7.5: exit flash.
- SFX: whoosh b0, thud b0.5, pop b2/b2.5/b3 (gain 0.45), whoosh b4, select b4.5/b5/b5.5, slam b6, whoosh b7.5.

## 06-end: end card (10 beats)
- `SCENE.beats = 10`. The music fades out over the last 1.6 s (the renderer handles it).
- Background: `hub-worlds-2026-mobile.webp` darkened about 60% with a slow pan, plus a big soft gold radial glow behind the logo.
- b0: `statsconnect-mark.png` (~420 px) slams center-top with a ring shockwave + 16 gold sparks + screen shake.
- b1: **STATSCONNECT** wordmark (brawl-type ~140 px, white, with "CONNECT" in gold) pops under the logo.
- b2: two door buttons pop side by side (≈460×170 each, ink border, hard shadow):
  - Left, blue gradient: **BRAWL STARS** in brawl-type, with `cosmo-bust.png` (≈200 px) bleeding out the top.
  - Right, gold gradient: **Clash Royale** in clash-type, with `ronin-bust.png` bleeding out the top.
- b4: big `.btn-gold` with **statsconnect.app** (~84 px TotalBlack, ink text) pops at the lower third, then gently pulses (scale 1↔1.04 on each beat).
- b5 onward: hold, with background drift and button pulse. Sparkles twinkle (deterministic).
- Always visible (bottom, baseline around y≈1720, 28 px, white 75% opacity, centered, max width 900, no outline): "This material is unofficial and is not endorsed by Supercell. For more information see Supercell's Fan Content Policy."
- SFX: slam b0, bell b0 (gain 0.7), pop b1, punch b2, punch b2.5, confirm b4, sparkle b6.
