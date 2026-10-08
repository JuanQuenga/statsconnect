# Brawl Stars headless render audit

The diagnostic script `apps/brawlstats/scripts/audit-brawl-render.mjs` renders the repository's real `BrawlerViewerRuntime`. It bundles the runtime, `catalogEntryToViewerManifest`, `catalogAnimationOptions`, and the outline composite with esbuild. It uses the same lights, 20° perspective camera, near/far planes, authored camera scale clamp, sampled framing bounds, and centering as a manually selected animation in `BrawlerModelViewer.tsx`.

## Setup and run

Run from the repository root with installed app dependencies and Node 22 or newer. Install audit dependencies outside the repository:

```bash
mkdir -p /tmp/brawl-audit/render/toolchain
pnpm --dir /tmp/brawl-audit/render/toolchain add \
  playwright@1.63.0 pngjs@7.0.0 esbuild@0.27.0
pnpm --dir /tmp/brawl-audit/render/toolchain exec playwright install chromium
node --test apps/brawlstats/scripts/audit-brawl-render.test.mjs
node apps/brawlstats/scripts/audit-brawl-render.mjs --smoke
```

On Fedora Asahi ARM64, Playwright's Ubuntu ARM64 headless shell works with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`. The script supplies these flags. Its three.js smoke render must contain a nonempty green box and writes `webgl-smoke.png` and `webgl-smoke.json`, including the actual GPU renderer string.

`/tmp` may be RAM-backed. For the full catalog, point `/tmp/brawl-audit/render` at an adequately sized disk directory with a symlink **before** downloading the cache. All logical audit paths stay under `/tmp/brawl-audit/render`; this machine uses `/var/tmp/brawl-audit-render` for the backing directory. Cache size can reach several GB. Do not put generated files inside the repository.

```bash
# All skins, both phases, survives shell disconnects. Resume on restart.
nohup setsid node apps/brawlstats/scripts/audit-brawl-render.mjs --resume \
  > /tmp/brawl-audit/render/run.log 2>&1 < /dev/null &
echo $! > /tmp/brawl-audit/render/run.pid

# Small local diagnosis; isolated output avoids contaminating the full report.
node apps/brawlstats/scripts/audit-brawl-render.mjs \
  --skins BanditGirlDefault,BanditGirlPrereg --out /tmp/brawl-audit/render/probe

# One-based, stable partition of sorted skin IDs; limit counts skins.
node apps/brawlstats/scripts/audit-brawl-render.mjs --shard 1/4 --limit 10 --resume

# Run phases separately, or regenerate the report from existing results.
node apps/brawlstats/scripts/audit-brawl-render.mjs --phase render --resume
node apps/brawlstats/scripts/audit-brawl-render.mjs --phase reference --resume
node apps/brawlstats/scripts/audit-brawl-render.mjs --report-only
```

Other options: `--retry-reference-failures` (reattempt failed comparisons using cached assets), `--toolchain DIR`, `--seed VALUE` (stable random reference selection), and `--reference-all` (force reference comparisons for an explicitly chosen diagnostic subset). Use the same output, shard and seed when resuming. A saved catalog snapshot pins skin records and shard hashes across runs. Production redirects are followed; catalog shard/asset paths resolve against the **app URL**, since the asset worker uses a different path prefix.

Each invocation uses one browser and one reused page, with DPR 1 and a 512×512 canvas. The runtime is disposed after each skin. The two phases run sequentially. Do not run two processes against the same shard output simultaneously. Shards have separate JSONL/state files but share the disk cache. Run reference phases serially across shards to preserve global request spacing.

## Deterministic capture

`window.audit.renderFrame({skinId, animationKey, time})` returns an object containing a 512×512 PNG data URL, measurements, a thumbnail, and a 128×128 face PNG. `loadSkin(entry)` loads the parsed production entry and `selectAnimation(key)` loads the animation. Time is seconds from the start of the selected animation window. Body/face/effects advance through public `runtime.update()` with 1/60-second steps plus a final fractional step; no animation uses a wall clock or RAF. Selecting an animation resets its clock. Eight samples cover `[0, duration)` at `i × duration / 8`; excluding the endpoint prevents capturing a wrapped first pose twice. Duration metadata reads the runtime's TypeScript-private duration field without altering it. Clipless options use eight samples of the static pose.

## Reading results

`results-i-n.jsonl` is append-only. Record kinds:

- `frame`: skin ID, animation key, time/index, silhouette bounds and pixel counts, flicker/white ratios, mesh/texture diagnostics, runtime state, SHA-256 pose hash, base64-encoded 32×32 coverage/luma descriptor, face path, contact-sheet path.
- `option`: duration, sampling times, camera framing, label, and all eight frame measurements.
- `skin`: completed skin, duplicate pairs, flag status, exceptions and elapsed time.
- `reference`: eight reference crops with per-frame differences, mean difference, source URL and side-by-side contact sheet.
- `failure`: load, render, exception or reference error and diagnostic contact-sheet path. Empty sheets mark failures before a usable render.

`state-i-n.json` tracks progress and configuration. A skin row is the completion boundary: interruption during a skin retries it. Reports list unresolved failures separately from raw failure attempts; a successful reference retry replaces the earlier failed comparison. Reports use the latest frame per `(skin, animation, index)` and latest option/skin rows. An interrupted final JSONL line is preserved and ignored with a warning. `REPORT.md` and `totals.json` regenerate during the sweep and at completion. A phase marked complete means that invocation finished its selection; check report totals against the catalog count to establish full coverage.

The local contact sheet has eight chronological columns: full-model thumbnails in row 1, face crops in row 2, and jittered model thumbnails in row 3. Reference sheets alternate local and reference crops, four time pairs per row. The face crop is the **top 35% of each silhouette bounding box**, scaled to 128×128; weapons, hats, pets and upside-down poses may make this an imperfect head locator.

Metrics and default flag thresholds:

| Metric | Definition | Flag |
| --- | --- | --- |
| Flicker | At an unchanged time, rotate the camera 0.05° about world Y. Count pixels with an absolute RGB channel change >64 within the intersection of both silhouettes, eroded one pixel. Divide by eligible interior pixels. | >0.01 |
| Pure white | Exact RGB `(255,255,255)` pixels with silhouette alpha >127, divided by all silhouette pixels. | >0.02 |
| Pose | Downsample the fixed canvas to 32×32; each cell stores mean binary alpha coverage and alpha-masked Rec.709 luma. SHA-256 hashes the 2,048 descriptor bytes. | Duplicate mean absolute byte difference ≤0.008, every frame ≤0.016 |
| Face difference | Mean absolute difference of the local/reference crop's 32×32 coverage/luma descriptors, normalized by 255. Average over eight matching times. | >0.15 |

The report includes the changed/interior or white/silhouette pixel counts alongside ratios. Very small visible models can create high ratios from a handful of changed pixels and low pose distances simply because most of the canvas is empty. Flicker includes normal texture edges within the model and is a candidate ranking, not proof of z-fighting. Legitimately white skins/eyes can exceed the white threshold. Silhouette/luma similarity can identify static poses and visually indistinguishable motions, and can miss identical underlying clips whose duration/window/framing/face treatment differs. Inspect contact sheets before treating duplicates as confirmed content identity. Perceptual face differences include pose, lighting, outline, camera, crop and sampling differences; they do not isolate UV errors.

Missing texture diagnostics detect a referenced material texture whose image failed to load; HTTP/GLTF/face-loader failures and browser exceptions are also recorded. A deliberately untextured material is not automatically considered a missing texture. Zero visible meshes and empty alpha silhouettes are recorded independently.

## Reference policy and adapter

Every flagged skin plus a stable pseudorandom 10% Bernoulli sample is selected for reference capture. All post-dedupe options of those skins are compared. Failed local options receive reference attempts too. The initial URL hash is the source animation label with spaces removed. Subsequent selections invoke the reference page's existing animation loader. The adapter seeks its mixer and calls its face controller's `goToFrame(round(time × 30))`, with RAF disabled. It uses the local camera's FOV/distance/near/far, removes the reference view offset and author scale, and centers the current reference pose. This matches framing approximately; runtime framing samples the whole animation.

All reference HTML, JS, textures, shaders and GLBs are cached. Original bytes stay unchanged in the cache; a browser response copy of the cached viewer module exposes deterministic controls. The adapter checks the known minified lexical API and fails explicitly if that version changes. Cloudflare's Rocket Loader module types are restored in the response copy. Analytics requests are blocked. Reference/CDN requests are globally serialized per process, spaced at least 500 ms apart, follow redirects, honor `Retry-After` on 429/503, and have a finite retry budget. The CDN receives its normal reference-page `Referer`/`Origin` headers. Cached pages are never fetched again.

This audit does not change viewer code, publish images, deploy services, or update the asset catalog.

## Face audit, round 2

`--phase faces` audits every entry with an exported Idle, Happy/Win or Hero Screen animation and a ready face atlas plus binary. It bypasses menu deduplication so Hero Screen is still tested. The 2026-10-08 snapshot contains 1,026 eligible skins and 2,152 eligible options. Eight times are sampled per option.

The face path renders at 1024×1024 with DPR 1. It projects current skinned vertices from an explicitly named face/stencil mesh, otherwise vertices with at least 35% weight on the main head, upper/lower head, skull or face bones. It respects indexed draw ranges. It excludes eyebrow names from the face-mesh match and excludes accessory heads such as Gus's balloon dog. An unlocated face is recorded as such, with a full PNG, rather than estimated from the silhouette. Per frame, a camera view offset and zoom place the head near the center and enlarge its projected width to 320 pixels, capped at 12× zoom. This produces a 256×256 crop with useful eye detail even in animations whose overall framing bounds are large. Both viewers use this same procedure and the same body camera distance, direction, field of view and clipping planes. If shared reference geometry makes its head bounds entirely offscreen, the reference camera is recentered on the actual head bone at the same distance and direction. Bounds and localization sources are retained in JSONL.

Metrics retain full-crop luma SSIM and Sobel edge IoU. The flag decision focuses on the eye band, x = 17.5–82.5% and y = 40–75% of the head crop, resampled to 128×128. Alignment searches reference translation ±8 pixels in four-pixel steps and scales 0.94, 1 and 1.06, maximizing eye-band SSIM. The eye-band SSIM uses 16×16 windows and the full-crop metric uses 8×8 windows. The dark-stroke score measures positive dark Laplacian energy weighted by darkness. It compares local/reference energy and retains both values, the ratio and the absolute delta. Transparent pixels are composited onto neutral gray for luma calculations.

A frame is a review candidate when eye SSIM < 0.72 **and** eye Sobel IoU < 0.56, or when stroke-noise ratio > 1.65 **and** delta > 0.008. These are triage thresholds, not proof of a defect. Adjacent local crops also receive a temporal warning when `1 - SSIM > 0.24` while the full-body descriptor distance, excluding the projected head and normalized by mean body coverage, is < 0.025. Intentional expressions, head turns, occlusion and coarse eight-time sampling require visual review of temporal warnings.

Calibration at HEAD `f8d7cd102d54059716785e11c44c6ee74e884311`:

| Skin and animation | Eye SSIM | Eye edge IoU | Flagged samples |
| --- | --- | --- | --- |
| GeishaDefault HappyAnim | 0.662–0.906 | 0.467–0.665 | 7, visibly wrong expression |
| GeishaDefault HeroScreenAnim | 0.680–0.898 | 0.477–0.563 | 0, 2, 7; broken eye triangles |
| GeishaDefault IdleAnim | 0.995–0.996 | 0.966–0.972 | none |
| SoulCollectorDefault IdleAnim, brawler 16000061 | 0.735–0.750 | 0.438–0.469 | none |

Gus's Win/Hero poses also produce candidates; the good-control claim applies specifically to Idle. The calibration sample is small. Full-head SSIM alone failed this control because hair highlights and framing differences dominated the face comparison. Calibration images, measured values and frozen source hashes are under `/tmp/brawl-audit/faces/calibration-v4/`, `calibration.json` and `face-harness.js.json`.

Use the existing outside-repository toolchain. On this Mac use `AUDIT_ANGLE=metal`; the recorded renderer must identify Apple M2. Run four local shards, then one reference worker. Each local invocation uses its own JSONL file. A cached bundle pins the tested runtime, and its adjacent JSON records git HEAD, source hashes and bundle hash. Prepare that bundle with the calibration invocation before starting concurrent workers.

```bash
AUDIT_ANGLE=metal node apps/brawlstats/scripts/audit-brawl-render.mjs \
  --phase faces --skins GeishaDefault,SoulCollectorDefault \
  --out /tmp/brawl-audit/faces/calibration \
  --harness-cache /tmp/brawl-audit/faces/face-harness.js \
  --toolchain /tmp/brawl-audit/render/toolchain

# Run this command once for each shard, 1/4 through 4/4, concurrently.
AUDIT_ANGLE=metal node apps/brawlstats/scripts/audit-brawl-render.mjs \
  --phase faces --faces-stage local --shard 1/4 --resume \
  --out /tmp/brawl-audit/faces --harness-cache /tmp/brawl-audit/faces/face-harness.js \
  --toolchain /tmp/brawl-audit/render/toolchain \
  --cache-roots /tmp/brawl-audit/render/sweep-1/cache/http

# Serial reference capture reads all completed local shard records.
AUDIT_ANGLE=metal node apps/brawlstats/scripts/audit-brawl-render.mjs \
  --phase faces --faces-stage reference --resume \
  --out /tmp/brawl-audit/faces --harness-cache /tmp/brawl-audit/faces/face-harness.js \
  --toolchain /tmp/brawl-audit/render/toolchain \
  --cache-roots /tmp/brawl-audit/render/sweep-1/cache/http

node apps/brawlstats/scripts/audit-brawl-render.mjs \
  --phase faces --faces-stage report --out /tmp/brawl-audit/faces
```

`--cache-roots` accepts comma-separated existing HTTP cache directories. Cached pages and assets are read without refetching. Network misses to the reference host/CDN are serialized, spaced at least 500 ms apart and honor Retry-After. A machine-wide `/tmp/brawl-audit/faces-reference.lock` rejects a second face-reference process, even with a different output directory. Other reference tools must also be kept serial by the operator. A crashed worker can leave a lock; verify its recorded PID is dead before removing it.

The reference viewer calls the Hero Screen entry “Win Anim”. Face-reference records retain `referenceLabel` so that mapping is visible. Times always come from the local animation window and are passed unchanged to the reference adapter. Each animation is selected and reset before applying framing.

`faces-i-n.jsonl` contains `face-local`, `face-reference` and `face-failure` records. Local records include times, both projected/capture bounds, face state and temporal warnings. Reference records include every metric, alignment, crop paths and a comparison sheet, with alternating local/reference images. `face-totals.json` and `flagged.json` are regenerated from the latest successful record per skin/animation. `pendingReference`, explicit failures and unlocated crops must be accounted for before claiming full paired coverage. `FACES.md` is the visual-review report, not an automatic conversion of flags into confirmed defects.

The locator recognizes head-bone naming variants, prioritizes the rider head over a mech head, and respects indexed draw ranges. A material called `face` can cover a whole body primitive, so its name is used only when no head bone exists. Headless rigs fall back to projecting mesh triangles whose stencil UVs overlap the face render target's alpha footprint. Empty stencils are recorded as unlocated; they are not automatically called missing faces. Framing and occlusion still require review.

For a selected recapture, supply `--skins` without `--resume`; reference records for those skins are appended again and the latest successful record wins. Use `--resume --retry-local` to rerender selected local skins. Keep the same frozen harness when auditing a changing checkout. This sweep also used `face-harness-locator-v2.js` and `face-harness-framing.js`, which extend the original frozen bundle with audit localization helpers only. Their adjacent metadata records the parent bundle hash and original runtime sources.

Completed sweep at the frozen HEAD above: 1,026 skins / 2,152 local options / 17,216 samples; 1,013 skins / 2,124 reference options / 16,992 samples. All 2,152 reference options were attempted. Twenty-eight options across 13 skins remained unavailable (404, reference startup failures or timeout); two local and 66 reference samples were unlocated. These are explicit coverage gaps.

All 3,156 current flagged pairs and 93 temporal candidate options were opened as PNG sheets and visually reviewed. Confirmed symptoms affect 100 distinct skins, 118 options and 257 sampled frames: garbled faces in 40 skins, wrong expressions in 70 skins, missing features in five skins (categories overlap). No independent offset/scaled-eye or flicker class was confirmed. The complete report, five crop-linked examples per populated category, false-positive counts and unavailable-option list are in `/tmp/brawl-audit/faces/FACES.md`; all confirmed sampled evidence is in `confirmed.json`. Thirteen targeted tests pass. No commit, push or deployment was performed.
