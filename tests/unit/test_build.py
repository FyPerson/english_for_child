"""Build boundaries and release contents; no network and no production mutations."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools'))
import build_lessons
import project
from project_config import load_config

class BuildTests(unittest.TestCase):
    def test_generated_outputs_use_portable_lf(self):
        for name in project.release_files(load_config()):
            self.assertNotIn(b'\r\n',(project.ROOT/name).read_bytes(),name)

    def test_manifest_rejects_ambiguous_order_and_unknown_course(self):
        for config in [dict(schemaVersion=1,weeks=[1,1],courseWeeks=[1],entry='course.html'),
                       dict(schemaVersion=1,weeks=[1],courseWeeks=[1,2],entry='course.html'),
                       dict(schemaVersion=1,weeks=[True],courseWeeks=[1],entry='course.html'),
                       dict(schemaVersion=2,weeks=[1],courseWeeks=[1],entry='course.html')]:
            with tempfile.TemporaryDirectory() as temp:
                path=Path(temp)/'project.json';path.write_text(json.dumps(config))
                with self.assertRaises(ValueError):load_config(path)

    def test_include_cannot_escape_or_cycle(self):
        with tempfile.TemporaryDirectory() as temp,patch.object(build_lessons,'SRC',Path(temp)):
            with self.assertRaises(ValueError):build_lessons.expand('<!-- @include ../secret.js -->')
            (Path(temp)/'loop.js').write_text('<!-- @include loop.js -->')
            with self.assertRaises(ValueError):build_lessons.expand('<!-- @include loop.js -->')

    def test_combined_failure_leaves_previous_week_output_intact(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);src=root/'frontend'/'src';(src/'weeks').mkdir(parents=True)
            (src/'weeks/week01.template.html').write_text('<script>const ok=1;</script>')
            (root/'week01.html').write_text('previous release')
            config={'weeks':[1],'courseWeeks':[1],'entry':'course.html'}
            with patch.object(build_lessons,'ROOT',root),patch.object(build_lessons,'SRC',src),patch.object(build_lessons,'load_config',return_value=config),patch.object(build_lessons.subprocess,'run'),patch.object(build_lessons,'render_course',side_effect=ValueError('broken combined template')),patch.object(sys,'argv',['build_lessons.py']):
                with self.assertRaises(ValueError):build_lessons.main()
            self.assertEqual((root/'week01.html').read_text(),'previous release')

    def test_release_is_reproducible_allowlisted_and_hashed(self):
        with tempfile.TemporaryDirectory() as temp,patch.object(project,'ROOT',Path(temp)):
            root=Path(temp)
            for name in project.release_files(load_config()):(root/name).write_text('fixture '+name)
            (root/'secret.txt').write_text('not for publishing')
            first=project.package();second=project.package()
            self.assertEqual(first,second)
            self.assertRegex(first.name,r'^soundblocks-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:-\d+)?$')
            self.assertIn(first.name,(root/'dist/最新版本.txt').read_text(encoding='utf-8'))
            manifest=json.loads((first/'manifest.json').read_text())
            self.assertEqual(set(p.name for p in first.iterdir()),set(manifest['files'])|{'manifest.json'})
            self.assertNotIn('secret.txt',manifest['files'])
            for name,digest in manifest['files'].items():self.assertEqual(hashlib.sha256((first/name).read_bytes()).hexdigest(),digest)
            (root/'course.html').write_text('new course')
            new=project.package()
            self.assertNotEqual(new,first)
            self.assertIn(new.name,(root/'dist/最新版本.txt').read_text(encoding='utf-8'))
            (first/'extra.txt').write_text('unexpected')
            (root/'course.html').write_text('fixture course.html')
            with self.assertRaises(ValueError):project.package()

if __name__=='__main__':unittest.main()
