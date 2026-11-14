#!/usr/bin/env python3
"""Validate archive paths/hashes before extracting. Never starts a service."""
import hashlib,json,os,pathlib,sys,tarfile
archive,target,expected=sys.argv[1:4]
if len(expected)!=64 or any(c not in '0123456789abcdef' for c in expected): raise SystemExit('Invalid expected archive hash')
with open(archive,'rb') as f:
    if hashlib.file_digest(f,'sha256').hexdigest()!=expected: raise SystemExit('Archive checksum mismatch')
destination=pathlib.Path(target)
if destination.exists(): raise SystemExit('New empty release path required')
with tarfile.open(archive,'r:gz') as tar:
    members=tar.getmembers(); regular={}; total=0
    for member in members:
        p=pathlib.PurePosixPath(member.name)
        if p.is_absolute() or '..' in p.parts or member.issym() or member.islnk() or not(member.isfile() or member.isdir()): raise SystemExit('Unsafe archive member')
        if any(part.startswith('.env') for part in p.parts) or p.suffix in ('.pem','.key','.p12','.pfx'): raise SystemExit('Credential file in release')
        if member.isfile():
            key=str(p)
            if key in regular: raise SystemExit('Duplicate artifact file')
            total+=member.size
            if total>2_000_000_000: raise SystemExit('Artifact size limit')
            regular[key]=member
    if 'checksums.json' not in regular: raise SystemExit('Artifact manifest missing')
    manifest=json.load(tar.extractfile(regular['checksums.json']))
    if set(manifest)!=set(regular)-{'checksums.json'}: raise SystemExit('Artifact manifest file mismatch')
    for name,digest in manifest.items():
        if hashlib.file_digest(tar.extractfile(regular[name]),'sha256').hexdigest()!=digest: raise SystemExit('Artifact content checksum mismatch')
    destination.mkdir(parents=False,mode=0o755)
    if hasattr(tarfile, 'data_filter'):
        tar.extractall(destination, filter='data')
    else:
        tar.extractall(destination)
for directory,dirs,files in os.walk(destination):
    os.chmod(directory,0o755)
    for name in files: os.chmod(pathlib.Path(directory)/name,0o644)
print('Archive paths and all content checksums verified; no service started')
