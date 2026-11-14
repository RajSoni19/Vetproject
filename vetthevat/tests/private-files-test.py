import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("private_files", Path(__file__).resolve().parents[1] / "deploy/ubuntu/private-files.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

@unittest.skipUnless(os.name == "posix", "Production archive uses POSIX O_NOFOLLOW and file permissions")
class PrivateFilesTests(unittest.TestCase):
    def test_roundtrip_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            source = base / "originals"
            source.mkdir()
            name = "a" * 64 + ".original"
            (source / name).write_bytes(b"%PDF-1.4 synthetic invoice")
            (source / ("b" * 64 + ".asset")).write_bytes(b"synthetic image")
            (source / ".upload-00000000-0000-4000-8000-000000000000.tmp").write_bytes(b"unpublished")
            archive = base / "originals.tar"
            self.assertEqual(module.create(source, archive)["objects"], 2)
            self.assertTrue(module.verify(archive, base / "recovery")["restored"])
            self.assertEqual((base / "recovery" / name).read_bytes(), (source / name).read_bytes())
            with self.assertRaises(ValueError):
                module.verify(archive, base / "recovery")

    def test_traversal_links_and_digest_corruption_denied(self):
        for name, kind in [("../escape", tarfile.REGTYPE), ("originals/" + "a" * 64 + ".original", tarfile.SYMTYPE)]:
            with tempfile.TemporaryDirectory() as directory:
                archive = Path(directory) / "unsafe.tar"
                with tarfile.open(archive, "w") as output:
                    member = tarfile.TarInfo(name)
                    member.type = kind
                    member.linkname = "/etc/passwd" if kind == tarfile.SYMTYPE else ""
                    output.addfile(member, io.BytesIO(b""))
                    data = b"{}"
                    member = tarfile.TarInfo("originals-manifest.json")
                    member.size = len(data)
                    output.addfile(member, io.BytesIO(data))
                with self.assertRaises(ValueError):
                    module.verify(archive, Path(directory) / "recovery")
                self.assertFalse((Path(directory) / "recovery").exists())

    def test_hash_mismatch_denied(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "unsafe.tar"
            name = "a" * 64 + ".original"
            with tarfile.open(archive, "w") as output:
                for member_name, data in [("originals/" + name, b"tampered"), ("originals-manifest.json", json.dumps({name: {"bytes": 8, "sha256": "0" * 64}}).encode())]:
                    member = tarfile.TarInfo(member_name)
                    member.size = len(data)
                    output.addfile(member, io.BytesIO(data))
            with self.assertRaises(ValueError):
                module.verify(archive)

if __name__ == "__main__":
    unittest.main()
