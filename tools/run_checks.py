"""Single check entry. Missing dependencies and skipped suites are never reported as passes.

Order (engineering plan v1.3 §3.4): ① build into build/; ② build again into a temporary directory and compare
every product byte for byte (reproducible build); ③ compare the four delivered weeks with the single-file
baseline; ④ the remaining unit and browser suites. A failed step stops the run; temporary directories are
removed whether the run passes or fails.
"""
import argparse
import hashlib
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
from project_config import ROOT, BUILD, load_config
from build_lessons import product_names


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def reproducible(temp):
    """② The products in build/ must equal a fresh build in `temp`, with no extra files in build/."""
    names = product_names(load_config())
    extra = sorted(p.name for p in BUILD.iterdir())
    extra = [n for n in extra if n not in names]
    if extra:
        raise SystemExit('build/ contains files the build did not produce: ' + ', '.join(extra))
    for name in names:
        a, b = sha256(BUILD / name), sha256(Path(temp) / name)
        if a != b:
            raise SystemExit(f'NOT REPRODUCIBLE: {name} differs between two builds ({a[:12]} vs {b[:12]})')
    print(f'REPRODUCIBLE: {len(names)} products identical across two builds', flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--quick', action='store_true', help='Build/data/syntax/unit checks only; browser suites explicitly skipped')
    args = ap.parse_args()
    if not shutil.which('node'):
        raise SystemExit('MISSING: Node.js')
    if not args.quick:
        try:
            import playwright.sync_api  # noqa: F401
        except ImportError:
            raise SystemExit('MISSING: pip install -r requirements-dev.txt; python -m playwright install chromium')
    with tempfile.TemporaryDirectory(prefix='soundblocks-check-') as temp:
        jobs = [('build', [sys.executable, 'tools/build_lessons.py']),
                ('reproducible build', [sys.executable, 'tools/build_lessons.py', '--output-dir', temp]),
                ('reproducible build: compare', lambda: reproducible(temp)),
                ('single-file baseline', [sys.executable, 'tools/baseline.py', '--check', '--dir', temp]),
                ('baseline contract', [sys.executable, 'tests/unit/test_baseline.py']),
                ('directory layout', [sys.executable, 'tests/unit/test_layout.py']),
                ('build boundaries', [sys.executable, 'tests/unit/test_build.py']),
                ('assessment contract', ['node', 'tests/unit/test_assessment_contract.js']),
                ('media coverage', ['node', 'tests/unit/test_media.js'])]
        if not args.quick:
            jobs += [(name, [sys.executable, 'tests/browser/' + name + '.py']) for name in
                     ['test_progress', 'test_games', 'test_initialpick', 'test_assessment_browser', 'test_mobile', 'test_course',
                      'smoke_parent_panel', 'smoke_w2_browser', 'smoke_w3_browser']]
        failures = []
        for name, job in jobs:
            print('\nRUN ' + name, flush=True)
            if callable(job):
                try:
                    job()
                    code = 0
                except SystemExit as error:
                    print(error, flush=True)
                    code = 1
            else:
                code = subprocess.run(job, cwd=ROOT).returncode
            print(('PASS ' if code == 0 else 'FAIL ') + name, flush=True)
            if code:
                failures.append(name)
                if name in ('build', 'reproducible build', 'reproducible build: compare', 'single-file baseline'):
                    break
    if args.quick:
        print('SKIPPED: browser suites (--quick)')
    if failures:
        raise SystemExit('FAILED: ' + ', '.join(failures))
    print('All selected checks passed.')


if __name__ == '__main__':
    main()
