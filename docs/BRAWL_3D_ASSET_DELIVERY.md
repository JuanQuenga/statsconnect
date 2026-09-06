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
Install the conversion dependencies from the repository's pinned requirements:

```sh
uv venv /absolute/path/to/brawl-asset-venv
uv pip install --python /absolute/path/to/brawl-asset-venv/bin/python -r scripts/brawl-asset-tools-requirements.txt
```

Pass that Python executable to `--python`. The converter still uses NumPy
scalar coercions that NumPy 2.4 removed, so do not replace the pinned NumPy
version with the latest version. The SC5 parser checkout is supplied separately
through `--parser-root` as documented in `docs/SC5_FACE_EXPORT.md`.

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

The raw conversion plan resolves each configured animation symbol through
`csv_client/animations.csv`. It preserves the exact source filename, frame
window, and playback speed. Source speed is a percentage; the catalog stores
its multiplier separately from the source frame rate. Materialization reads
the source animation's authored frame rate before conversion removes that
metadata. Ready exports require this verified FPS; it is not assumed to be
60. Unconfigured roles do not receive guessed animations.

Before any asset is reported ready, the materializer verifies the pinned
HalfVector2 rotation patch, requires `TEXCOORD_0` on every emitted geometry
primitive, and validates every animation quaternion/GLB. Catalog generation
repeats the geometry check for existing exports. Animation and face metadata
must match the pinned source commit, file, and configured symbol. Old exports
without matching provenance remain unavailable until regenerated.

The converter patch also handles array-backed quaternion accessors explicitly
with `.item()`, which is required by newer NumPy versions. Run
`python3 scripts/converter-rotation.test.py` to test the shipped decoder patch.

The materializer converts FLA2 geometry and animations, decodes ASTC SCTX
diffuse textures, and exports every configured native SC5 face role. Each
role has its own PNG, binary, and metadata file. Roles reuse bytes only when
their SC source file and exact export name match. Failed inputs remain
unavailable with a reason in the report. The older ignored
`.generated/brawl-3d/materialized-sample-distinct-3` fixture predates these
fail-closed checks and must not be used as a release artifact; regenerate it
with the command above.

Raw material slots come from the converted geometry's used material names,
constants, and texture references. Unsupported material-file overrides,
custom shaders, or material effects remain explicitly unavailable. The
viewer must not advertise those skins as complete standard-material exports.

## Verify the delivered package

Run the real-asset check after regenerating the catalog and shards:

```sh
node apps/brawlstats/scripts/verify-brawler-assets.mjs /absolute/path/to/converted-brawl-3d
```

The check parses the actual catalog, checks ready-file references and geometry
UVs, validates animation quaternions, loads every selectable body and animation
through Three.js, decodes selected face binaries, and checks finite skinned
bounds. Failures produce a nonzero exit code. Static pose exports without an
animation clip remain valid and are reported separately.

This CPU check uses placeholder external textures. It does not prove rendered
texture placement. Check the corresponding brawler hero in a browser, including
skin changes, bounded animations, pause/resume, faces, outlines, and framing.
Neither unit tests nor file existence replace that visual check.

Reference packages declare face associations per animation. Those associations
are retained for attack, super, and custom animations; a missing declaration
does not receive an inferred face. The viewer normalizes finite, nonzero
reference node rotations and linear quaternion keys in memory. This repairs
non-unit rotations in mirrored reference packages without modifying their
source bytes. Invalid rotations and unsupported non-unit cubic curves fail
closed. Raw conversion still requires unit quaternions at publication.

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
