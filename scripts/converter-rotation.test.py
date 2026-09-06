"""Exercise the shipped converter patch without installing the converter."""
import pathlib
import unittest


def patched_decoder():
    patch = pathlib.Path(__file__).with_name("patches").joinpath(
        "supercell-flat-converter-continuous-rotation.patch"
    ).read_text()
    start = patch.index("+    @staticmethod")
    end = patch.index("     def __init__", start)
    additions = "\n".join(line[1:] for line in patch[start:end].splitlines() if line.startswith("+"))
    namespace = {}
    exec("class Decoder:\n" + additions, namespace)
    return namespace["Decoder"].decode_base_rotation_component


class OneElementArray:
    # Recent NumPy rejects int(array([value])); .item() is explicit and stable.
    def __init__(self, value):
        self.value = value

    def item(self):
        return self.value


class RotationPatchTests(unittest.TestCase):
    def test_signed_scalar_bits(self):
        decode = patched_decoder()
        self.assertEqual(decode(0), 0)
        self.assertEqual(decode(32767), 1)
        self.assertEqual(decode(32768), -1)
        self.assertAlmostEqual(decode(65535), -1 / 32767)

    def test_array_backed_accessor(self):
        self.assertEqual(patched_decoder()(OneElementArray(32768)), -1)


if __name__ == "__main__":
    unittest.main()
