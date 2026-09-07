"""Re-verify files that were moved out of the repository against the external archive inventory.

Usage: python tools/verify_archive.py <archive root> [--inventory docs/项目记忆/外部归档清单_20260907.json]

The inventory (machine-readable JSON next to the Markdown list) records, per moved directory, the archive
sub-directory name and every file with its byte size and sha256. This script checks that every listed file exists
under <archive root>/<sub-directory>, has the recorded size and digest, that the counts match, and that the archive
sub-directory holds nothing unlisted. Exit 1 with a message on the first failure; exit 0 with a summary otherwise.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INVENTORY = ROOT / 'docs/项目记忆/外部归档清单_20260907.json'


def verify(archive_root, inventory=INVENTORY):
    archive_root = Path(archive_root)
    inventory = Path(inventory)
    if not inventory.is_file():
        raise SystemExit(f'MISSING inventory {inventory}')
    data = json.loads(inventory.read_text(encoding='utf-8'))
    if data.get('schemaVersion') != 1 or not isinstance(data.get('moves'), list) or not data['moves']:
        raise SystemExit('inventory must have schemaVersion 1 and a non-empty moves list')
    checked = 0
    for move in data['moves']:
        sub = archive_root / move['archiveDir']
        if not sub.is_dir():
            raise SystemExit(f'MISSING archive directory {sub}')
        files = move['files']
        if len(files) != move['count']:
            raise SystemExit(f'{move["archiveDir"]}: inventory lists {len(files)} files but declares count {move["count"]}')
        seen = set()
        for entry in files:
            path = sub / entry['path']
            if not path.is_file():
                raise SystemExit(f'MISSING archived file {move["archiveDir"]}/{entry["path"]}')
            size = path.stat().st_size
            if size != entry['bytes']:
                raise SystemExit(f'SIZE MISMATCH {move["archiveDir"]}/{entry["path"]}: inventory {entry["bytes"]}, file {size}')
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if digest != entry['sha256']:
                raise SystemExit(f'HASH MISMATCH {move["archiveDir"]}/{entry["path"]}: inventory {entry["sha256"][:12]}, file {digest[:12]}')
            seen.add(path.resolve())
            checked += 1
        for path in sub.rglob('*'):
            if path.is_file() and path.resolve() not in seen:
                raise SystemExit(f'UNLISTED file in archive: {move["archiveDir"]}/{path.relative_to(sub).as_posix()}')
    print(f'ARCHIVE OK: {checked} files verified under {archive_root}')
    return checked


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('archive_root', type=Path, help='Directory that contains the archive sub-directories (e.g. worklog/english-for-child/archive)')
    ap.add_argument('--inventory', type=Path, default=INVENTORY)
    args = ap.parse_args()
    verify(args.archive_root, args.inventory)


if __name__ == '__main__':
    main()
