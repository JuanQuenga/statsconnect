# Brawl motion audit

`audit-brawl-motion.mjs` compares the app's deduped animation options with mv.brawlstars.top. It imports the render harness's helpers and reuses its browser factories through a temporary adapter, without editing the harness or viewer libraries.

```sh
node --test apps/brawlstats/scripts/audit-brawl-motion.test.mjs
# Toolchain, if missing:
mkdir -p /tmp/brawl-audit/render/toolchain
(cd /tmp/brawl-audit/render/toolchain && ~/.local/bin/pnpm add \
  playwright@1.63.0 pngjs@7.0.0 esbuild@0.27.0)
# A fresh output is required when capture sources change.
mkdir -p /tmp/brawl-audit/motion/sweep-new
tmux new-session -d -s brawl-motion-sweep \
  'node apps/brawlstats/scripts/audit-brawl-motion.mjs --out /tmp/brawl-audit/motion/sweep-new --resume > /tmp/brawl-audit/motion/sweep-new/run.log 2>&1'
node apps/brawlstats/scripts/audit-brawl-motion.mjs \
  --out /tmp/brawl-audit/motion/sweep-new --report-only
```

Only one process may capture the reference on this machine. A process lock, serial requests at least 500 ms apart, Retry-After handling and cached pages/assets enforce the motion workstream's request policy. Outputs and compressed caches stay outside the repository. `--resume` retries failures and rejects changed sources, selection, catalog or dimensions. The catalog snapshot freezes once per output; the shared render cache is reused.

Selection includes every skin with non-30 FPS, a window over 300 frames or HeroScreen/HeroScreenLoop, plus a stable seeded 15% Bernoulli sample. `--skins GeishaDefault,BanditGirlDefault,BullGuyDefault,CactusDefault` selects calibration controls; `--limit` supports a pilot.

Each comparable option samples sixteen normalized times in both viewers with fixed, matched initial framing. Finite geometry, collapsed-triangle exclusion and rendered silhouette checks handle invalid bounds or tiny bodies. One joint sequence crop preserves translation and produces coverage+luma 32×32 descriptors. Full sheets alternate local/reference rows for frames 0–7, then 8–15.

Results include mean/max difference, loop periods, asymmetric static transitions, and alignment over 0.25×–4× physical speed and 64 phases: `reference seconds = local seconds * scale + phaseSeconds`. Flagged options also get equal-elapsed-time reference samples. Candidates exceed mean 0.04 or max 0.12; duration differences exceed both 5% and 0.1 seconds. Static candidates require three transitions below 0.0005 while the other viewer exceeds 0.003. Sparse interpolation can alias repeated clips, so visually review candidates before diagnosing speed or clip errors.

Missing reference options/empty exports have null metrics and retained local frames. Initialization failures retain local samples and remain retryable. Neither is a pass. `results.jsonl` uses the latest terminal row per option; state, selection, totals, FLAGS.md, sheets and compressed descriptors retain provenance. After capture, `--recompute-alignment --out <output>` recalculates from descriptors without network requests.

The Oct 8 audit rendered HEAD `f8d7cd102d54059716785e11c44c6ee74e884311`: **405 skins attempted, 2,225 options compared, 77,408 retained sequence frames**. All 211 final candidates were reviewed: **82 wrong-window pairs across 69 skins; 13 pose/attachment pairs across four skins; one overlaps**. Seven remain uncertain. There are 169 unavailable options and eight failed reference captures on two Astral Colt skins. Six catalog skins have zero deduped options.

Shelly/Bull/Spike's fifteen controls pass. Kaze Happy/HeroScreen's expected body-motion positive did **not** reproduce (mean 0.000826, max 0.002934); its eye atlas, native camera and live UI remain outside this result. Darryl Win reproduces the window defect (1.4/11.266667 seconds). One-loop sampling does not establish later intro-to-loop sequencing.

Evidence, five examples per confirmed class and likely mechanisms with baseline file:line are in `/tmp/brawl-audit/motion/MOTION.md`; calibration is in `CALIBRATION.md`, and consolidated results are under `/tmp/brawl-audit/motion/verified`. Generated output is not committed.
