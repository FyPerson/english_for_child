"""Baseline contract: falsifiable analysis, wrong-form rejection, create guards, and read-only behaviour."""
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
import baseline

ROOT = Path(__file__).resolve().parents[2]
PNG = base64.b64encode(b'not really a png').decode()
MP3 = base64.b64encode(b'not really an mp3').decode()


def sample(order=baseline.NAMES, extra='', wall_value=None, unterminated=False):
    """A tiny lesson with all seven declarations written in the mixed styles the real media files use."""
    parts = ['<!doctype html><html><body><script>', 'const META = {week: 1};', extra]
    for name in order:
        if name == 'CELEBRATE_NAT':
            parts.append(f"const CELEBRATE_NAT = 'data:image/png;base64,{PNG}';")
        elif name == 'WALL_ILL':
            body = f"  nat:'{wall_value}'" if wall_value else '  /* nothing this week */'
            parts.append('const WALL_ILL = {\n' + body + '\n};')
        elif name in ('PHONEME_AUDIO', 'WORD_AUDIO'):
            parts.append(f'const {name} = {{\n  "a": "data:audio/mpeg;base64,{MP3}",\n  "at": "data:audio/mpeg;base64,{MP3}"\n}};')
        else:
            end = '' if unterminated and name == 'BOOK_IMG' else '\n};'
            parts.append(f"const {name} = {{\n  /* injected */\n  cat:'data:image/png;base64,{PNG}',\n  dog:'data:image/webp;base64,{PNG}'" + end)
    parts.append('</script></body></html>')
    return '\n'.join(parts)


def write(temp, text, name='week01.html'):
    path = Path(temp) / name
    path.write_text(text, encoding='utf-8', newline='\n')
    return path


class AnalyzeTests(unittest.TestCase):
    def test_order_media_and_hashes(self):
        with tempfile.TemporaryDirectory() as temp:
            result = baseline.analyze(write(temp, sample()))
        self.assertEqual(result['declarationOrder'], baseline.NAMES)
        digest = hashlib.sha256(b'not really an mp3').hexdigest()
        self.assertEqual(result['media']['WORD_AUDIO'], [['a', 'audio/mpeg', digest], ['at', 'audio/mpeg', digest]])
        self.assertEqual(result['media']['WALL_ILL'], [])
        self.assertEqual(result['media']['CELEBRATE_NAT'], [['', 'image/png', hashlib.sha256(b'not really a png').hexdigest()]])
        self.assertEqual(result['media']['WORD_ILL'][1][1], 'image/webp')
        self.assertNotEqual(result['sha256'], result['skeletonSha256'])

    def test_duplicate_declaration_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(ValueError, 'WORD_AUDIO'):
                baseline.analyze(write(temp, sample(extra='const WORD_AUDIO = {};')))

    def test_reordered_declarations_change_order_only(self):
        with tempfile.TemporaryDirectory() as temp:
            a = baseline.analyze(write(temp, sample()))
            b = baseline.analyze(write(temp, sample(order=list(reversed(baseline.NAMES)))))
        self.assertNotEqual(a['declarationOrder'], b['declarationOrder'])
        self.assertEqual(a['media'], b['media'])

    def test_unterminated_declaration_fails(self):
        order = [n for n in baseline.NAMES if n != 'BOOK_IMG'] + ['BOOK_IMG']
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(ValueError):
                baseline.analyze(write(temp, sample(order=order, unterminated=True)))

    def test_plain_text_change_alters_skeleton_not_media(self):
        with tempfile.TemporaryDirectory() as temp:
            a = baseline.analyze(write(temp, sample()))
            b = baseline.analyze(write(temp, sample(extra='<!-- one more comment -->')))
        self.assertNotEqual(a['skeletonSha256'], b['skeletonSha256'])
        self.assertEqual(a['media'], b['media'])
        self.assertEqual(a['declarationOrder'], b['declarationOrder'])

    def test_reference_form_lesson_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(ValueError, 'data URI'):
                baseline.analyze(write(temp, sample(wall_value='media/0123456789abcdef.png')))


class FixtureGuardTests(unittest.TestCase):
    def test_reference_form_baseline_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            fixture = Path(temp) / 'baseline.json'
            fixture.write_text(json.dumps({'schemaVersion': 1, 'form': 'reference', 'weeks': {}}), encoding='utf-8')
            with self.assertRaisesRegex(SystemExit, 'form'):
                baseline.load(fixture)

    def test_missing_fixture_is_reported_not_created(self):
        with tempfile.TemporaryDirectory() as temp:
            fixture = Path(temp) / 'baseline.json'
            with self.assertRaisesRegex(SystemExit, 'MISSING'):
                baseline.check(fixture=fixture)
            self.assertFalse(fixture.exists())

    def test_create_refuses_existing_fixture_without_force(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(baseline, 'git') as git, patch.object(baseline.subprocess, 'run') as run:
            fixture = Path(temp) / 'baseline.json'
            fixture.write_text('{}', encoding='utf-8')
            with self.assertRaisesRegex(SystemExit, 'REFUSED'):
                baseline.create(fixture=fixture)
            git.assert_not_called()
            run.assert_not_called()
            self.assertEqual(fixture.read_text(encoding='utf-8'), '{}')

    def test_create_refuses_dirty_tree_before_building(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(baseline, 'git', return_value=' M week01.html'), patch.object(baseline.subprocess, 'run') as run:
            with self.assertRaisesRegex(SystemExit, 'not clean'):
                baseline.create(fixture=Path(temp) / 'baseline.json')
            run.assert_not_called()

    def test_differences_name_the_changed_keys(self):
        entry = {'skeletonSha256': 's', 'declarationOrder': baseline.NAMES,
                 'media': {name: [] for name in baseline.NAMES}}
        entry['media']['WORD_AUDIO'] = [['a', 'audio/mpeg', 'x'], ['at', 'audio/mpeg', 'y']]
        changed = json.loads(json.dumps(entry))
        changed['media']['WORD_AUDIO'][1][2] = 'z'
        self.assertEqual(baseline.differences({'week01.html': entry}, {'week01.html': entry}), [])
        self.assertEqual(baseline.differences({'week01.html': entry}, {'week01.html': changed}),
                         ['week01.html: WORD_AUDIO mime or bytes differ for at'])
        fewer = json.loads(json.dumps(entry))
        fewer['media']['WORD_AUDIO'].pop()
        self.assertIn('keys differ', baseline.differences({'week01.html': entry}, {'week01.html': fewer})[0])
        self.assertIn('not built', baseline.differences({'week01.html': entry}, {})[0])


class ReadOnlyBehaviourTests(unittest.TestCase):
    def test_build_and_check_leave_fixture_untouched(self):
        if not baseline.FIXTURE.exists():
            self.skipTest('baseline fixture not created yet; run `python tools/project.py baseline --create`')
        before = (baseline.FIXTURE.read_bytes(), os.stat(baseline.FIXTURE).st_mtime_ns)
        subprocess.run([sys.executable, 'tools/build_lessons.py'], cwd=ROOT, check=True)
        subprocess.run([sys.executable, 'tools/baseline.py', '--check'], cwd=ROOT, check=True)
        self.assertEqual((baseline.FIXTURE.read_bytes(), os.stat(baseline.FIXTURE).st_mtime_ns), before)


if __name__ == '__main__':
    unittest.main()
