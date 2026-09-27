#!/usr/bin/env python3
"""Export a pinned SC5 bone effect to a compact RGBA atlas and frame manifest.

Example (source revision cc307ffd36678ac463cc2ca9373a08b0a2d2b0b7):
  git --git-dir=/path/to/brawl-stars-assets-cache.git show \
    cc307ffd36678ac463cc2ca9373a08b0a2d2b0b7:69.230/sc/effects_brawler_cosmo.sc \
    > /tmp/effects_brawler_cosmo.sc
  python scripts/export-brawl-bone-effect.py \
    --sc-file /tmp/effects_brawler_cosmo.sc \
    --parser-root /tmp/statsconnect-sc5-parser \
    --export cosmo_def_hand \
    --output-prefix apps/brawlstats/public/images/brawl-effects/cosmo-hand
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

from PIL import Image


def load_face_exporter(script_dir: Path):
    spec = importlib.util.spec_from_file_location("sc5_face_raster", script_dir / "export-sc5-face-raster.py")
    if spec is None or spec.loader is None:
        raise RuntimeError("SC5 raster exporter is unavailable")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sc-file", required=True, type=Path)
    parser.add_argument("--parser-root", required=True, type=Path)
    parser.add_argument("--export", required=True)
    parser.add_argument("--output-prefix", required=True, type=Path)
    parser.add_argument("--fps", type=int, default=30)
    args = parser.parse_args()
    sys.path.insert(0, str(args.parser_root / "src"))
    from sc5_parser.parser import SC5File
    from sc5_parser.render import extract_sprite_with_offset

    exporter = load_face_exporter(Path(__file__).parent)
    sc = SC5File(args.sc_file)
    exporter.repair_sc5_export_names(sc, args.sc_file, args.parser_root)
    source_atlas, provenance = exporter.load_atlas_source(sc, args.sc_file, args.parser_root, None)
    info = sc.get_export_frame_info(args.export)
    if info is None or info["frame_count"] <= 0:
        raise ValueError(f"missing effect export: {args.export}")

    frame_count = info["frame_count"]
    frames = [extract_sprite_with_offset(sc, args.export, [source_atlas], frame_index=i) for i in range(frame_count)]
    atlas_width = 2048
    padding = 2
    placements: list[dict[str, float | int] | None] = []
    cursor_x = padding
    cursor_y = padding
    row_height = 0
    for frame in frames:
        if frame is None:
            placements.append(None)
            continue
        image, offset_x, offset_y = frame
        width, height = image.size
        if width + 2 * padding > atlas_width:
            raise ValueError(f"effect frame is wider than {atlas_width} pixels")
        if cursor_x + width + padding > atlas_width:
            cursor_x = padding
            cursor_y += row_height + padding
            row_height = 0
        placements.append({"x": cursor_x, "y": cursor_y, "width": width, "height": height,
                           "offsetX": offset_x, "offsetY": offset_y})
        cursor_x += width + padding
        row_height = max(row_height, height)
    atlas_height = cursor_y + row_height + padding
    atlas = Image.new("RGBA", (atlas_width, atlas_height))
    for frame, placement in zip(frames, placements):
        if frame is not None and placement is not None:
            atlas.alpha_composite(frame[0], (int(placement["x"]), int(placement["y"])))

    args.output_prefix.parent.mkdir(parents=True, exist_ok=True)
    image_path = args.output_prefix.with_suffix(".png")
    manifest_path = args.output_prefix.with_suffix(".json")
    atlas.save(image_path, optimize=True)
    manifest_path.write_text(json.dumps({
        "sourceSha256": hashlib.sha256(args.sc_file.read_bytes()).hexdigest(),
        "sourceAtlasSha256": provenance.atlas_sha256,
        "export": args.export,
        "fps": args.fps,
        "atlasWidth": atlas_width,
        "atlasHeight": atlas_height,
        "frames": placements,
    }, separators=(",", ":")) + "\n")
    print(f"{frame_count} frames ({sum(frame is not None for frame in frames)} visible) -> {image_path}, {manifest_path}")


if __name__ == "__main__":
    main()
