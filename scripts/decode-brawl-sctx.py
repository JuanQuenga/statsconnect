#!/usr/bin/env python3
"""Decode one pinned Supercell SCTX texture through the local parser tool."""

from __future__ import annotations

import argparse
import struct
import sys
from pathlib import Path

from flatbuffers.encode import Get
from flatbuffers.packer import uoffset
from flatbuffers.table import Table
from flatbuffers.number_types import Int32Flags, Uint16Flags, Uint32Flags, Uint8Flags


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--parser-root", type=Path, required=False)
    args = parser.parse_args()
    if args.parser_root:
        sys.path.insert(0, str(args.parser_root / "src"))
    import texture2ddecoder
    import zstandard

    raw = args.source.read_bytes()
    first_len = struct.unpack_from("<I", raw, 0)[0]
    first_start = 4
    first = raw[first_start : first_start + first_len]
    mip_len_offset = first_start + first_len
    mip_len = struct.unpack_from("<I", raw, mip_len_offset)[0]
    mip_start = mip_len_offset + 4
    mip_chunk = raw[mip_start : mip_start + mip_len]
    payload_start = mip_start + mip_len
    root = Get(uoffset, first, 0)
    table = Table(first, root)

    def field(index, flags):
        offset = table.Offset(4 + (index * 2))
        return table.Get(flags, offset + table.Pos) if offset else 0

    pixel_type = field(1, Int32Flags)
    width = field(2, Uint16Flags)
    height = field(3, Uint16Flags)
    flags = field(6, Uint32Flags)
    level_count = field(4, Uint8Flags)
    if pixel_type != 212 or width <= 0 or height <= 0 or level_count <= 0:
        raise ValueError(f"unsupported SCTX base texture: type={pixel_type} size={width}x{height} levels={level_count}")

    mipmaps = []
    position = 0
    for _ in range(level_count):
        chunk_size = struct.unpack_from("<I", mip_chunk, position)[0]
        position += 4
        chunk = mip_chunk[position : position + chunk_size]
        position += chunk_size
        mip_root = Get(uoffset, chunk, 0)
        mip_table = Table(chunk, mip_root)
        def mip_field(index, flags_type):
            offset = mip_table.Offset(4 + (index * 2))
            return mip_table.Get(flags_type, offset + mip_table.Pos) if offset else 0
        mipmaps.append((mip_field(0, Uint16Flags), mip_field(1, Uint16Flags), mip_field(2, Int32Flags)))
    compressed = raw[payload_start:]
    decoded_payload = zstandard.ZstdDecompressor().decompress(compressed) if flags & 1 else compressed
    base_offset = mipmaps[0][2]
    next_offset = mipmaps[1][2] if len(mipmaps) > 1 else len(decoded_payload)
    encoded = decoded_payload[base_offset:next_offset]
    pixels = texture2ddecoder.decode_astc(encoded, width, height, 8, 8)
    from PIL import Image
    image = Image.frombytes("RGBA", (width, height), pixels, "raw", "BGRA")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    image.save(args.output, format="PNG", optimize=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
