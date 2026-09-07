"""Re-verify files that were moved out of the repository against the external archive inventory.

Usage: python tools/verify_archive.py <archive root> [--inventory docs/项目记忆/外部归档清单_20260907.json]

The inventory (machine-readable JSON next to the Markdown list) records, per moved directory, the archive
sub-directory name and every file with its byte size and sha256. The inventory itself is validated first
(schemaVersion 1; each move has a single-segment archiveDir, unique across moves; count equals the number of
files; every path is a normalized POSIX-relative path that stays inside the archive directory and is unique
even when NFC-normalized and case-folded; bytes is a non-negative integer; sha256 is 64 hex characters).
Then every listed file must exist under <archive root>/<archiveDir> with the recorded size and digest, and the
archive directory must hold nothing unlisted except the operating-system metadata files named in IGNORED
(reported when skipped). Exit 1 with a message on the first failure; exit 0 with a summary otherwise.
"""
import argparse
import hashlib
import json
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from verify_manifest import HEX64, normalized_relative

ROOT = Path(__file__).resolve().parents[1]
INVENTORY = ROOT / 'docs/项目记忆/外部归档清单_20260907.json'
IGNORED = {'Thumbs.db', 'desktop.ini', '.DS_Store'}   # operating-system metadata, never part of the inventory


def _fail(message):
    raise SystemExit('archive inventory invalid: ' + message)


def load_inventory(inventory):
    inventory = Path(inventory)
    if not inventory.is_file():
        raise SystemExit(f'MISSING inventory {inventory}')
    try:
        data = json.loads(inventory.read_text(encoding='utf-8'))
    except ValueError as error:
        _fail(f'not valid JSON ({error})')
    if not isinstance(data, dict) or data.get('schemaVersion') != 1:
        _fail('schemaVersion must be 1')
    moves = data.get('moves')
    if not isinstance(moves, list) or not moves:
        _fail('moves must be a non-empty list')
    dirs = set()
    for index, move in enumerate(moves):
        if not isinstance(move, dict):
            _fail(f'moves[{index}] is not an object')
        sub = move.get('archiveDir')
        if not isinstance(sub, str) or not sub or '/' in sub or '\\' in sub or sub in ('.', '..'):
            _fail(f'moves[{index}].archiveDir must be a single path segment')
        if sub in dirs:
            _fail(f'archiveDir {sub!r} is listed twice')
        dirs.add(sub)
        files = move.get('files')
        count = move.get('count')
        if not isinstance(files, list):
            _fail(f'{sub}: files must be a list')
        if isinstance(count, bool) or not isinstance(count, int) or count < 0:
            _fail(f'{sub}: count must be a non-negative integer')
        if count != len(files):
            _fail(f'{sub}: inventory lists {len(files)} files but declares count {count}')
        seen = set()
        for entry in files:
            if not isinstance(entry, dict) or set(entry) != {'path', 'bytes', 'sha256'}:
                _fail(f'{sub}: every file entry must have exactly path, bytes and sha256')
            path, size, digest = entry['path'], entry['bytes'], entry['sha256']
            if not normalized_relative(path):
                _fail(f'{sub}: invalid path {path!r}')
            if isinstance(size, bool) or not isinstance(size, int) or size < 0:
                _fail(f'{sub}/{path}: bytes must be a non-negative integer')
            if not isinstance(digest, str) or not HEX64.match(digest):
                _fail(f'{sub}/{path}: sha256 must be 64 hex characters')
            key = unicodedata.normalize('NFC', path).casefold()
            if key in seen:
                _fail(f'{sub}: path {path!r} is listed twice (case-insensitively)')
            seen.add(key)
    return data


def verify(archive_root, inventory=INVENTORY):
    archive_root = Path(archive_root)
    data = load_inventory(inventory)
    checked = 0
    ignored = []
    for move in data['moves']:
        sub = archive_root / move['archiveDir']
        if not sub.is_dir():
            raise SystemExit(f'MISSING archive directory {sub}')
        listed = set()
        for entry in move['files']:
            path = sub / entry['path']
            if path.is_symlink():
                raise SystemExit(f'SYMLINK not allowed in archive: {move["archiveDir"]}/{entry["path"]}')
            if not path.is_file():
                raise SystemExit(f'MISSING archived file {move["archiveDir"]}/{entry["path"]}')
            size = path.stat().st_size
            if size != entry['bytes']:
                raise SystemExit(f'SIZE MISMATCH {move["archiveDir"]}/{entry["path"]}: inventory {entry["bytes"]}, file {size}')
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if digest != entry['sha256']:
                raise SystemExit(f'HASH MISMATCH {move["archiveDir"]}/{entry["path"]}: inventory {entry["sha256"][:12]}, file {digest[:12]}')
            listed.add(path.resolve())
            checked += 1
        for path in sub.rglob('*'):
            if not path.is_file() or path.resolve() in listed:
                continue
            rel = f'{move["archiveDir"]}/{path.relative_to(sub).as_posix()}'
            if path.name in IGNORED:
                ignored.append(rel)
                continue
            raise SystemExit(f'UNLISTED file in archive: {rel}')
    if ignored:
        print('IGNORED operating-system metadata: ' + ', '.join(sorted(ignored)), flush=True)
    print(f'ARCHIVE OK: {checked} files verified under {archive_root}', flush=True)
    return checked


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('archive_root', type=Path, help='Directory that contains the archive sub-directories (e.g. worklog/english-for-child/archive)')
    ap.add_argument('--inventory', type=Path, default=INVENTORY)
    args = ap.parse_args()
    verify(args.archive_root, args.inventory)


if __name__ == '__main__':
    main()
