"""Decode authoritative SC5 export names for both native face exporters."""

from pathlib import Path
import struct
import sys
from typing import Sequence


def read_sc5_resource_data(sc_file: Path, parser_root: Path) -> tuple[bytes, int]:
    """Decode the SC5 resource stream with the pinned schema."""
    raw = sc_file.read_bytes()
    if len(raw) < 10 or raw[:2] != b"SC" or struct.unpack_from("<I", raw, 2)[0] != 5:
        raise ValueError("source is not an SC5 file")
    sys.path.insert(0, str(parser_root / "src"))
    try:
        import zstandard
        from sc5_parser._schemas.sc.flash.SC2.FileDescriptor import FileDescriptor
    except ImportError as exc:
        raise ValueError("SC5 resource extraction requires the pinned parser tool") from exc
    descriptor_size = struct.unpack_from("<I", raw, 6)[0]
    descriptor_end = 10 + descriptor_size
    if descriptor_end > len(raw):
        raise ValueError("SC5 descriptor is truncated")
    descriptor = FileDescriptor.GetRootAs(raw[10:descriptor_end], 0)
    compressed_start = descriptor_end
    compressed_end = compressed_start + descriptor.CompressedSize()
    if compressed_end > len(raw):
        raise ValueError("SC5 compressed stream is truncated")
    try:
        inner = zstandard.ZstdDecompressor().decompress(
            raw[compressed_start:compressed_end], max_output_size=100 * 1024 * 1024
        )
    except Exception as exc:
        raise ValueError("SC5 compressed stream could not be decoded") from exc
    return inner, descriptor.ResourcesOffset()


def resolve_sc5_export_names(
    strings: Sequence[str], object_ids: Sequence[int], name_refs: Sequence[int]
) -> dict[str, int]:
    """SC5 ExportNames references index the string vector directly."""
    if len(object_ids) != len(name_refs):
        raise ValueError("SC5 export object/name vectors have different lengths")
    exports = {}
    for object_id, name_ref in zip(object_ids, name_refs):
        if name_ref < 0 or name_ref >= len(strings):
            raise ValueError(f"SC5 export string reference is out of range: {name_ref}")
        name = strings[name_ref]
        if name:
            exports[name] = object_id
    return exports


def repair_sc5_export_names(sc, sc_file: Path, parser_root: Path) -> None:
    """Correct the pinned parser's one-based export lookup at our boundary.

    Export names must remain joined to their serialized object IDs. Inferring
    names from neighboring parsed exports loses index zero and can silently
    select another character's face.
    """
    inner, position = read_sc5_resource_data(sc_file, parser_root)
    from sc5_parser._schemas.sc.flash.SC2.ExportNames import ExportNames
    if position + 4 > len(inner):
        raise ValueError("SC5 export resource is missing")
    size = struct.unpack_from("<I", inner, position)[0]
    end = position + 4 + size
    if end > len(inner):
        raise ValueError("SC5 export resource is truncated")
    names = ExportNames.GetRootAs(bytes(inner[position + 4:end]), 0)
    sc.exports = resolve_sc5_export_names(
        sc.strings,
        [names.ObjectIds(index) for index in range(names.ObjectIdsLength())],
        [names.NameRefIds(index) for index in range(names.NameRefIdsLength())],
    )
