# Brawl 3D asset delivery

The 3D catalog is served through a StatsConnect-owned same-origin path:

```text
/bs/assets/brawlers/3d/<package-file>
```

The standalone BrawlStats app uses the equivalent `/assets/brawlers/3d/`
prefix. Generated catalogs must contain only these relative, same-origin
URLs. They must never contain `mv.brawlstars.top`, a third-party CDN, or the
storage origin.

## Local conversion work

## Reference-package importer (bounded local QA)

`scripts/import-mv-brawl-assets.mjs` is a build-time importer for the public
model-viewer inventory. It starts from the canonical English index (`/en/`),
resolves each skin page to the pinned mirror's stable brawler/skin IDs, and
downloads the page's geometry, diffuse/specular textures, lightmaps, face
atlas/binaries, animations, outline materials, face flags, and camera hint.
The CDN URLs are source inputs only; the emitted bridge and catalog contain
same-origin paths after the importer mirrors the bytes.

Use a bounded, resumable representative run:

```sh
node scripts/import-mv-brawl-assets.mjs \
  --inventory-url https://mv.brawlstars.top/en/ \
  --mirror /absolute/path/to/brawl-stars-assets-cache.git \
  --output-dir .generated/brawl-3d/mv-reference \
  --routes "Spike (Default),Crow (Default),Colt (Default),Shelly (Default)" \
  --resume \
  --bridge-assets-dir .generated/brawl-3d/reference-bridge \
  --bridge-output .generated/brawl-3d/mv-reference-bridge.json \
  --bridge-audit-output .generated/brawl-3d/mv-reference-bridge.audit.json
```

`--limit`, `--offset`, and `--routes` bound the crawl; `.mv-import-state.json`
is written atomically after each route so a later `--resume` only requests
unfinished work. Omit `--routes` and `--limit` for the full inventory after a
representative run has passed. A route with missing page assets is recorded as
unavailable with its reason and is never emitted as a ready package.

Use `--bridge-assets-dir` for the project-local delivery root. Its default is
the crawl output directory; when the public prefix already names the bridge,
the default storage prefix is empty so URLs do not repeat `reference-bridge`.

The importer sends a browser-shaped, secret-free request header set to the
inventory, skin pages, and CDN fetches. Override or extend it with
`requestHeaders` when calling `crawlMvInventory`, or pass
`--request-headers-json <file>` to the CLI. Retryable `429`/`5xx` responses use
bounded exponential backoff (`--max-retries`, `--retry-delay-ms`). A bare git
mirror is supported directly; the bridge receives parsed character rows and
does not require a checked-out `<version>/csv_logic/characters.csv` path. The
default request delay is 100 ms (`--request-delay-ms`) and requests are
serialized at concurrency 1; `Retry-After` is honored for rate-limited
responses.

Use `scripts/materialize-brawl-assets.mjs` to turn source-ready entries into
self-hosted browser assets. It requires the pinned local converter checkout
and the pinned `sc5-parser` environment; it never emits a source-mirror URL.
The command is bounded for QA, or can run catalog-wide by omitting `--limit`:

```sh
node scripts/materialize-brawl-assets.mjs \
  --manifest .generated/brawl-3d/catalog.build.json \
  --mirror /absolute/path/to/brawl-stars-assets-cache.git \
  --converter-dir /absolute/path/to/Supercell-Flat-Converter \
  --parser-root /absolute/path/to/sc5-parser \
  --python /absolute/path/to/sc5-parser/.venv/bin/python \
  --output-dir /absolute/path/to/converted-brawl-3d \
  --report /absolute/path/to/materialization-report.json
```

For the full released catalog, use the same command without `--limit`,
`--brawler-id`, or `--distinct-brawlers`:

```sh
pnpm materialize:brawl-assets -- \
  --manifest .generated/brawl-3d/catalog.build.json \
  --mirror /absolute/path/to/brawl-stars-assets-cache.git \
  --converter-dir /absolute/path/to/Supercell-Flat-Converter \
  --converter-commit a0ac5f47b8e2088c088b0043f49508611f7bc660 \
  --parser-root /absolute/path/to/sc5-parser \
  --python /absolute/path/to/sc5-parser/.venv/bin/python \
  --output-dir /absolute/path/to/converted-brawl-3d \
  --report /absolute/path/to/materialization-report.json
```

Before any asset is reported ready, the materializer verifies the pinned
HalfVector2 rotation patch, requires `TEXCOORD_0` on every emitted geometry
primitive, and validates every animation quaternion/GLB. A failed check is an
unavailable reason; it is never replaced with a fallback or a third-party URL.

The materializer converts FLA2 geometry/animations, decodes ASTC SCTX
diffuse textures, and exports a native SC5 idle face atlas/binary. Failed
inputs remain unavailable with a reason in the report. The older ignored
`.generated/brawl-3d/materialized-sample-distinct-3` fixture predates these
fail-closed checks and must not be used as a release artifact; regenerate it
with the command above.

The converted package stays outside tracked source. The Vite server uses
`BRAWL_3D_ASSET_DIR` when it is set; otherwise it uses the deterministic,
gitignored repository fallback `<repo>/.generated/brawl-3d`. Set this in
`apps/brawlstats/.env.local` when the conversion output lives elsewhere:

```dotenv
BRAWL_3D_ASSET_DIR=/absolute/path/to/converted-brawl-3d
```

The BrawlStats Vite server serves that directory at the same-origin asset
prefix. It validates the requested path, rejects traversal, and does not copy
the package into `public/` or the git worktree. The fallback directory is only
for local dev/preview QA; production never reads it. If neither the explicit
directory nor the fallback contains a requested file, the request fails
without falling through to the SPA shell.

## Production storage

Provision one project-controlled immutable object store (Vercel Blob with a
custom project domain, or an object store behind a project-controlled HTTPS
origin). Upload the converted package with the exact relative layout emitted
by `scripts/build-brawl-asset-manifest.mjs`, then configure this Vercel
environment variable for the Production and Preview environments:

```text
BRAWL_3D_ASSET_STORAGE_ORIGIN=https://assets.<your-project-domain>
```

The value must be an HTTPS origin with no credentials, query, or fragment. A
path prefix is allowed and must end in `/`. Do not use a `VITE_` prefix and do
not put a storage token in frontend environment variables.

Vercel rewrites `/bs/assets/brawlers/3d/:path*` (and the standalone prefix) to
`/api/brawlers-3d/:path*`. That route is an Edge streaming proxy: it forwards
the upstream response body instead of buffering it, and preserves GET/HEAD,
Range, conditional-request headers, and `206 Partial Content` responses. This
avoids Vercel's buffered Function response limit for larger GLBs. The proxy
reads the storage origin only on the server, allows the catalog asset
extensions, and applies content-addressed caching: model, animation, texture,
and face files default to one-year immutable caching, while `catalog.json` and
`catalog/*.json` shards are always `no-cache, must-revalidate` so regeneration
is visible. An unconfigured or invalid origin fails closed with `503`; it does
not fall back to an external URL or fabricate an asset entry. This is an
intentional readiness state: until the storage origin is provisioned, the
viewer keeps its tracked legacy GLBs or official PNG fallback. It does not
attempt to load the ignored `.generated/brawl-3d` directory in production.
Configure the server-only variable before treating the generated catalog as
production-ready.

This keeps the approximately 2.6 GiB / 16k-file catalog out of the git
repository and frontend deployment bundle while preserving one browser-visible
origin. The asset package is a separate storage deployment concern; this
repository contains only the typed delivery boundary and manifest contract.
