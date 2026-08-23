#!/usr/bin/env python3
import struct
import unittest
import importlib.util
import sys
import tempfile
from unittest import mock
from PIL import Image
from pathlib import Path

_MODULE_SPEC = importlib.util.spec_from_file_location(
    "export_sc5_face", Path(__file__).with_name("export-sc5-face.py")
)
assert _MODULE_SPEC and _MODULE_SPEC.loader
_MODULE = importlib.util.module_from_spec(_MODULE_SPEC)
sys.modules[_MODULE_SPEC.name] = _MODULE
_MODULE_SPEC.loader.exec_module(_MODULE)
_Color = _MODULE._Color
apply_matrix = _MODULE.apply_matrix
compose_color = _MODULE.compose_color
encode_face_binary = _MODULE.encode_face_binary
triangulate_strip = _MODULE.triangulate_strip
_RASTER_SPEC = importlib.util.spec_from_file_location(
    "export_sc5_face_raster", Path(__file__).with_name("export-sc5-face-raster.py")
)
assert _RASTER_SPEC and _RASTER_SPEC.loader
_RASTER = importlib.util.module_from_spec(_RASTER_SPEC)
sys.modules[_RASTER_SPEC.name] = _RASTER
_RASTER_SPEC.loader.exec_module(_RASTER)
catalog_face_metadata = _RASTER.catalog_face_metadata
resolve_face_exports = _RASTER.resolve_face_exports
face_state_metadata = _RASTER.face_state_metadata
read_face_exports = _RASTER.read_face_exports
validate_source_atlas = _RASTER.validate_source_atlas
atlas_has_visible_rgb = _RASTER.atlas_has_visible_rgb
frames_have_color_transform = _RASTER.frames_have_color_transform
decode_ktx1_astc = _RASTER.decode_ktx1_astc
AtlasProvenance = _RASTER.AtlasProvenance
EmbeddedTextureError = _RASTER.EmbeddedTextureError
load_atlas_source = _RASTER.load_atlas_source


class FaceExportTest(unittest.TestCase):
    def test_triangle_strip_winding(self):
        self.assertEqual(triangulate_strip(5), [(0, 1, 2), (1, 3, 2), (2, 3, 4)])

    def test_affine_transform(self):
        class Matrix:
            a, b, c, d, tx, ty = 2, 0, 0, 3, 4, -5
        self.assertEqual(apply_matrix(Matrix(), 2, 3), (8, 4))

    def test_official_extraction_starts_at_identity(self):
        source = Path(__file__).with_name("export-sc5-face.py").read_text(encoding="utf-8")
        self.assertNotIn("_root_matrix", source)
        self.assertIn("sc.get_matrix(root_id, 0xFFFF)", source)

    def test_color_transform(self):
        class Color:
            r_mul, g_mul, b_mul, alpha = 128, 255, 64, 128
            r_add, g_add, b_add = 4, 5, 6
        self.assertEqual(compose_color(_Color(), Color()), _Color((128, 255, 64, 128), (4, 5, 6)))

    def test_planar_little_endian_serialization(self):
        frame = ([(1.5, -2.0, 32768, 65535, _Color())], [0, 0, 0])
        binary = encode_face_binary([frame])
        self.assertEqual(struct.unpack_from("<III", binary, 0), (1, 1, 3))
        self.assertEqual(struct.unpack_from("<2f", binary, 12), (1.5, -2.0))
        self.assertEqual(struct.unpack_from("<2H", binary, 20), (32768, 65535))
        self.assertEqual(binary[-6:], b"\x00\x00\x00\x00\x00\x00")

    def test_raster_deduplication_and_quad_packing(self):
        image = Image.new("RGBA", (4, 3), (255, 255, 255, 255))
        atlas, packed = _RASTER.dedupe_and_pack([(image, 10.0, -20.0), (image.copy(), 10.0, -20.0)])
        self.assertEqual(atlas.size, (4, 3))
        self.assertEqual(packed[0][:4], packed[1][:4])
        frames = _RASTER.quad_frames(packed[:1], atlas.size)
        self.assertEqual(frames[0][0][0][:4], (10.0, -20.0, 0, 0))
        self.assertEqual(frames[0][1], [0, 1, 2, 0, 2, 3])

    def test_mask_aware_frames_keep_offsets_when_pixels_dedupe(self):
        first = Image.new("RGBA", (2, 2), (0, 0, 0, 0))
        first.putpixel((0, 0), (255, 0, 0, 255))
        second = first.copy()
        atlas, records = _RASTER.dedupe_and_pack(
            [(first, 12.5, -30.0), (second, 90.0, -4.0)]
        )
        self.assertEqual(atlas.size, (2, 2))
        self.assertEqual(records[0][:4], records[1][:4])
        self.assertEqual(records[0][4:], (12.5, -30.0))
        self.assertEqual(records[1][4:], (90.0, -4.0))
        frames = _RASTER.quad_frames(records, atlas.size)
        self.assertEqual(frames[0][0][0][2:4], (0, 0))
        self.assertEqual(frames[1][0][0][0:2], (90.0, -4.0))

    def test_alpha_only_face_atlas_is_rejected_in_raster_mode(self):
        alpha_only = Image.new("RGBA", (2, 2), (0, 0, 0, 0))
        alpha_only.putpixel((0, 0), (0, 0, 0, 255))
        self.assertFalse(atlas_has_visible_rgb(alpha_only))

        colored = Image.new("RGBA", (2, 2), (0, 0, 0, 0))
        colored.putpixel((0, 0), (255, 255, 255, 255))
        self.assertTrue(atlas_has_visible_rgb(colored))

    def test_color_add_can_turn_black_face_shape_white(self):
        # The pinned default face atlas may carry black RGB with alpha-only
        # shape pixels; native SC colorAdd supplies the visible white eyes.
        frame = ([(0.0, 0.0, 0, 0, _Color((255, 255, 255, 255), (255, 255, 255)))], [0, 0, 0])
        binary = encode_face_binary([frame])
        self.assertEqual(binary[28:31], bytes((255, 255, 255)))

    def test_alternate_official_face_is_selected_only_for_native_color_transforms(self):
        plain = [([(0.0, 0.0, 0, 0, _Color())], [0, 0, 0])]
        colored = [([(0.0, 0.0, 0, 0, _Color((255, 255, 255, 255), (1, 0, 0)))], [0, 0, 0])]
        self.assertFalse(frames_have_color_transform(plain))
        self.assertTrue(frames_have_color_transform(colored))

    def test_state_resolution_is_exact_and_missing_is_explicit(self):
        exports = ("crow_def_face", "crow_def_happy", "crow_def_sad")
        resolved = resolve_face_exports(exports, "crow_def")
        self.assertEqual(resolved["idle"], "crow_def_face")
        self.assertEqual(resolved["lobby"], "crow_def_happy")
        self.assertEqual(resolved["lose"], "crow_def_sad")
        self.assertIsNone(resolve_face_exports(exports, "missing")["idle"])

    def test_face_inventory_reader_discards_schema_sentinel(self):
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", newline="", delete=False) as stream:
            stream.write('"Name","FileName","ExportName"\n')
            stream.write('"String","String","String"\n')
            stream.write('"CrowFace","characters.sc","crow_def_face"\n')
            path = stream.name
        self.assertEqual(read_face_exports(Path(path)), ("crow_def_face",))
        Path(path).unlink()

    def test_frame_timing_and_missing_movie_clip_metadata(self):
        class Movie:
            frame_element_counts = [1, 1, 1, 1, 1]
            framerate = 30

        class FakeScene:
            exports = {"crow_def_face": 7, "not_movie": 8}
            movie_clip_data = {7: Movie()}

        available = face_state_metadata(FakeScene(), "idle", "crow_def_face", start=1, end=3)
        self.assertTrue(available.available)
        self.assertEqual(available.frame_count, 5)
        self.assertEqual(available.start_frame, 1)
        self.assertEqual(available.end_frame, 3)
        self.assertEqual(available.duration_ms, 100)
        missing = face_state_metadata(FakeScene(), "idle", None)
        self.assertFalse(missing.available)
        self.assertEqual(missing.reason, "missing-export")
        invalid = face_state_metadata(FakeScene(), "idle", "not_movie")
        self.assertFalse(invalid.available)
        self.assertEqual(invalid.reason, "not-movie-clip")

    def test_catalog_metadata_reports_native_states_and_fps(self):
        class Movie:
            frame_element_counts = [1, 1]
            framerate = 24

        class FakeScene:
            exports = {"shelly_face": 1, "shelly_happy": 2}
            movie_clip_data = {1: Movie(), 2: Movie()}

        metadata = catalog_face_metadata(FakeScene(), "shelly")
        self.assertEqual(metadata["idle"]["export"], "shelly_face")
        self.assertEqual(metadata["lobby"]["export"], "shelly_happy")
        self.assertEqual(metadata["idle"]["fps"], 24)
        self.assertFalse(metadata["lose"]["available"])

    def test_atlas_pairing_fails_closed_on_missing_or_mismatched_source(self):
        class FakeScene:
            textures = [{"width": 4, "height": 3}]

        validate_source_atlas(FakeScene(), Image.new("RGBA", (4, 3)))
        with self.assertRaisesRegex(ValueError, "dimensions"):
            validate_source_atlas(FakeScene(), Image.new("RGBA", (5, 3)))

        class MultiTextureScene:
            textures = [{"width": 4, "height": 3}, {"width": 4, "height": 3}]

        with self.assertRaisesRegex(ValueError, "one texture atlas"):
            validate_source_atlas(MultiTextureScene(), Image.new("RGBA", (4, 3)))

    def test_inline_astc_ktx_decoding_is_path_independent(self):
        width, height = 2, 1
        payload = b"compressed-astc-block"
        fields = struct.pack(
            "<13I",
            0x04030201,
            0,
            1,
            0,
            0x93B0,
            0x1908,
            width,
            height,
            0,
            0,
            1,
            1,
            0,
        )
        ktx = b"\xABKTX 11\xBB\r\n\x1A\n" + fields + struct.pack("<I", len(payload)) + payload

        def fake_decoder(data, decoded_width, decoded_height, block_width, block_height):
            self.assertEqual(data, payload)
            self.assertEqual((decoded_width, decoded_height), (width, height))
            self.assertEqual((block_width, block_height), (4, 4))
            return bytes((255, 0, 0, 255, 0, 255, 0, 255))

        image, dimensions = decode_ktx1_astc(ktx, decoder=fake_decoder)
        self.assertEqual(dimensions, (2, 1))
        self.assertEqual(image.getpixel((0, 0)), (255, 0, 0, 255))
        self.assertEqual(image.getpixel((1, 0)), (0, 255, 0, 255))

    def test_inline_astc_ktx_rejects_malformed_or_non_astc_input(self):
        with self.assertRaisesRegex(EmbeddedTextureError, "KTX1"):
            decode_ktx1_astc(b"not-a-texture")
        fields = struct.pack(
            "<13I", 0x04030201, 0, 1, 0, 0x8058, 0x1908, 2, 1, 0, 0, 1, 1, 0
        )
        ktx = b"\xABKTX 11\xBB\r\n\x1A\n" + fields + struct.pack("<I", 1) + b"x"
        with self.assertRaisesRegex(EmbeddedTextureError, "ASTC"):
            decode_ktx1_astc(ktx)

    def test_atlas_provenance_records_stable_hashes(self):
        provenance = AtlasProvenance(
            "embedded-sc5", "sc-hash", "texture-hash", "atlas-hash", (2040, 2880)
        )
        self.assertEqual(provenance.as_json()["atlas_origin"], "embedded-sc5")
        self.assertEqual(provenance.as_json()["source_atlas_dimensions"], [2040, 2880])
        self.assertEqual(provenance.as_json()["source_texture_sha256"], "texture-hash")

    def test_external_fallback_is_dimension_checked_and_path_independent(self):
        class FakeScene:
            textures = [{"width": 2, "height": 1}]

        with tempfile.TemporaryDirectory() as temp_dir:
            sc_path = Path(temp_dir) / "characters.sc"
            atlas_path = Path(temp_dir) / "atlas.png"
            sc_path.write_bytes(b"local-sc-fixture")
            Image.new("RGBA", (2, 1), (255, 0, 0, 255)).save(atlas_path)
            with mock.patch.object(
                _RASTER,
                "_embedded_texture_data",
                side_effect=EmbeddedTextureError("fixture has no inline texture"),
            ):
                image, provenance = load_atlas_source(
                    FakeScene(), sc_path, Path(temp_dir), atlas_path
                )
                self.assertEqual(image.size, (2, 1))
                self.assertEqual(provenance.origin, "external-file")

            bad_atlas = Path(temp_dir) / "bad.png"
            Image.new("RGBA", (3, 1), (255, 0, 0, 255)).save(bad_atlas)
            with self.assertRaisesRegex(ValueError, "dimensions"):
                load_atlas_source(FakeScene(), sc_path, Path(temp_dir), bad_atlas)


if __name__ == "__main__":
    unittest.main()
