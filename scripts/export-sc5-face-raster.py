#!/usr/bin/env python3
"""Raster-first SC5 face export using sc5-parser's mask-aware renderer.

The exporter keeps the source MovieClip authoritative for masks and pixels. It
never invents eye geometry: a missing state is represented as unavailable
metadata instead of a synthetic quad.
"""
from __future__ import annotations
import argparse, csv, hashlib, importlib.util, json, struct, sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable, Iterable, Mapping, Sequence
from PIL import Image
from sc5_export_names import read_sc5_resource_data, repair_sc5_export_names

_SPEC = importlib.util.spec_from_file_location("export_sc5_face", Path(__file__).with_name("export-sc5-face.py"))
assert _SPEC and _SPEC.loader
_MODULE = importlib.util.module_from_spec(_SPEC)
sys.modules[_SPEC.name] = _MODULE
_SPEC.loader.exec_module(_MODULE)
encode_face_binary = _MODULE.encode_face_binary


FACE_STATE_CANDIDATES: Mapping[str, tuple[str, ...]] = {
    "idle": ("def_face", "def_still", "face", "still"),
    "walking": ("def_face", "def_still", "face", "still"),
    "weapon": ("def_face", "def_still", "face", "still"),
    "ulti": ("def_face", "def_still", "face", "still"),
    "lobby": ("def_happy", "def_win", "happy", "win"),
    "lose": ("def_sad", "def_lose", "sad", "lose"),
}


class EmbeddedTextureError(ValueError):
    """Raised when an SC5 file has no decodable inline atlas."""


@dataclass(frozen=True)
class AtlasProvenance:
    """Hashes and origin for the exact atlas used to rasterize faces."""

    origin: str
    sc_file_sha256: str
    texture_sha256: str
    atlas_sha256: str
    dimensions: tuple[int, int]

    def as_json(self) -> dict[str, object]:
        return {
            "atlas_origin": self.origin,
            "sc_file_sha256": self.sc_file_sha256,
            "source_texture_sha256": self.texture_sha256,
            "source_atlas_sha256": self.atlas_sha256,
            "source_atlas_dimensions": list(self.dimensions),
        }


_KTX1_IDENTIFIER = b"\xABKTX 11\xBB\r\n\x1A\n"
_ASTC_BLOCKS: Mapping[int, tuple[int, int]] = {
    0x93B0: (4, 4),
    0x93B1: (5, 4),
    0x93B2: (5, 5),
    0x93B3: (6, 5),
    0x93B4: (6, 6),
    0x93B5: (8, 5),
    0x93B6: (8, 6),
    0x93B7: (8, 8),
    0x93B8: (10, 5),
    0x93B9: (10, 6),
    0x93BA: (10, 8),
    0x93BB: (10, 10),
    0x93BC: (12, 10),
    0x93BD: (12, 12),
}


def decode_ktx1_astc(
    data: bytes,
    *,
    decoder: Callable[[bytes, int, int, int, int], bytes] | None = None,
) -> tuple[Image.Image, tuple[int, int]]:
    """Decode one KTX1 ASTC mip level into an RGBA image.

    ``decoder`` is injectable so hermetic tests do not need a personal Python
    environment. Production calls use the pinned ``texture2ddecoder`` package
    from the local parser tool environment.
    """
    if len(data) < 64 or data[:12] != _KTX1_IDENTIFIER:
        raise EmbeddedTextureError("embedded texture is not a KTX1 file")
    fields = struct.unpack_from("<13I", data, 12)
    endianness, gl_type, gl_type_size, gl_format = fields[:4]
    internal_format = fields[4]
    width, height = fields[6:8]
    depth, array_elements, faces, mipmaps, key_value_size = fields[8:13]
    if endianness != 0x04030201:
        raise EmbeddedTextureError("KTX1 texture has unsupported byte order")
    if width <= 0 or height <= 0 or depth != 0 or array_elements not in (0, 1) or faces != 1:
        raise EmbeddedTextureError("KTX1 texture is not a 2D single-face atlas")
    if gl_type != 0 or gl_type_size != 1 or gl_format != 0:
        raise EmbeddedTextureError("KTX1 texture is not compressed")
    if mipmaps not in (0, 1):
        raise EmbeddedTextureError("KTX1 texture has unsupported mip levels")
    block = _ASTC_BLOCKS.get(internal_format)
    if block is None:
        raise EmbeddedTextureError(f"unsupported ASTC internal format: 0x{internal_format:x}")
    payload_offset = 64 + key_value_size
    if payload_offset + 4 > len(data):
        raise EmbeddedTextureError("KTX1 texture is truncated before its image size")
    image_size = struct.unpack_from("<I", data, payload_offset)[0]
    payload_offset += 4
    payload_end = payload_offset + image_size
    if payload_end > len(data):
        raise EmbeddedTextureError("KTX1 texture image payload is truncated")
    if decoder is None:
        try:
            import texture2ddecoder  # type: ignore[import-not-found]
        except ImportError as exc:
            raise EmbeddedTextureError(
                "inline ASTC atlas requires the pinned texture2ddecoder tool"
            ) from exc
        decoder = texture2ddecoder.decode_astc
    pixels = decoder(data[payload_offset:payload_end], width, height, block[0], block[1])
    expected_size = width * height * 4
    if len(pixels) != expected_size:
        raise EmbeddedTextureError(
            f"ASTC decoder returned {len(pixels)} bytes, expected {expected_size}"
        )
    return Image.frombytes("RGBA", (width, height), pixels), (width, height)


def _embedded_texture_data(sc_file: Path, parser_root: Path) -> bytes:
    """Read the first high-resolution inline TextureData vector from SC5."""
    inner, position = read_sc5_resource_data(sc_file, parser_root)
    from sc5_parser._schemas.sc.flash.SC2.Textures import Textures
    # Resources are size-prefixed in the same order consumed by sc5-parser.
    for _ in range(5):
        if position + 4 > len(inner):
            raise EmbeddedTextureError("SC5 resources are truncated before textures")
        chunk_size = struct.unpack_from("<I", inner, position)[0]
        position += 4 + chunk_size
    if position + 4 > len(inner):
        raise EmbeddedTextureError("SC5 texture chunk is missing")
    texture_chunk_size = struct.unpack_from("<I", inner, position)[0]
    texture_end = position + 4 + texture_chunk_size
    if texture_end > len(inner):
        raise EmbeddedTextureError("SC5 texture chunk is truncated")
    textures = Textures.GetRootAs(bytes(inner[position + 4:texture_end]), 0)
    if textures.TexturesLength() != 1:
        raise EmbeddedTextureError(
            f"SC5 inline atlas requires one texture slot, found {textures.TexturesLength()}"
        )
    highres = textures.Textures(0).Highres()
    if highres is None:
        raise EmbeddedTextureError("SC5 texture slot has no high-resolution data")
    if highres.DataLength() == 0 or highres.ExternalTexture() is not None:
        raise EmbeddedTextureError("SC5 texture slot does not contain inline data")
    data = highres.DataAsNumpy()
    if data is None or isinstance(data, int):
        raise EmbeddedTextureError("SC5 inline texture vector is unavailable")
    return bytes(data)


def load_atlas_source(
    sc,
    sc_file: Path,
    parser_root: Path,
    external_atlas: Path | None,
) -> tuple[Image.Image, AtlasProvenance]:
    """Prefer an exact inline atlas, then fail-closed to a matching external one."""
    sc_hash = hashlib.sha256(sc_file.read_bytes()).hexdigest()
    embedded_error: Exception | None = None
    try:
        texture_data = _embedded_texture_data(sc_file, parser_root)
        image, dimensions = decode_ktx1_astc(texture_data)
        validate_source_atlas(sc, image)
        return image, AtlasProvenance(
            "embedded-sc5",
            sc_hash,
            hashlib.sha256(texture_data).hexdigest(),
            hashlib.sha256(image.tobytes()).hexdigest(),
            dimensions,
        )
    except Exception as exc:
        embedded_error = exc
    if external_atlas is None:
        raise EmbeddedTextureError(
            "no decodable inline SC5 atlas and no external atlas was supplied"
            + (f": {embedded_error}" if embedded_error else "")
        )
    source = Image.open(external_atlas).convert("RGBA")
    validate_source_atlas(sc, source)
    return source, AtlasProvenance(
        "external-file",
        sc_hash,
        hashlib.sha256(external_atlas.read_bytes()).hexdigest(),
        hashlib.sha256(source.tobytes()).hexdigest(),
        source.size,
    )


@dataclass(frozen=True)
class FaceStateMetadata:
    """JSON-safe metadata for one native face state."""

    state: str
    export: str | None
    available: bool
    reason: str | None
    frame_count: int
    fps: int
    start_frame: int
    end_frame: int

    @property
    def duration_ms(self) -> int:
        if self.end_frame < self.start_frame or self.fps <= 0:
            return 0
        return round((self.end_frame - self.start_frame + 1) * 1000 / self.fps)

    def as_json(self) -> dict[str, object]:
        value = asdict(self)
        value["duration_ms"] = self.duration_ms
        return value


def read_face_exports(csv_path: Path) -> tuple[str, ...]:
    """Read official export names from the pinned ``faces.csv`` inventory."""
    with csv_path.open(newline="", encoding="utf-8") as stream:
        rows = csv.DictReader(stream)
        return tuple(
            export
            for row in rows
            if (export := (row.get("ExportName") or "").strip())
            and export.lower() != "string"
        )


def resolve_face_exports(
    export_names: Iterable[str],
    prefix: str,
    states: Mapping[str, Sequence[str]] = FACE_STATE_CANDIDATES,
) -> dict[str, str | None]:
    """Resolve state clips using exact names from the official export list."""
    available = {name for name in export_names}
    return {
        state: next(
            (
                candidate
                for suffix in suffixes
                for candidate in (f"{prefix}_{suffix}",)
                if candidate in available
            ),
            None,
        )
        for state, suffixes in states.items()
    }


def _frame_window(frame_count: int, start: int | None, end: int | None) -> tuple[int, int]:
    if frame_count <= 0:
        return (0, -1)
    first = max(0, start or 0)
    last = frame_count - 1 if end is None or end < 0 else min(frame_count - 1, end)
    return first, last


def face_state_metadata(
    sc,
    state: str,
    export: str | None,
    *,
    start: int | None = None,
    end: int | None = None,
    fallback_fps: int = 30,
) -> FaceStateMetadata:
    """Describe a parser export, including explicit unsupported states."""
    if export is None:
        return FaceStateMetadata(state, None, False, "missing-export", 0, fallback_fps, 0, -1)
    object_id = sc.exports.get(export)
    movie = sc.movie_clip_data.get(object_id) if object_id is not None else None
    if movie is None:
        return FaceStateMetadata(state, export, False, "not-movie-clip", 0, fallback_fps, 0, -1)
    fps = movie.framerate or fallback_fps
    first, last = _frame_window(len(movie.frame_element_counts), start, end)
    if last < first:
        return FaceStateMetadata(state, export, False, "empty-frame-range", len(movie.frame_element_counts), fps, first, last)
    return FaceStateMetadata(state, export, True, None, len(movie.frame_element_counts), fps, first, last)


def catalog_face_metadata(
    sc,
    prefix: str,
    *,
    export_names: Iterable[str] | None = None,
    frame_windows: Mapping[str, tuple[int | None, int | None]] | None = None,
) -> dict[str, dict[str, object]]:
    """Build metadata for all standard viewer states for one source prefix."""
    names = tuple(export_names) if export_names is not None else tuple(sc.exports)
    resolved = resolve_face_exports(names, prefix)
    windows = frame_windows or {}
    return {
        state: face_state_metadata(
            sc,
            state,
            export,
            start=windows.get(state, (None, None))[0],
            end=windows.get(state, (None, None))[1],
        ).as_json()
        for state, export in resolved.items()
    }


def validate_source_atlas(sc, source: Image.Image) -> None:
    """Fail closed unless the atlas dimensions match every SC texture slot."""
    textures = getattr(sc, "textures", ())
    if not textures:
        raise ValueError("SC5 face export has no texture metadata")
    if len(textures) != 1:
        raise ValueError(
            f"SC5 face export requires one texture atlas; found {len(textures)}"
        )
    expected = (textures[0].get("width"), textures[0].get("height"))
    if source.size != expected:
        raise ValueError(
            "source atlas dimensions do not match SC5 metadata: "
            f"got {source.size[0]}x{source.size[1]}, expected {expected[0]}x{expected[1]}"
        )


def dedupe_and_pack(images):
    """Pack identical RGBA frames once; return atlas and (x,y,w,h) records."""
    unique = {}
    records = []
    width = max((image.width for image, _, _ in images), default=1)
    height = 0
    for image, ox, oy in images:
        key = hashlib.sha256(image.tobytes()).digest()
        if key not in unique:
            unique[key] = (0, height, image.width, image.height, image)
            height += image.height
        x, y, w, h, _ = unique[key]
        records.append((x, y, w, h, ox, oy))
    atlas = Image.new("RGBA", (max(1, width), max(1, height)), (0, 0, 0, 0))
    for x, y, _, _, image in unique.values():
        atlas.alpha_composite(image, (x, y))
    return atlas, records


def quad_frames(images, atlas_size, translate=(0.0, 0.0)):
    aw, ah = atlas_size
    tx, ty = translate
    frames = []
    for x, y, w, h, ox, oy in images:
        x0, y0 = ox + tx, oy + ty
        x1, y1 = x0 + w, y0 + h
        u0, v0 = x / aw, y / ah
        u1, v1 = (x + w) / aw, (y + h) / ah
        vertices = [
            (x0, y0, round(u0 * 65535), round(v0 * 65535), _IDENTITY_COLOR),
            (x1, y0, round(u1 * 65535), round(v0 * 65535), _IDENTITY_COLOR),
            (x1, y1, round(u1 * 65535), round(v1 * 65535), _IDENTITY_COLOR),
            (x0, y1, round(u0 * 65535), round(v1 * 65535), _IDENTITY_COLOR),
        ]
        frames.append((vertices, [0, 1, 2, 0, 2, 3]))
    return frames


def atlas_has_visible_rgb(image: Image.Image) -> bool:
    """Return whether any visible atlas pixel carries non-black RGB data."""
    rgba = image.convert("RGBA")
    return any(
        alpha and (red or green or blue)
        for red, green, blue, alpha in rgba.getdata()
    )


def frames_have_color_transform(frames) -> bool:
    """Detect native SC color work that must survive FaceBinary export."""
    vertices = [vertex for frame, _ in frames for vertex in frame]
    has_add = any(any(vertex[4].add) for vertex in vertices)
    has_nonzero_mul = any(any(vertex[4].mul[:3]) for vertex in vertices)
    has_zero_mul = any(not any(vertex[4].mul[:3]) for vertex in vertices)
    return has_add or (has_nonzero_mul and has_zero_mul)


class _IdentityColor:
    mul = (255, 255, 255, 255)
    add = (0, 0, 0)


_IDENTITY_COLOR = _IdentityColor()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("sc_file", type=Path)
    parser.add_argument("export")
    parser.add_argument("atlas", type=Path)
    parser.add_argument("binary", type=Path)
    parser.add_argument("--parser-root", type=Path, required=True)
    parser.add_argument(
        "--source-atlas",
        type=Path,
        default=None,
        help="optional external atlas fallback; dimensions must match SC metadata",
    )
    parser.add_argument("--translate", nargs=2, type=float, default=(0.0, 0.0))
    parser.add_argument("--start-frame", type=int, default=None)
    parser.add_argument("--end-frame", type=int, default=None)
    parser.add_argument(
        "--vector",
        action="store_true",
        help="write the source atlas and vector FaceBinary color transforms",
    )
    parser.add_argument(
        "--fallback-export",
        default=None,
        help="official alternate MovieClip used only when the primary has no native color transforms",
    )
    parser.add_argument("--metadata-output", type=Path, default=None)
    args = parser.parse_args()
    sys.path.insert(0, str(args.parser_root / "src"))
    from sc5_parser.parser import SC5File
    from sc5_parser.render import extract_sprite_with_offset
    sc = SC5File(args.sc_file)
    repair_sc5_export_names(sc, args.sc_file, args.parser_root)
    source, provenance = load_atlas_source(
        sc,
        args.sc_file,
        args.parser_root,
        args.source_atlas,
    )
    if args.vector:
        # The source SC atlas is the authoritative texture.  The vector
        # exporter retains per-vertex colorAdd/colorMultiplier, which is
        # required for native white eyes over an alpha-only face shape.
        frames = _MODULE.flatten_export(sc, args.export)
        selected_export = args.export
        if args.fallback_export:
            fallback_frames = _MODULE.flatten_export(sc, args.fallback_export)
            if not frames_have_color_transform(frames) and frames_have_color_transform(fallback_frames):
                frames = fallback_frames
                selected_export = args.fallback_export
        source.save(args.atlas)
        args.binary.write_bytes(encode_face_binary(frames))
        metadata = face_state_metadata(sc, "export", args.export).as_json()
        metadata.update({
            "export_mode": "vector-source-atlas",
            "selected_export": selected_export,
            "export_object_id": sc.exports[selected_export],
            "export_name_reference_base": 0,
            "atlas_size": list(source.size),
            "translate": [0.0, 0.0],
            "sc_file": str(args.sc_file),
        })
        metadata.update(provenance.as_json())
        if args.metadata_output:
            args.metadata_output.parent.mkdir(parents=True, exist_ok=True)
            args.metadata_output.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
        print(metadata)
        return

    root = sc.movie_clip_data[sc.exports[args.export]]
    first, last = _frame_window(
        len(root.frame_element_counts), args.start_frame, args.end_frame
    )
    rendered = []
    skipped_frames = []
    for frame in range(first, last + 1):
        result = extract_sprite_with_offset(sc, args.export, [source for _ in sc.textures], frame_index=frame)
        if result is not None:
            rendered.append((*result,))
        else:
            skipped_frames.append(frame)
    if not rendered:
        raise SystemExit(f"native face export has no raster frames: {args.export}")
    atlas, packed = dedupe_and_pack(rendered)
    if not atlas_has_visible_rgb(atlas) and any(alpha for *_, alpha in atlas.getdata()):
        raise SystemExit(
            "native face raster is alpha-only; refusing to drop SC colorAdd transforms; use --vector"
        )
    atlas.save(args.atlas)
    args.binary.write_bytes(encode_face_binary(quad_frames(packed, atlas.size, tuple(args.translate))))
    metadata = face_state_metadata(
        sc,
        "export",
        args.export,
        start=first,
        end=last,
    ).as_json()
    metadata.update({
        "selected_export": args.export,
        "export_object_id": sc.exports[args.export],
        "export_name_reference_base": 0,
        "rendered_frames": len(rendered),
        "skipped_frames": skipped_frames,
        "unique_frames": len({hashlib.sha256(image.tobytes()).digest() for image, _, _ in rendered}),
        "atlas_size": list(atlas.size),
        "translate": list(args.translate),
        "sc_file": str(args.sc_file),
    })
    metadata.update(provenance.as_json())
    if args.source_atlas is not None:
        metadata["external_atlas"] = str(args.source_atlas)
    if args.metadata_output:
        args.metadata_output.parent.mkdir(parents=True, exist_ok=True)
        args.metadata_output.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(metadata)


if __name__ == "__main__":
    main()
