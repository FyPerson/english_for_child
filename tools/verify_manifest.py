"""Verify a release directory against its manifest.json (used by package() locally and by the CI release job).

Usage: python tools/verify_manifest.py <directory>

Checks: manifest.json parses with schemaVersion 1; every key is a normalized POSIX-relative path (no drive prefix,
no leading slash, no backslash, no empty, `.` or `..` components) and unique even when case-folded; every digest is
64 hex characters; every listed file exists, is a regular file (not a symlink) and its sha256 matches; the directory
holds nothing beyond the listed files and manifest.json. Exit 1 with a message on the first failure.
"""
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

HEX64 = re.compile(r'^[0-9a-f]{64}$')
DRIVE = re.compile(r'^[A-Za-z]:')


def normalized_relative(name):
    if not isinstance(name, str) or not name:
        return False
    if '\\' in name or name.startswith('/') or DRIVE.match(name):
        return False
    return all(part not in ('', '.', '..') for part in name.split('/'))


def verify(directory):
    directory = Path(directory)
    manifest_path = directory / 'manifest.json'
    if not manifest_path.is_file():
        raise SystemExit(f'MISSING {manifest_path}')
    try:
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    except ValueError as error:
        raise SystemExit(f'manifest.json is not valid JSON: {error}')
    files = manifest.get('files') if isinstance(manifest, dict) else None
    if manifest.get('schemaVersion') != 1 or not isinstance(files, dict) or not files:
        raise SystemExit('manifest.json must have schemaVersion 1 and a non-empty files map')
    folded = {}
    listed = set()
    for name, digest in files.items():
        if not normalized_relative(name):
            raise SystemExit(f'manifest.json lists an invalid path: {name!r}')
        if not isinstance(digest, str) or not HEX64.match(digest):
            raise SystemExit(f'manifest.json digest for {name} is not 64 hex characters')
        key = unicodedata.normalize('NFC', name).casefold()
        if key in folded:
            raise SystemExit(f'manifest.json lists {name} and {folded[key]} which collide on case-insensitive file systems')
        folded[key] = name
        path = directory / name
        if path.is_symlink():
            raise SystemExit(f'SYMLINK not allowed in release directory: {name}')
        if not path.is_file():
            raise SystemExit(f'MISSING listed file {name}')
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != digest:
            raise SystemExit(f'HASH MISMATCH {name}: manifest {digest[:12]}, file {actual[:12]}')
        listed.add(path.resolve())
    manifest_resolved = manifest_path.resolve()
    for path in directory.rglob('*'):
        if path.is_symlink():
            raise SystemExit(f'SYMLINK not allowed in release directory: {path.relative_to(directory).as_posix()}')
        if path.is_file() and path.resolve() not in listed and path.resolve() != manifest_resolved:
            raise SystemExit(f'UNLISTED file in release directory: {path.relative_to(directory).as_posix()}')
    print(f'MANIFEST OK: {len(listed)} files verified in {directory}')
    return manifest


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    verify(sys.argv[1])


if __name__ == '__main__':
    main()
