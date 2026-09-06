import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location(
    "read_brawl_animation_metadata", Path(__file__).with_name("read-brawl-animation-metadata.py")
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class AnimationMetadataTest(unittest.TestCase):
    def document(self, animation):
        return {"extensions": {"SC_odin_format": {"animation": animation}}}

    def test_preserves_source_rate_instead_of_assuming_sixty(self):
        self.assertEqual(MODULE.animation_metadata(self.document({"frameRate": 24})), {"fps": 24})
        self.assertEqual(MODULE.animation_metadata(self.document({"frameRate": 30})), {"fps": 30})

    def test_uses_converter_thirty_fps_default_only_for_an_animation_descriptor(self):
        for animation in [{}, {"frameRate": 0}, {"frameRate": None}]:
            self.assertEqual(MODULE.animation_metadata(self.document(animation)), {"fps": 30})
        for document in [{}, {"extensions": {}}, self.document(None)]:
            with self.assertRaisesRegex(ValueError, "animation descriptor"):
                MODULE.animation_metadata(document)

    def test_rejects_invalid_frame_rates(self):
        for rate in [-1, float("nan"), float("inf"), "30", True]:
            with self.assertRaisesRegex(ValueError, "frame rate"):
                MODULE.animation_metadata(self.document({"frameRate": rate}))


if __name__ == "__main__":
    unittest.main()
