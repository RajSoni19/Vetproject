#!/usr/bin/env python3
"""Immutable original/asset archive. No symlinks, traversal, overwrite or secrets."""
import hashlib
import io
import json
import os
from pathlib import Path
import re
import stat
import sys
import tarfile

NAME = re.compile(r"[a-f0-9]{64}\.(original|asset)\Z")
LIMIT = 10 * 1024 * 1024

def create(root, output):
    root, output = Path(root), Path(output)
    if root.is_symlink() or not root.is_dir() or root.resolve() != root.absolute():
        raise ValueError("Unsafe originals directory")
    manifest = {}
    with output.open("xb") as destination, tarfile.open(fileobj=destination, mode="w") as archive:
        os.fchmod(destination.fileno(), 0o600)
        for entry in sorted(root.iterdir()):
            if re.fullmatch(r"\.upload-[a-f0-9-]{36}\.tmp", entry.name):
                continue  # unpublished writes cannot be referenced by committed DB rows
            if not NAME.fullmatch(entry.name):
                raise ValueError("Unexpected private object name")
            with os.fdopen(os.open(entry, os.O_RDONLY | os.O_NOFOLLOW), "rb") as source:
                info = os.fstat(source.fileno())
                if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= LIMIT:
                    raise ValueError("Unsafe private object")
                data = source.read(LIMIT + 1)
                if len(data) != info.st_size:
                    raise ValueError("Private object changed during backup")
                digest = hashlib.sha256(data).hexdigest()
                manifest[entry.name] = {"sha256": digest, "bytes": len(data)}
                member = tarfile.TarInfo("originals/" + entry.name)
                member.size, member.mode = len(data), 0o600
                archive.addfile(member, io.BytesIO(data))
        data = json.dumps(manifest, sort_keys=True).encode()
        member = tarfile.TarInfo("originals-manifest.json")
        member.size, member.mode = len(data), 0o600
        archive.addfile(member, io.BytesIO(data))
    return verify(output)

def verify(archive_path, destination=None):
    # Validate every member and digest before creating the fresh recovery path.
    with tarfile.open(archive_path, "r:") as archive:
        members = archive.getmembers()
        names = [member.name for member in members]
        if len(names) != len(set(names)) or names.count("originals-manifest.json") != 1:
            raise ValueError("Missing/duplicate originals manifest")
        for member in members:
            if not member.isfile() or member.size < 0:
                raise ValueError("Links/special files refused")
            if member.name == "originals-manifest.json":
                if member.size > 32 * 1024 * 1024:
                    raise ValueError("Manifest too large")
            elif not member.name.startswith("originals/") or not NAME.fullmatch(member.name[10:]) or not 0 < member.size <= LIMIT:
                raise ValueError("Unsafe original archive member")
        manifest = json.load(archive.extractfile("originals-manifest.json"))
        if set(names) != {"originals-manifest.json"} | {"originals/" + name for name in manifest}:
            raise ValueError("Manifest inventory mismatch")
        for name, expected in manifest.items():
            data = archive.extractfile("originals/" + name).read(LIMIT + 1)
            if len(data) != expected["bytes"] or hashlib.sha256(data).hexdigest() != expected["sha256"]:
                raise ValueError("Private original integrity mismatch")
        if destination is not None:
            target = Path(destination)
            if target.exists() or target.is_symlink() or target.parent.resolve() != target.parent.absolute():
                raise ValueError("New, nonredirected restore directory required")
            target.mkdir(mode=0o700)
            for name in manifest:
                with (target / name).open("xb") as output:
                    os.fchmod(output.fileno(), 0o600)
                    output.write(archive.extractfile("originals/" + name).read(LIMIT + 1))
    return {"objects": len(manifest), "verified": True, "restored": destination is not None}

if __name__ == "__main__":
    try:
        operation = sys.argv[1]
        if operation == "create":
            result = create(sys.argv[2], sys.argv[3])
        elif operation == "verify":
            result = verify(sys.argv[2])
        elif operation == "restore":
            target = sys.argv[3]
            if not re.fullmatch(r"/var/lib/vetthevat-restore-drill-[a-z0-9_-]+", target) or os.getenv("VTV_FILES_RESTORE_APPROVED_TARGET") != target or sys.argv[4:] != ["--apply"]:
                raise ValueError("Exact separately approved fresh file-recovery target required")
            result = verify(sys.argv[2], target)
        else:
            raise ValueError("Unknown private files operation")
        print(json.dumps(result))
    except Exception:
        sys.exit("Private originals archive operation refused/failed; existing files were not overwritten.")
