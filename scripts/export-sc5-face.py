#!/usr/bin/env python3
"""Export SC v5 face MovieClips to StatsConnect's native FaceBinary format.

The MIT ``sc5-parser`` checkout is deliberately optional and external.  Pass
its checkout with ``--parser-root`` (pinned in docs/SC5_FACE_EXPORT.md).
"""

from __future__ import annotations

import argparse
import importlib.util
import struct
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class _Color:
    mul: tuple[int, int, int, int] = (255, 255, 255, 255)
    add: tuple[int, int, int] = (0, 0, 0)


def _load_parser(parser_root: Path):
    sys.path.insert(0, str(parser_root / "src"))
    try:
        from sc5_parser.parser import SC5File  # type: ignore[import-not-found]
    except ImportError as exc:
        raise SystemExit(f"cannot import sc5-parser from {parser_root}: {exc}") from exc
    return SC5File


def triangulate_strip(count: int) -> list[tuple[int, int, int]]:
    """Return correctly wound triangles for one SC shape command strip."""
    return [
        (index, index + 1, index + 2)
        if index % 2 == 0
        else (index, index + 2, index + 1)
        for index in range(max(0, count - 2))
    ]


def compose_matrix(parent, child):
    return parent @ child


def apply_matrix(matrix, x: float, y: float) -> tuple[float, float]:
    return (
        matrix.a * x + matrix.b * y + matrix.tx,
        matrix.c * x + matrix.d * y + matrix.ty,
    )


def compose_color(parent: _Color, child) -> _Color:
    """Compose SC's ``new = old * mul / 255 + add`` transforms."""
    child_mul = (child.r_mul, child.g_mul, child.b_mul, child.alpha)
    child_add = (child.r_add, child.g_add, child.b_add)
    mul = tuple((a * b + 127) // 255 for a, b in zip(parent.mul, child_mul))
    add = tuple(
        max(0, min(255, (a * b + 127) // 255 + c))
        for a, b, c in zip(parent.add, child_mul[:3], child_add)
    )
    return _Color(mul=mul, add=add)


def flatten_frame(sc, export_name: str, frame_index: int = 0):
    """Flatten one MovieClip frame into transformed face vertices/indices."""
    if export_name not in sc.exports:
        raise KeyError(f"export not found: {export_name}")
    root_id = sc.exports[export_name]
    root_data = sc.movie_clip_data.get(root_id)
    if root_data is None:
        raise ValueError(f"export is not a MovieClip: {export_name}")
    if frame_index >= len(root_data.frame_element_counts):
        raise ValueError(f"frame {frame_index} out of range for {export_name}")

    vertices: list[tuple[float, float, int, int, _Color]] = []
    indices: list[int] = []

    def visit(object_id: int, matrix, color: _Color, selected_frame: int) -> None:
        for shape_index in sc.shape_id_to_idx.get(object_id, []):
            shape = sc.shapes[shape_index]
            for command in shape["commands"]:
                start = len(vertices)
                for x, y, u, v in command["vertices"]:
                    tx, ty = apply_matrix(matrix, x, y)
                    vertices.append((tx, ty, int(u), int(v), color))
                indices.extend(start + index for tri in triangulate_strip(len(command["vertices"])) for index in tri)

        movie = sc.movie_clip_data.get(object_id)
        if movie is None or not movie.frame_element_counts:
            return
        frame = min(selected_frame, len(movie.frame_element_counts) - 1)
        for element in sc.get_frame_elements(object_id, frame):
            child_id = movie.children_ids[element.child_index]
            child_matrix = sc.get_matrix(object_id, element.matrix_index)
            child_color = sc.get_color(object_id, element.color_index)
            visit(child_id, compose_matrix(matrix, child_matrix), compose_color(color, child_color), frame)

    # Official extraction begins at identity. The parser's matrix bank may
    # contain renderer/root scaling for previews; applying it here changes
    # source game-space coordinates and is not part of FaceBinary export.
    visit(root_id, sc.get_matrix(root_id, 0xFFFF), _Color(), frame_index)
    if not vertices or not indices:
        raise ValueError(f"{export_name} frame {frame_index} contains no triangulated geometry")
    return vertices, indices


def flatten_export(sc, export_name: str):
    """Flatten every frame in an export, preserving the source frame count."""
    root_id = sc.exports.get(export_name)
    if root_id is None or root_id not in sc.movie_clip_data:
        raise ValueError(f"export is not a MovieClip: {export_name}")
    count = len(sc.movie_clip_data[root_id].frame_element_counts)
    return [flatten_frame(sc, export_name, index) for index in range(count)]


def encode_face_binary(frames: Iterable[tuple[list, list]]) -> bytes:
    """Encode the viewer contract: count, then planar LE vertex/index arrays."""
    materialized = list(frames)
    output = bytearray(struct.pack("<I", len(materialized)))
    for vertices, indices in materialized:
        if not vertices or not indices:
            raise ValueError("face frame contains no geometry")
        if len(vertices) > 0xFFFFFFFF or len(indices) > 0xFFFFFFFF:
            raise ValueError("face frame exceeds binary limits")
        if max(indices) >= len(vertices):
            raise ValueError("face index exceeds vertex count")
        output.extend(struct.pack("<II", len(vertices), len(indices)))
        output.extend(struct.pack(f"<{len(vertices) * 2}f", *(value for vertex in vertices for value in vertex[:2])))
        output.extend(struct.pack(f"<{len(vertices) * 2}H", *(max(0, min(65535, value)) for vertex in vertices for value in vertex[2:4])))
        output.extend(bytes(value for vertex in vertices for value in vertex[4].mul))
        output.extend(bytes(value for vertex in vertices for value in vertex[4].add))
        output.extend(struct.pack(f"<{len(indices)}H", *indices))
    return bytes(output)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sc_file", type=Path)
    parser.add_argument("exports", nargs="+", help="MovieClip export names")
    parser.add_argument("--parser-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    SC5File = _load_parser(args.parser_root)
    sc = SC5File(args.sc_file)
    frames = [frame for name in args.exports for frame in flatten_export(sc, name)]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(encode_face_binary(frames))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
