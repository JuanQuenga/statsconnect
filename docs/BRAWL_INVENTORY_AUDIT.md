# Full brawler inventory and hosting audit

Measured on 2026-09-06 from [the reference inventory](https://mv.brawlstars.top/en/).
The capture and candidate release remain local. No storage was provisioned and
no public asset deployment was made during this import.

## Inventory coverage

| Result | Count |
| --- | ---: |
| Enabled inventory rows | 1,327 |
| Distinct enabled routes visited | 1,321 |
| Default brawler routes | 106 |
| Pet-form routes | 19 |
| Packages with every declared download captured | 1,295 |
| Additional packages usable without a missing optional animation | 18 |
| Packages blocked by critical source files | 8 |

Source-table matching identifies 1,216 routes, including historical and regional
records. Another 104 use explicit reference-only identifiers. These include
viewer variants that would otherwise overwrite a shared game skin ID. Their
known brawler association is retained without claiming an official game skin
ID. Tengu Mike remains unmapped and also has missing source files.

The eight critical-source exceptions are Tengu Mike, Wanderer Gray, Tengu Angelo,
Shinobi Ash, Huáng Jīn Hài Kè Mortis, and three Dí Jiā Fang variants. Their
missing geometry, textures, or material textures return HTTP 404 from the
reference CDN. Missing optional cinematics are omitted from their respective
animation selectors instead of hiding otherwise complete models.

Capture, identity reconciliation, manifest admission, CPU assembly, and visual
parity are separate checks. The manifest also quarantines five packages whose
half-range UV assumptions could not be proven. The full runtime report records
the remaining UV and loader exceptions. This is not a claim that every listed
skin has received a visual sign-off.

The final CPU sweep checked 1,308 staged skin/variant entries and successfully
assembled 7,803 animation selections. Six checks remain flagged: four regional
models have missing `TEXCOORD_0` data, and two Ghost Squeak animation exports
fail the GLTF loader. These are recorded in `final-runtime-verification.json`.
They must be resolved or disabled before treating the candidate as a fully
verified public release.

## Measured release size

| Measurement | Result |
| --- | ---: |
| Candidate release files, including metadata and legacy fallbacks | 8,662 |
| Candidate release bytes | 3,952,125,969 |
| Largest file | 15,318,384 bytes, about 14.6 MiB |
| Distinct captured asset objects | 8,600 |
| Captured bytes without repeated references | 3,951,484,646 |
| Bytes represented by all repeated asset references | 9,183,637,078 |
| Repetition avoided by content deduplication | 5,232,152,432 bytes |

These are file measurements, not an extrapolation from one skin. The candidate
release contains only files reachable from the current catalog plus the
existing numeric fallback artwork and legacy models. Raw HTML, capture state,
source metadata, audit reports, and stale staging objects are excluded.

## Performance implications

The median cold asset payload for the first declared animation is about 4.77 MB;
the 95th percentile is about 8.76 MB. The median requires nine asset requests.
These figures exclude catalog metadata, application JavaScript, and other page
data, and do not model browser cache hits.

An idle-first policy would reduce the measured median payload to about 3.81 MB
and the 95th percentile to about 5.54 MB. Keep skins and animations lazy-loaded;
do not download the whole catalog's media at startup. Content-addressed shared
URLs let subsequent skin selections reuse common geometry, animations,
lightmaps, and face atlases through the browser cache.

Serve asset bytes directly from the selected CDN. Passing each download through
a Vercel Function adds a transfer path and can consume Vercel allowances. The
existing same-origin delivery contract needs an intentional CDN configuration
change before using a separate asset domain.

## Hosting recommendation

Use **Cloudflare Workers Static Assets** for the current package while keeping
the application on Vercel. Cloudflare documents free, unlimited static asset
requests and no additional asset storage cost. Its Free plan permits 20,000
files per version and 25 MiB per file. This release fits both limits.

[Static asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
and [file limits](https://developers.cloudflare.com/workers/platform/limits/#static-assets).

R2 Standard is a useful alternative if future assets exceed the static file
limit. Its free allowance is 10 GB-month of storage, one million Class A
operations, and ten million Class B operations monthly, with free egress.
Usage above those allowances is billable. Other stored data and retained
releases count toward the storage allowance.

[R2 pricing](https://developers.cloudflare.com/r2/pricing/).

The recommendation concerns asset hosting. It does not remove any existing
Vercel or Convex subscription or application-usage charges. Both Cloudflare
options can use CDN caching; no comparative production latency benchmark has
been run because neither hosting option was provisioned in this phase.

## Reproduction and local artifacts

Follow [the import workflow](BRAWL_INVENTORY_IMPORT.md). The completed run is
stored under `.generated/brawl-3d-full/`:

- `capture/mv-reference-inventory.json`: the complete capture inventory.
- `reconciled-inventory.json`: source-backed and reference-only identities.
- `final-capture-audit.json`: measured file and startup-payload statistics.
- `staging-final/bridge.audit.json`: per-route provenance and missing assets.
- `final-runtime-verification.json`: actual loader and assembly results.
- `release-final/`: candidate deployment files.
- `release-report.json`: exact candidate file-count and size limits.

The capture tooling supports bounded retries, shared content-addressed caching,
page-hash verification, a single-writer state lock, and restart recovery. The
runtime verifier uses the real GLTF loader and a bounded file cache, but external
textures are placeholders. Public activation still requires review of the
remaining source exceptions, visual fidelity, and recorded provenance.
