"""External archive inventory: the JSON sidecar must let anyone re-verify the moved files byte for byte."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
import verify_archive

ROOT = Path(__file__).resolve().parents[2]
INVENTORY_MD = ROOT / 'docs/项目记忆/外部归档清单_20260907.md'


def make_archive(temp, files):
    root = Path(temp) / 'archive'
    entries = []
    for rel, data in files.items():
        path = root / 'shots' / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        entries.append({'path': rel, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    inventory = Path(temp) / 'inventory.json'
    inventory.write_text(json.dumps({'schemaVersion': 1, 'movedOn': '2026-09-07',
                                     'moves': [{'source': 'docs/archive/screenshots', 'archiveDir': 'shots', 'count': len(entries), 'files': entries}]}), encoding='utf-8')
    return root, inventory


class VerifyArchiveTests(unittest.TestCase):
    def test_repository_inventory_is_consistent_with_its_markdown(self):
        data = json.loads(verify_archive.INVENTORY.read_text(encoding='utf-8'))
        self.assertEqual(data['schemaVersion'], 1)
        md = INVENTORY_MD.read_text(encoding='utf-8')
        total = 0
        for move in data['moves']:
            self.assertEqual(move['count'], len(move['files']))
            for entry in move['files']:
                self.assertIn(entry['sha256'], md, entry['path'])
                total += 1
        self.assertEqual(total, 109)

    def test_valid_archive_passes(self):
        with tempfile.TemporaryDirectory() as temp:
            root, inventory = make_archive(temp, {'a.png': b'aaa', 'sub/b.png': b'bbbb'})
            self.assertEqual(verify_archive.verify(root, inventory), 2)

    def test_tampered_missing_unlisted_and_count_mismatch_fail(self):
        with tempfile.TemporaryDirectory() as temp:
            root, inventory = make_archive(temp, {'a.png': b'aaa', 'sub/b.png': b'bbbb'})
            (root / 'shots' / 'a.png').write_bytes(b'aa!')
            with self.assertRaisesRegex(SystemExit, 'HASH MISMATCH shots/a.png'):
                verify_archive.verify(root, inventory)
            (root / 'shots' / 'a.png').write_bytes(b'aaaa')
            with self.assertRaisesRegex(SystemExit, 'SIZE MISMATCH shots/a.png'):
                verify_archive.verify(root, inventory)
            (root / 'shots' / 'a.png').write_bytes(b'aaa')
            (root / 'shots' / 'extra.txt').write_bytes(b'x')
            with self.assertRaisesRegex(SystemExit, 'UNLISTED file in archive: shots/extra.txt'):
                verify_archive.verify(root, inventory)
            (root / 'shots' / 'extra.txt').unlink()
            (root / 'shots' / 'sub' / 'b.png').unlink()
            with self.assertRaisesRegex(SystemExit, 'MISSING archived file shots/sub/b.png'):
                verify_archive.verify(root, inventory)
            data = json.loads(inventory.read_text(encoding='utf-8'))
            data['moves'][0]['count'] = 5
            inventory.write_text(json.dumps(data), encoding='utf-8')
            with self.assertRaisesRegex(SystemExit, 'declares count 5'):
                verify_archive.verify(root, inventory)
            data['moves'][0]['count'] = 2
            inventory.write_text(json.dumps(data), encoding='utf-8')
            with self.assertRaisesRegex(SystemExit, 'MISSING archive directory'):
                verify_archive.verify(Path(temp) / 'nowhere', inventory)

    def test_operating_system_metadata_is_ignored_and_reported(self):
        import contextlib, io
        with tempfile.TemporaryDirectory() as temp:
            root, inventory = make_archive(temp, {'a.png': b'aaa'})
            (root / 'shots' / 'Thumbs.db').write_bytes(b'win');(root / 'shots' / '.DS_Store').write_bytes(b'mac')
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(verify_archive.verify(root, inventory), 1)
            self.assertIn('IGNORED operating-system metadata: shots/.DS_Store, shots/Thumbs.db', out.getvalue())

    def test_inventory_schema_is_validated_before_touching_the_archive(self):
        with tempfile.TemporaryDirectory() as temp:
            root, inventory = make_archive(temp, {'a.png': b'aaa', 'b.png': b'bb'})
            good = json.loads(inventory.read_text(encoding='utf-8'))
            def variant(mutate):
                data = json.loads(json.dumps(good)); mutate(data)
                inventory.write_text(json.dumps(data), encoding='utf-8')
                return inventory
            cases = [
                (lambda d: d.__setitem__('schemaVersion', 2), 'schemaVersion'),
                (lambda d: d.__setitem__('moves', []), 'non-empty'),
                (lambda d: d['moves'][0].__setitem__('archiveDir', '../shots'), 'single path segment'),
                (lambda d: d['moves'].append(dict(d['moves'][0])), 'listed twice'),
                (lambda d: d['moves'][0].__setitem__('count', -1), 'non-negative'),
                (lambda d: d['moves'][0].__setitem__('count', True), 'non-negative'),
                (lambda d: d['moves'][0]['files'][0].__setitem__('path', '../escape.png'), 'invalid path'),
                (lambda d: d['moves'][0]['files'][0].__setitem__('path', 'C:/x.png'), 'invalid path'),
                (lambda d: d['moves'][0]['files'][0].__setitem__('bytes', '3'), 'non-negative integer'),
                (lambda d: d['moves'][0]['files'][0].__setitem__('sha256', 'zz'), '64 hex'),
                (lambda d: d['moves'][0]['files'][1].__setitem__('path', 'A.PNG'), 'listed twice'),
                (lambda d: d['moves'][0]['files'][0].pop('bytes'), 'exactly path, bytes and sha256'),
            ]
            for mutate, pattern in cases:
                with self.assertRaisesRegex(SystemExit, pattern, msg=pattern):
                    verify_archive.verify(root, variant(mutate))
            inventory.write_text('{not json', encoding='utf-8')
            with self.assertRaisesRegex(SystemExit, 'not valid JSON'):
                verify_archive.verify(root, inventory)


if __name__ == '__main__':
    unittest.main()
