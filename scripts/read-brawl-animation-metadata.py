#!/usr/bin/env python3
"""Read source timing before the FLA2 converter removes its animation extension."""

import argparse
import json
import math
from pathlib import Path
import sys


def animation_metadata(document: dict) -> dict:
    extensions = document.get("extensions") or {}
    odin = extensions.get("SC_odin_format") or {}
    animation = odin.get("animation")
    if not isinstance(animation, dict):
        raise ValueError("source has no SC_odin_format animation descriptor")
    # Match OdinAnimationReader, including its zero/null fallback.
    fps = animation.get("frameRate") or 30
    if isinstance(fps, bool) or not isinstance(fps, (int, float)) or not math.isfinite(fps) or fps <= 0:
        raise ValueError("source animation frame rate must be positive and finite")
    return {"fps": fps}


def read_metadata(source: Path, converter_dir: Path) -> dict:
    sys.path.insert(0, str(converter_dir))
    from lib.glTF import glTF

    gltf = glTF()
    gltf.read(source.read_bytes())
    for chunk in gltf.chunks:
        chunk.deserialize_json()
    document = gltf.get_chunk("JSON").data
    if isinstance(document, (bytes, str)):
        document = json.loads(document)
    return animation_metadata(document)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--converter-dir", type=Path, required=True)
    args = parser.parse_args()
    try:
        metadata = read_metadata(args.source, args.converter_dir.resolve())
    except (ValueError, KeyError, TypeError) as error:
        raise SystemExit(str(error)) from error
    print(json.dumps(metadata, allow_nan=False))


if __name__ == "__main__":
    main()
