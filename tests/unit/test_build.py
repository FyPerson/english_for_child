"""Build boundaries and release contents; no network and no production mutations."""
import hashlib
import json
import subprocess
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools'))
import build_lessons
import project
import verify_manifest
from project_config import BUILD, load_config

TOOLS=Path(__file__).resolve().parents[2]/'tools'
BUDGET={'week':8,'course':20}


def fake_build_env(root,weeks=(1,)):
    """A temporary ROOT whose build() renders without node: templates are trivial and validators are stubbed."""
    src=root/'frontend'/'src';(src/'weeks').mkdir(parents=True)
    for n in weeks:(src/f'weeks/week{n:02}.template.html').write_text(f'<script>const week={n};</script>')
    config={'schemaVersion':1,'weeks':list(weeks),'courseWeeks':[1],'entry':'course.html','sizeBudgetMB':BUDGET}
    return src,config


def patched_build(root,src,config,**extra):
    defaults=dict(ROOT=root,BUILD=root/'build',SRC=src,load_config=lambda:config,render_course=lambda lessons:'<html>course</html>')
    defaults.update(extra)
    return patch.multiple(build_lessons,**defaults),patch.object(build_lessons.subprocess,'run')


class BuildTests(unittest.TestCase):
    def test_generated_outputs_use_portable_lf(self):
        for name in project.release_files(load_config()):
            self.assertNotIn(b'\r\n',(BUILD/name).read_bytes(),name)

    def test_manifest_rejects_ambiguous_order_unknown_course_and_missing_budget(self):
        base=dict(schemaVersion=1,weeks=[1],courseWeeks=[1],entry='course.html',sizeBudgetMB=BUDGET)
        for config,pattern in [(dict(base,weeks=[1,1]),'consecutive'),(dict(base,courseWeeks=[1,2]),'included'),
                               (dict(base,weeks=[True]),'week numbers'),(dict(base,schemaVersion=2),'schema'),
                               ({k:v for k,v in base.items() if k!='sizeBudgetMB'},'sizeBudgetMB')]:
            with tempfile.TemporaryDirectory() as temp:
                path=Path(temp)/'project.json';path.write_text(json.dumps(config))
                with self.assertRaisesRegex(ValueError,pattern):load_config(path)

    def test_include_cannot_escape_or_cycle(self):
        with tempfile.TemporaryDirectory() as temp,patch.object(build_lessons,'SRC',Path(temp)):
            with self.assertRaises(ValueError):build_lessons.expand('<!-- @include ../secret.js -->')
            (Path(temp)/'loop.js').write_text('<!-- @include loop.js -->')
            with self.assertRaises(ValueError):build_lessons.expand('<!-- @include loop.js -->')

    def test_build_replaces_the_directory_as_a_whole(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);src,config=fake_build_env(root)
            build=root/'build';build.mkdir()
            (build/'stale.html').write_text('left over from an older build')
            (build/'week01.html').write_text('previous release')
            a,b=patched_build(root,src,config)
            with a,b:build_lessons.build()
            self.assertEqual(sorted(p.name for p in build.iterdir()),['course.html','index.html','week01.html'])
            self.assertIn('const week=1',(build/'week01.html').read_text())
            self.assertEqual([p.name for p in root.iterdir() if p.name.startswith('.build')],[],'no staging or old directory left behind')

    def test_combined_failure_leaves_previous_output_intact(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);src,config=fake_build_env(root)
            build=root/'build';build.mkdir()
            (build/'week01.html').write_text('previous release');(build/'stale.html').write_text('still here')
            def broken(lessons):raise ValueError('broken combined template')
            a,b=patched_build(root,src,config,render_course=broken)
            with a,b:
                with self.assertRaises(ValueError):build_lessons.build()
            self.assertEqual((build/'week01.html').read_text(),'previous release')
            self.assertTrue((build/'stale.html').exists())
            self.assertEqual([p.name for p in root.iterdir() if p.name.startswith('.build')],[])

    def test_failed_swap_restores_the_previous_directory(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);src,config=fake_build_env(root)
            build=root/'build';build.mkdir();(build/'week01.html').write_text('previous release')
            real_rename=Path.rename
            def failing_rename(self,target):
                if self.name.startswith('.build.tmp-'):raise OSError('simulated locked directory')
                return real_rename(self,target)
            a,b=patched_build(root,src,config)
            with a,b,patch.object(Path,'rename',failing_rename):
                with self.assertRaisesRegex(SystemExit,'previous build was restored'):build_lessons.build()
            self.assertEqual((build/'week01.html').read_text(),'previous release')
            self.assertEqual([p.name for p in root.iterdir() if p.name.startswith('.build')],[])

    def test_failed_rollback_is_reported_with_the_old_directory_path(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);src,config=fake_build_env(root)
            build=root/'build';build.mkdir();(build/'week01.html').write_text('previous release')
            real_rename=Path.rename
            def failing_rename(self,target):
                if self.name.startswith('.build.tmp-') or self.name.startswith('.build.old-'):raise OSError('simulated lock')
                return real_rename(self,target)
            a,b=patched_build(root,src,config)
            with a,b,patch.object(Path,'rename',failing_rename):
                with self.assertRaisesRegex(SystemExit,r'restoring the previous build ALSO failed .*it is still at .*\.build\.old-'):build_lessons.build()
            old=[p for p in root.iterdir() if p.name.startswith('.build.old-')]
            self.assertEqual(len(old),1);self.assertEqual((old[0]/'week01.html').read_text(),'previous release')

    def test_undeletable_old_directory_is_reported_not_hidden(self):
        import contextlib,io
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);src,config=fake_build_env(root)
            build=root/'build';build.mkdir();(build/'week01.html').write_text('previous release')
            a,b=patched_build(root,src,config);out=io.StringIO()
            with a,b,patch.object(build_lessons.shutil,'rmtree',lambda *args,**kw:None),contextlib.redirect_stdout(out):
                build_lessons.build()
            self.assertIn('could not be deleted',out.getvalue())
            self.assertEqual(len([p for p in root.iterdir() if p.name.startswith('.build.old-')]),1)
            self.assertIn('const week=1',(build/'week01.html').read_text())

    def test_single_week_build_requires_an_explicit_output_directory(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);src,config=fake_build_env(root,weeks=(1,2))
            a,b=patched_build(root,src,config)
            with a,b:
                with self.assertRaisesRegex(SystemExit,'--output-dir'):build_lessons.build(week=1)
                out=root/'partial';build_lessons.build(output_dir=out,week=2)
            self.assertEqual(sorted(p.name for p in out.iterdir()),['course.html','index.html','week02.html'])
            self.assertFalse((root/'build').exists())

    def test_release_is_reproducible_allowlisted_and_hashed(self):
        with tempfile.TemporaryDirectory() as temp,patch.object(project,'ROOT',Path(temp)),patch.object(project,'BUILD',Path(temp)/'build'):
            root=Path(temp);(root/'build').mkdir()
            for name in project.release_files(load_config()):(root/'build'/name).write_text('fixture '+name)
            (root/'build'/'secret.txt').write_text('not for publishing')
            with self.assertRaisesRegex(SystemExit,'outside the release allowlist: secret.txt'):project.package()
            self.assertEqual(list((root/'dist').glob('soundblocks-*')) if (root/'dist').exists() else [],[])
            (root/'build'/'secret.txt').unlink()
            first=project.package();second=project.package()
            self.assertEqual(first,second)
            self.assertRegex(first.name,r'^soundblocks-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:-\d+)?$')
            self.assertIn(first.name,(root/'dist/最新版本.txt').read_text(encoding='utf-8'))
            manifest=json.loads((first/'manifest.json').read_text())
            self.assertEqual(set(p.name for p in first.iterdir()),set(manifest['files'])|{'manifest.json'})
            for name,digest in manifest['files'].items():self.assertEqual(hashlib.sha256((first/name).read_bytes()).hexdigest(),digest)
            (root/'build'/'course.html').write_text('new course')
            new=project.package()
            self.assertNotEqual(new,first)
            self.assertIn(new.name,(root/'dist/最新版本.txt').read_text(encoding='utf-8'))
            (first/'extra.txt').write_text('unexpected')
            (root/'build'/'course.html').write_text('fixture course.html')
            with self.assertRaises(ValueError):project.package()
            (first/'extra.txt').unlink();(root/'build'/'index.html').unlink()
            with self.assertRaisesRegex(SystemExit,'MISSING products'):project.package()
            self.assertEqual([p.name for p in (root/'dist').iterdir() if p.name.startswith('.staging')],[])

    def test_package_failure_leaves_no_half_written_version(self):
        with tempfile.TemporaryDirectory() as temp,patch.object(project,'ROOT',Path(temp)),patch.object(project,'BUILD',Path(temp)/'build'):
            root=Path(temp);(root/'build').mkdir()
            for name in project.release_files(load_config()):(root/'build'/name).write_text('fixture '+name)
            with patch.object(project,'verify',side_effect=SystemExit('simulated verify failure')):
                with self.assertRaisesRegex(SystemExit,'simulated'):project.package()
            self.assertEqual([p.name for p in (root/'dist').iterdir()],[])

    def test_verify_manifest_accepts_release_and_rejects_tampering(self):
        with tempfile.TemporaryDirectory() as temp,patch.object(project,'ROOT',Path(temp)),patch.object(project,'BUILD',Path(temp)/'build'):
            root=Path(temp);(root/'build').mkdir()
            for name in project.release_files(load_config()):(root/'build'/name).write_text('fixture '+name)
            target=project.package()
            self.assertEqual(set(verify_manifest.verify(target)['files']),set(project.release_files(load_config())))
            cli=subprocess.run([sys.executable,str(TOOLS/'verify_manifest.py'),str(target)],capture_output=True,text=True,encoding='utf-8')
            self.assertEqual(cli.returncode,0,cli.stderr)
            (target/'week01.html').write_text('tampered')
            with self.assertRaisesRegex(SystemExit,'HASH MISMATCH week01.html'):verify_manifest.verify(target)
            (target/'week01.html').write_text('fixture week01.html')
            (target/'notes.txt').write_text('stray')
            with self.assertRaisesRegex(SystemExit,'UNLISTED file in release directory: notes.txt'):verify_manifest.verify(target)
            (target/'notes.txt').unlink();(target/'index.html').unlink()
            with self.assertRaisesRegex(SystemExit,'MISSING listed file index.html'):verify_manifest.verify(target)
            with self.assertRaisesRegex(SystemExit,'MISSING'):verify_manifest.verify(root/'build')

    def test_verify_manifest_rejects_bad_paths_digests_and_case_collisions(self):
        digest='0'*64
        with tempfile.TemporaryDirectory() as temp:
            target=Path(temp)
            def manifest(files):
                (target/'manifest.json').write_text(json.dumps({'schemaVersion':1,'release':'x','files':files}),encoding='utf-8')
            for name in ['C:/week01.html','/week01.html','week\\01.html','./week01.html','a/../week01.html','a//b.html','']:
                manifest({name:digest})
                with self.assertRaisesRegex(SystemExit,'invalid path',msg=name):verify_manifest.verify(target)
            manifest({'week01.html':'zz'})
            with self.assertRaisesRegex(SystemExit,'not 64 hex'):verify_manifest.verify(target)
            (target/'week01.html').write_bytes(b'x');(target/'WEEK01.HTML').write_bytes(b'x')
            h=hashlib.sha256(b'x').hexdigest()
            manifest({'week01.html':h,'WEEK01.HTML':h})
            with self.assertRaisesRegex(SystemExit,'collide on case-insensitive'):verify_manifest.verify(target)
            import unicodedata
            nfc,nfd=unicodedata.normalize('NFC','café.html'),unicodedata.normalize('NFD','café.html')
            self.assertNotEqual(nfc,nfd)
            (target/nfc).write_bytes(b'x')
            manifest({nfc:h,nfd:h})   # NFC and NFD spellings of the same name
            with self.assertRaisesRegex(SystemExit,'collide on case-insensitive'):verify_manifest.verify(target)

    def test_existing_release_directory_is_checked_recursively(self):
        with tempfile.TemporaryDirectory() as temp,patch.object(project,'ROOT',Path(temp)),patch.object(project,'BUILD',Path(temp)/'build'):
            root=Path(temp);(root/'build').mkdir()
            for name in project.release_files(load_config()):(root/'build'/name).write_text('fixture '+name)
            first=project.package()
            (first/'nested').mkdir();(first/'nested'/'stray.txt').write_text('deep')
            with self.assertRaisesRegex(ValueError,'nested/stray.txt'):project.package()


if __name__=='__main__':unittest.main()
