# Import and measure the complete reference inventory

Use this workflow for local capture and QA. It does not provision storage or
publish assets. Keep the active verified package at `.generated/brawl-3d/`
separate from the full inventory at `.generated/brawl-3d-full/`. Neither
directory belongs in Git.

## Capture the enabled inventory

```sh
node scripts/import-mv-brawl-assets.mjs \
  --mirror /absolute/path/to/brawl-stars-assets-cache.git \
  --output-dir .generated/brawl-3d-full/capture \
  --resume --progress \
  --history-versions 67.264,CN-55.3.1 \
  --asset-concurrency 4 \
  --request-delay-ms 400 \
  --request-timeout-ms 20000 \
  --max-retries 2
```

The importer removes duplicate enabled route slugs before applying offsets or
limits. Disabled rows are not crawled. Pet forms remain distinct inventory
entries and retain source-authored owner relationships.

All transfers share a paced queue, even with overlapping downloads. The
importer honors `Retry-After`, bounds network stalls, and records permanent
failures. Add `--verbose-assets` to print individual cache hits and transfers.
Increase the request delay if the source continues to rate-limit the run.

The capture stores exact page HTML, URL-to-hash records, and content-addressed
asset bytes. Rerunning with `--resume` verifies cached content and reconciles
metadata without fetching valid cached assets again. One process owns the
state lock. A later run can recover a lock whose owning process has exited.

Identity matching uses source model, texture, material-override, translated
name, and pet-owner evidence. Ambiguous identities are recorded with their
candidates. A missing match never becomes the first skin sharing a model.
The optional historical snapshot resolves exact pre-remodel package records
while retaining current canonical brawler IDs. Historical matches record the
source version; they do not mix historical and current asset bytes.

To reconcile identities from captured pages without network access or changes
to the live capture state:

```sh
node scripts/reconcile-mv-identities.mjs \
  --mirror /absolute/path/to/brawl-stars-assets-cache.git \
  --api-catalog /absolute/path/to/released-brawlers.json \
  --output .generated/brawl-3d-full/reconciled-inventory.json
```

Pass this result to staging with `--inventory`. The reconciler verifies each
page hash and preserves the captured asset bytes and download failures.
When an API catalog is supplied, an exact, unique public brawler-name suffix
can associate a viewer-only route with that brawler. Such routes retain
`Reference-` identifiers and `identity.kind: "reference-only"`; their official
skin ID stays null. This association is reported separately from source-table
matches and never substitutes an arbitrary existing game skin.

## Measure captured files

After the crawl finishes, run:

```sh
node scripts/audit-mv-inventory.mjs \
  .generated/brawl-3d-full/capture/mv-reference-inventory.json \
  .generated/brawl-3d-full/capture-audit.json
```

For an in-progress snapshot, pass `capture/.mv-import-state.json` instead.
The audit measures distinct file bytes, duplicate references, file-size
limits, and per-skin startup payloads. It does not extrapolate from one skin.
Startup measurements exclude the application's JavaScript and other page data.

## Build a separate staging package

Use a released-brawler API snapshot containing `id`, `name`, and `released`
fields to retain the product's public brawler IDs and release boundaries.

```sh
node scripts/build-mv-staging.mjs \
  --mirror /absolute/path/to/brawl-stars-assets-cache.git \
  --capture .generated/brawl-3d-full/capture \
  --output .generated/brawl-3d-full/staging \
  --inventory .generated/brawl-3d-full/reconciled-inventory.json \
  --api-catalog /absolute/path/to/released-brawlers.json

node apps/brawlstats/scripts/verify-brawler-assets.mjs \
  .generated/brawl-3d-full/staging/package \
  --report .generated/brawl-3d-full/staging/runtime-verification.json \
  --summary
```

Staging stores identical content once while retaining each source package's
identity. Invalid reference entries are quarantined with reasons, not promoted
to ready assets. The strict manifest command still aborts on such entries
unless `--quarantine-reference-failures` is explicitly selected.

The verifier continues after individual failures and limits its file cache to
64 MiB. Use `--brawler-id` or `--skin-id` to inspect a smaller subset. It runs
the actual GLTF loader and runtime, but uses placeholder external textures.
CPU assembly success does not prove shader appearance or visual parity.

Export the reachable runtime files into a fresh candidate release directory:

```sh
node scripts/export-brawl-runtime-package.mjs \
  --source .generated/brawl-3d-full/staging/package \
  --output .generated/brawl-3d-full/release \
  --legacy-dir apps/brawlstats/public/assets/brawlers/3d \
  --report .generated/brawl-3d-full/release-report.json
```

This excludes stale shards, unreferenced objects, capture pages, and reports.
It preserves existing numeric fallback artwork and legacy models. Reusing the
same output is allowed only when it contains no unrelated files.

## Choose hosting from the measurements

Cloudflare Workers Static Assets provides free static storage and requests,
subject to its file-count and individual-file-size limits. R2 Standard has a
monthly free allowance and free egress, but storage and operations above the
allowance are billable. Check current provider documentation before provisioning.

Count catalog metadata as well as object files in the final deployment.
Measure the exact release directory, not the capture cache or stale staging
files. Exclude raw HTML, source CSVs, audit records, and unreferenced objects
from the public package. Preserve licensing/provenance review before public
activation, and serve asset bytes directly from the selected CDN to avoid an
extra Vercel Function transfer path.
