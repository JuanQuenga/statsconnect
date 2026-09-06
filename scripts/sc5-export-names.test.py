import importlib.util
from pathlib import Path
import sys
import unittest

SPEC = importlib.util.spec_from_file_location(
    "sc5_export_names", Path(__file__).with_name("sc5_export_names.py")
)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ExportNamesTest(unittest.TestCase):
    def test_name_references_are_zero_based_not_previous_strings(self):
        strings = ["first_face", "colt_face", "arcade_gameover"]
        self.assertEqual(
            MODULE.resolve_sc5_export_names(strings, [1994, 2552, 19], [1, 2, 0]),
            {"colt_face": 1994, "arcade_gameover": 2552, "first_face": 19},
        )

    def test_rejects_unpaired_or_out_of_range_name_references(self):
        for ids, references in [([1], []), ([1], [1]), ([1], [-1])]:
            with self.assertRaises(ValueError):
                MODULE.resolve_sc5_export_names(["face"], ids, references)


if __name__ == "__main__":
    unittest.main()
