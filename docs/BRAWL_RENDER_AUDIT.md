# Brawl Stars headless render audit

The diagnostic script `apps/brawlstats/scripts/audit-brawl-render.mjs` renders the repository's real `BrawlerViewerRuntime`. It bundles the runtime, `catalogEntryToViewerManifest`, `catalogAnimationOptions`, and the outline composite with esbuild. It uses the same lights, 20° perspective camera, near/far planes, authored camera scale clamp, sampled framing bounds, and centering as a manually selected animation in `BrawlerModelViewer.tsx`.

## Setup and run

Run from the repository root with installed app dependencies and Node 22 or newer. Install audit dependencies outside the repository:

```bash
mkdir -p /tmp/brawl-audit/render/toolchain
npm install --prefix /tmp/brawl-audit/render/toolchain --no-audit --no-fund \
  playwright@1.63.0 pngjs@7.0.0 esbuild@0.27.0
npx --yes playwright@1.63.0 install chromium
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

Flicker includes normal texture edges within the model and is a candidate ranking, not proof of z-fighting. Legitimately white skins/eyes can exceed the white threshold. Silhouette/luma similarity can identify static poses and visually indistinguishable motions, and can miss identical underlying clips whose duration/window/framing/face treatment differs. Inspect contact sheets before treating duplicates as confirmed content identity. Perceptual face differences include pose, lighting, outline, camera, crop and sampling differences; they do not isolate UV errors.

Missing texture diagnostics detect a referenced material texture whose image failed to load; HTTP/GLTF/face-loader failures and browser exceptions are also recorded. A deliberately untextured material is not automatically considered a missing texture. Zero visible meshes and empty alpha silhouettes are recorded independently.

## Reference policy and adapter

Every flagged skin plus a stable pseudorandom 10% Bernoulli sample is selected for reference capture. All post-dedupe options of those skins are compared. Failed local options receive reference attempts too. The initial URL hash is the source animation label with spaces removed. Subsequent selections invoke the reference page's existing animation loader. The adapter seeks its mixer and calls its face controller's `goToFrame(round(time × 30))`, with RAF disabled. It uses the local camera's FOV/distance/near/far, removes the reference view offset and author scale, and centers the current reference pose. This matches framing approximately; runtime framing samples the whole animation.

All reference HTML, JS, textures, shaders and GLBs are cached. Original bytes stay unchanged in the cache; a browser response copy of the cached viewer module exposes deterministic controls. The adapter checks the known minified lexical API and fails explicitly if that version changes. Cloudflare's Rocket Loader module types are restored in the response copy. Analytics requests are blocked. Reference/CDN requests are globally serialized per process, spaced at least 300 ms apart, follow redirects, honor `Retry-After` on 429/503, and have a finite retry budget. The CDN receives its normal reference-page `Referer`/`Origin` headers. Cached pages are never fetched again.

This audit does not change viewer code, publish images, deploy services, or update the asset catalog.
