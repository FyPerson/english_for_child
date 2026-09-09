"""Single check entry. Missing dependencies and skipped suites are never reported as passes.

Order (engineering plan v1.3 §3.4): ① build into build/; ② build again into a temporary directory and compare
every product byte for byte (reproducible build); ③ compare the four delivered weeks with the single-file
baseline; ④ the remaining unit and browser suites. A failed step stops the run; temporary directories are
removed whether the run passes or fails.

`--skip-baseline` (plan v1.7 §4 step 1): during the migration, delivered products legitimately change
`skeletonSha256`, so step ③ is expected to fail from step 4 onward until the fixture is retaken in step 9.
The flag filters out only the `single-file baseline` job by exact name; it does not touch the break list
below and does not skip `baseline contract` (a unit-test job, unrelated to the product fixture). Every other
job still runs, and a failure in any of them still stops the run and exits non-zero.
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


def build_jobs(temp, quick, skip_baseline, reproducible_fn=reproducible):
    """Construct the (name, job) list for this run, then apply --skip-baseline filtering.

    `job` is either an argv list (run via subprocess) or a zero-arg callable. `reproducible_fn` is an
    injection seam so tests can avoid touching the real build/ directory.
    """
    jobs = [('build', [sys.executable, 'tools/build_lessons.py']),
            ('reproducible build', [sys.executable, 'tools/build_lessons.py', '--output-dir', temp]),
            ('reproducible build: compare', lambda: reproducible_fn(temp)),
            ('single-file baseline', [sys.executable, 'tools/baseline.py', '--check', '--dir', temp]),
            ('size budget', [sys.executable, 'tools/size_budget.py', '--dir', temp]),
            ('baseline contract', [sys.executable, 'tests/unit/test_baseline.py']),
            ('size budget contract', [sys.executable, 'tests/unit/test_size_budget.py']),
            ('doctor contract', [sys.executable, 'tests/unit/test_doctor.py']),
            ('archive inventory contract', [sys.executable, 'tests/unit/test_verify_archive.py']),
            ('theme palette contract', [sys.executable, 'tests/unit/test_theme_palette.py']),
            ('directory layout', [sys.executable, 'tests/unit/test_layout.py']),
            ('build boundaries', [sys.executable, 'tests/unit/test_build.py']),
            ('run_checks contract', [sys.executable, 'tests/unit/test_run_checks.py']),
            ('assessment contract', ['node', 'tests/unit/test_assessment_contract.js']),
            ('media coverage', ['node', 'tests/unit/test_media.js'])]
    if not quick:
        jobs += [(name, [sys.executable, 'tests/browser/' + name + '.py']) for name in
                 ['test_audio_touch', 'test_date_schedule', 'test_progress', 'test_games', 'test_initialpick', 'test_assessment_browser', 'test_mobile', 'test_course',
                  'smoke_parent_panel', 'smoke_w2_browser', 'smoke_w3_browser']]
    if skip_baseline:
        jobs = [(name, job) for name, job in jobs if name != 'single-file baseline']
    return jobs


def run_jobs(jobs, run=subprocess.run, emit=print):
    """Run jobs in order; a failure in a critical job (the break list below, unchanged from before this
    file grew --skip-baseline) stops the run immediately. `run` stands in for subprocess.run so tests can
    record which jobs were actually attempted without spawning real processes. `emit` stands in for print
    so a job that itself runs run_jobs (as tests/unit/test_run_checks.py does, via subprocess as the
    'run_checks contract' job) does not leak RUN/PASS/FAIL lines into the parent process's real stdout.

    Returns (failures, executed): `executed` lists every job name actually attempted, in order — this is
    what proves jobs after a filtered/skipped entry still ran, not just that the exit code was 0.
    """
    failures = []
    executed = []
    for name, job in jobs:
        emit('\nRUN ' + name, flush=True)
        executed.append(name)
        if callable(job):
            try:
                job()
                code = 0
            except SystemExit as error:
                emit(error, flush=True)
                code = 1
        else:
            code = run(job, cwd=ROOT).returncode
        emit(('PASS ' if code == 0 else 'FAIL ') + name, flush=True)
        if code:
            failures.append(name)
            if name in ('build', 'reproducible build', 'reproducible build: compare', 'single-file baseline'):
                break
    return failures, executed


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--quick', action='store_true', help='Build/data/syntax/unit checks only; browser suites explicitly skipped')
    ap.add_argument('--skip-baseline', action='store_true',
                     help="Skip only the 'single-file baseline' product-baseline job; every other job "
                          "(including 'baseline contract') still runs, and a failure in any of them still "
                          "stops the run and exits non-zero.")
    args = ap.parse_args()
    if not shutil.which('node'):
        raise SystemExit('MISSING: Node.js')
    if not args.quick:
        try:
            import playwright.sync_api  # noqa: F401
        except ImportError:
            raise SystemExit('MISSING: pip install -r requirements-dev.txt; python -m playwright install chromium')
    with tempfile.TemporaryDirectory(prefix='soundblocks-check-') as temp:
        jobs = build_jobs(temp, args.quick, args.skip_baseline)
        failures, _ = run_jobs(jobs)
    if args.quick:
        print('SKIPPED: browser suites (--quick)')
    if failures:
        raise SystemExit('FAILED: ' + ', '.join(failures))
    print('All selected checks passed.')


if __name__ == '__main__':
    main()
