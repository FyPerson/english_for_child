"""Verify a release directory against its manifest.json (used by package() locally and by the CI release job).

Usage: python tools/verify_manifest.py <directory>

Checks: manifest.json parses with schemaVersion 1; every listed file exists and its sha256 matches; the directory
holds nothing beyond the listed files and manifest.json (nested paths are POSIX-relative). Exit 1 with a message on
the first failure, exit 0 with a summary otherwise.
"""
import hashlib
import json
import sys
from pathlib import Path


def verify(directory):
    directory = Path(directory)
    manifest_path = directory / 'manifest.json'
    if not manifest_path.is_file():
        raise SystemExit(f'MISSING {manifest_path}')
    try:
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    except ValueError as error:
        raise SystemExit(f'manifest.json is not valid JSON: {error}')
    if manifest.get('schemaVersion') != 1 or not isinstance(manifest.get('files'), dict) or not manifest['files']:
        raise SystemExit('manifest.json must have schemaVersion 1 and a non-empty files map')
    listed = set()
    for name, digest in manifest['files'].items():
        if '\\' in name or name.startswith('/') or '..' in name.split('/'):
            raise SystemExit(f'manifest.json lists an invalid path: {name}')
        path = directory / name
        if not path.is_file():
            raise SystemExit(f'MISSING listed file {name}')
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != digest:
            raise SystemExit(f'HASH MISMATCH {name}: manifest {digest[:12]}, file {actual[:12]}')
        listed.add(path.resolve())
    manifest_resolved = manifest_path.resolve()
    for path in directory.rglob('*'):
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
