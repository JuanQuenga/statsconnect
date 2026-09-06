# SC v5 native face export

`scripts/export-sc5-face.py` converts face MovieClips from a local Supercell
SC v5 `characters.sc` file to the same planar, little-endian FaceBinary format
decoded by `apps/brawlstats/src/lib/brawler-viewer-contract.ts`.

The parser is intentionally not vendored and is not a runtime dependency.
Use the MIT `obus-globus/sc5-parser` checkout pinned to commit
`9108080256a0df6cd772d81afdbc26047d79d78d`:

```bash
git clone https://github.com/obus-globus/sc5-parser /tmp/sc5-parser
git -C /tmp/sc5-parser checkout 9108080256a0df6cd772d81afdbc26047d79d78d
python3 scripts/export-sc5-face.py \
  /path/to/68.250/sc/characters.sc \
  crow_def_face/happy crow_def_face/sad crow_def_face \
  --parser-root /tmp/sc5-parser \
  --output /tmp/crow-face.bin
```

The adapter recursively applies MovieClip frame-element matrices and color
transforms, triangulates each SC triangle strip, preserves normalized atlas
UVs, and writes frame records as: vertex count, index count, planar float32
positions, uint16 UVs, uint8 color multipliers, uint8 color additions, and
uint16 indices. It does not copy source assets into the application.

The raster exporter also understands the inline `TextureData` used by modern
SC5 files. Prefer that path for a source-owned atlas:

```bash
cd /tmp/sc5-parser
uv pip install --python .venv/bin/python 'texture2ddecoder==1.0.6'
uv run python /path/to/StatsConnect/scripts/export-sc5-face-raster.py \
  /path/to/68.250/sc/characters.sc crow_def_face \
  /tmp/crow-face-atlas.png /tmp/crow-face.bin \
  --parser-root /tmp/sc5-parser \
  --metadata-output /tmp/crow-face.json
```

The exporter extracts the high-resolution inline `TextureData` vector,
validates its KTX1 ASTC header, decodes it with the pinned local
`texture2ddecoder` tool, and checks the decoded dimensions against SC5's
texture metadata. It never sends the source file or texture to a runtime URL.
Generated metadata records the SC file hash, embedded KTX hash, decoded RGBA
atlas hash, dimensions, and `atlas_origin: "embedded-sc5"`.

For older SC5 files that reference an external texture, pass
`--source-atlas /path/to/matching-atlas.png`. This is a fail-closed fallback:
the image must match the SC texture slot dimensions exactly, and its file and
decoded-pixel hashes are recorded as `external-file` provenance. A mismatched
atlas is rejected; the exporter does not guess or substitute an atlas.

Run hermetic core tests without installing the parser (the test filename is
hyphenated, so invoke it directly rather than through unittest discovery):

```bash
uv run --with 'Pillow==12.1.1' python scripts/export-sc5-face.test.py
```

The parser's documented structures are sufficient for geometry extraction;
the output should still be compared against captured reference buffers before
shipping. The adapter emits every frame in each requested export, in export
argument order. It currently uses each nested child MovieClip's frame index
clamped to its available range; source-specific label selection can be added
once the face-state labels are confirmed.

## Catalog state resolution

Both exporters use `scripts/sc5_export_names.py` to resolve serialized export
names to their exact object IDs. The pinned parser incorrectly treats
`ExportNames.NameRefIds` as one-based. These references are zero-based; using
the wrong base can select an unrelated MovieClip while retaining a face name.
The adapter corrects this lookup without modifying the parser checkout.

Metadata records `export_name_reference_base: 0` and `export_object_id`.
Catalog generation requires these fields, so older wrong-name exports must be
regenerated even when their source commit and configured symbol still match.

`export-sc5-face-raster.py` is the catalog-safe path. It calls the pinned
parser's `extract_sprite_with_offset`, which applies SC5 MovieClip masks and
color transforms before atlas packing. `resolve_face_exports` and
`catalog_face_metadata` select only exact exports from the source file and
record each state's native frame count, FPS, selected frame window, and
duration. If a state is absent or is not a MovieClip, metadata reports
`available: false` with a reason; the exporter never synthesizes a face.

The source data does not have one universal suffix. The resolver handles the
observed default variants in priority order: `def_face`/`def_still`/`face`/
`still` for idle-like states, `def_happy`/`def_win`/`happy`/`win` for lobby,
and `def_sad`/`def_lose`/`sad`/`lose` for loss. This is a naming resolver, not
a coordinate transform: returned raster offsets remain the parser's
game-space offsets and must be validated against the matching model/atlas
version before being enabled in the viewer.

The pinned 68.250 source currently contains native exports for Crow, Shelly,
and Colt. Their native frame counts are source facts and may differ from a
reference site's mixed cache versions. `quad_frames` preserves the parser's
game-space `x_offset`/`y_offset` for every raster frame; it does not recenter,
scale, or synthesize face geometry. The matching model/asset version must use
that same coordinate contract before an export is enabled in the viewer.

The viewer's face vertex transform is also source metadata, not a brawler
exception. The catalog carries `faceCoversWholeTexture` and
`faceScaledUpTexture` from `skin_confs.csv`; the runtime maps those flags to
the reference shader's three cases. The pinned 68.250 `skin_confs.csv` rows
for the Crow, Shelly, and Colt defaults leave both flags empty. The generated
catalog therefore preserves both as unavailable/null and the viewer keeps the
legacy default transform (`x = a_pos.x / 512 - 1`, `y = -a_pos.y / 512 - 1`).
Explicit `true` values from other skin-conf rows are preserved verbatim and
enable the corresponding shader case; the exporter does not infer or
brawler-hardcode missing flags.

Materialization exports every configured face role through its exact
`faces.csv` source filename and export name. Each role receives its own
`<Role>.png`, `<Role>.bin`, and `<Role>.meta.json` pair. Profile, hero-screen,
happy, and other exports never substitute for an absent idle export.

Two roles may reuse bytes only when both their SC source file and export name
match. Metadata records the source commit, file, configured symbol, export
name, and native FPS. Catalog generation checks that provenance before marking
the pair ready. A missing export, mismatched metadata, or failed atlas pairing
leaves that role unavailable without enabling another face in its place.

## Atlas provenance and fail-closed pairing

Modern SC5 `characters.sc` files can be self-contained: the pinned 68.250
file has one 2040x2880 texture slot whose high-resolution `TextureData` is an
inline KTX1 ASTC payload. The exporter prefers and validates this payload.
External atlas files are accepted only when their dimensions exactly match
the SC texture slot, and every generated export records both source and atlas
hashes for reproducibility.
