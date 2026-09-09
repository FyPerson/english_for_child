"""run_checks: --skip-baseline job filtering and break-on-critical-failure execution (plan v1.7 §4 step 1)."""
import inspect
from pathlib import Path
import subprocess
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
import run_checks

FAKE_TEMP = 'FAKE_TEMP_DIR'
NOOP_REPRODUCIBLE = lambda temp: None  # noqa: E731 - avoid touching the real build/ directory in tests

QUICK_NAMES_WITH_BASELINE = ['build', 'reproducible build', 'reproducible build: compare', 'single-file baseline',
                             'size budget', 'baseline contract', 'size budget contract', 'doctor contract',
                             'archive inventory contract', 'theme palette contract', 'gen segments contract',
                             'check_data unreviewed marker gate', 'check_data sounds schema global gate',
                             'directory layout', 'build boundaries', 'run_checks contract', 'graphemes contract',
                             'word coloring contract', 'render smoke', 'strict render ambiguity regression',
                             'word consumers contract', 'migration diff contract', 'grapheme semantics contract',
                             'synthetic ai integration contract',
                             'migration audit contract', 'grapheme migration contract', 'assessment contract', 'media coverage']

QUICK_NAMES_WITHOUT_BASELINE = [n for n in QUICK_NAMES_WITH_BASELINE if n != 'single-file baseline']

# Every job that follows 'single-file baseline' in the unfiltered list above (plan v1.7 §4 step 1, verdict ①).
POST_BASELINE_NAMES = ['size budget', 'baseline contract', 'size budget contract', 'doctor contract',
                        'archive inventory contract', 'theme palette contract', 'gen segments contract',
                        'check_data unreviewed marker gate', 'check_data sounds schema global gate',
                        'directory layout', 'build boundaries', 'run_checks contract', 'graphemes contract',
                        'word coloring contract', 'render smoke', 'strict render ambiguity regression',
                        'word consumers contract', 'migration diff contract', 'grapheme semantics contract',
                        'synthetic ai integration contract',
                        'migration audit contract', 'grapheme migration contract', 'assessment contract', 'media coverage']

BROWSER_SUITE_NAMES = ['test_audio_touch', 'test_date_schedule', 'test_progress', 'test_games', 'test_initialpick',
                        'test_assessment_browser', 'test_mobile', 'test_course', 'smoke_parent_panel',
                        'smoke_w2_browser', 'smoke_w3_browser']


def always_pass(cmd, **kwargs):
    return subprocess.CompletedProcess(cmd, 0)


def fail_only(*failing_cmds):
    """A stub `run` that fails only for the given exact argv lists; everything else passes."""
    def run(cmd, **kwargs):
        return subprocess.CompletedProcess(cmd, 1 if cmd in failing_cmds else 0)
    return run


def capture_emit():
    """A stub `emit` (stands in for print) that records lines instead of writing them.

    This file itself is spawned as a real subprocess by the 'run_checks contract' job (see
    build_jobs). Every test below that calls run_jobs() MUST pass this instead of relying on the
    `emit=print` default — otherwise its RUN/PASS/FAIL lines (including deliberately-faked FAIL
    lines from the failure tests) print for real and leak into that subprocess's stdout, which the
    parent `python tools/run_checks.py` inherits verbatim and mixes into the real check output.
    """
    lines = []

    def emit(*args, **kwargs):
        lines.append(' '.join(str(a) for a in args).strip())
    return emit, lines


class SkipBaselineFilterTests(unittest.TestCase):
    def test_skip_baseline_removes_only_that_job_and_keeps_order(self):
        jobs = run_checks.build_jobs(FAKE_TEMP, quick=True, skip_baseline=True, reproducible_fn=NOOP_REPRODUCIBLE)
        self.assertEqual([name for name, _ in jobs], QUICK_NAMES_WITHOUT_BASELINE)

    def test_skip_baseline_does_not_filter_the_similarly_named_baseline_contract_job(self):
        # Boundary case named in the plan: 'baseline contract' also contains the word "baseline" but is a
        # unit-test job, not the product fixture, and must survive the filter.
        jobs = run_checks.build_jobs(FAKE_TEMP, quick=True, skip_baseline=True, reproducible_fn=NOOP_REPRODUCIBLE)
        names = [name for name, _ in jobs]
        self.assertNotIn('single-file baseline', names)
        self.assertIn('baseline contract', names)

    def test_without_the_flag_the_job_list_matches_the_current_full_list(self):
        # Verdict ③: --skip-baseline absent must reproduce today's behaviour exactly.
        jobs = run_checks.build_jobs(FAKE_TEMP, quick=True, skip_baseline=False, reproducible_fn=NOOP_REPRODUCIBLE)
        self.assertEqual([name for name, _ in jobs], QUICK_NAMES_WITH_BASELINE)

    def test_quick_and_skip_baseline_together_still_skip_browser_suites(self):
        jobs = run_checks.build_jobs(FAKE_TEMP, quick=True, skip_baseline=True, reproducible_fn=NOOP_REPRODUCIBLE)
        names = [name for name, _ in jobs]
        for browser_name in BROWSER_SUITE_NAMES:
            self.assertNotIn(browser_name, names)
        self.assertEqual(names, QUICK_NAMES_WITHOUT_BASELINE)

    def test_full_non_quick_run_appends_browser_suites_after_media_coverage(self):
        jobs = run_checks.build_jobs(FAKE_TEMP, quick=False, skip_baseline=False, reproducible_fn=NOOP_REPRODUCIBLE)
        names = [name for name, _ in jobs]
        self.assertEqual(names, QUICK_NAMES_WITH_BASELINE + BROWSER_SUITE_NAMES)


    def test_non_quick_with_skip_baseline_filters_after_the_browser_suites_are_appended(self):
        """The filter must run after BOTH construction stages (plan v1.7 §4 step 1).

        Quick mode alone cannot catch the filter block being moved above the `if not quick`
        append, because no browser suite is named 'single-file baseline'. This asserts the
        full non-quick list so that a future baseline-like job added to the append stage,
        or a filter moved above it, shows up as a failure instead of passing silently.
        """
        jobs = run_checks.build_jobs(FAKE_TEMP, quick=False, skip_baseline=True, reproducible_fn=NOOP_REPRODUCIBLE)
        self.assertEqual([name for name, _ in jobs], QUICK_NAMES_WITHOUT_BASELINE + BROWSER_SUITE_NAMES)


class RunJobsExecutionTests(unittest.TestCase):
    def test_run_jobs_emit_default_is_print_for_the_real_pipeline(self):
        # The real pipeline (main()) never overrides `emit`, so it must still default to print — every
        # other test in this class passes an explicit capture_emit() precisely to avoid ever hitting
        # this default, which would print for real into whatever process ran this test file.
        default_emit = inspect.signature(run_checks.run_jobs).parameters['emit'].default
        self.assertIs(default_emit, print)

    def test_skip_baseline_lets_every_job_after_the_baseline_actually_run(self):
        # Verdict ①: assert the *executed* list, not just the return code — a job filtered out of `jobs`
        # could otherwise silently also fail to run its neighbours if break logic were wrong.
        jobs = run_checks.build_jobs(FAKE_TEMP, quick=True, skip_baseline=True, reproducible_fn=NOOP_REPRODUCIBLE)
        emit, lines = capture_emit()
        failures, executed = run_checks.run_jobs(jobs, run=always_pass, emit=emit)
        self.assertEqual(failures, [])
        self.assertEqual(executed, QUICK_NAMES_WITHOUT_BASELINE)
        self.assertEqual(executed[-len(POST_BASELINE_NAMES):], POST_BASELINE_NAMES)
        # What an operator actually sees on screen, not just the return value: no baseline RUN line,
        # and the RUN/PASS lines follow the same order as `executed`.
        self.assertTrue(all('single-file baseline' not in line for line in lines))
        self.assertEqual([line[len('RUN '):] for line in lines if line.startswith('RUN ')], executed)
        self.assertEqual([line[len('PASS '):] for line in lines if line.startswith('PASS ')], executed)

    def test_a_non_baseline_failure_still_breaks_the_run_and_reports_nonzero(self):
        # Verdict ②: a critical-job failure elsewhere ('build') must still stop everything after it.
        jobs = run_checks.build_jobs(FAKE_TEMP, quick=True, skip_baseline=False, reproducible_fn=NOOP_REPRODUCIBLE)
        build_cmd = dict(jobs)['build']
        emit, lines = capture_emit()
        failures, executed = run_checks.run_jobs(jobs, run=fail_only(build_cmd), emit=emit)
        self.assertEqual(executed, ['build'])  # nothing after 'build' was attempted
        self.assertEqual(failures, ['build'])
        self.assertTrue(failures)  # main() does `if failures: raise SystemExit(...)` -> non-zero exit
        # This FAIL line is deliberately faked by the stub; it must stay captured here, never printed
        # for real — this is exactly the line that used to leak into `check --quick`'s real output.
        self.assertEqual(lines, ['RUN build', 'FAIL build'])

    def test_without_the_flag_a_baseline_failure_strands_every_later_job(self):
        """This is the problem --skip-baseline exists to solve (plan v1.7 §4, the paragraph above the step table).

        'single-file baseline' is in the break list, so once it fails every job after it is
        never attempted — which is why 'just ignore the baseline failure' cannot prove the rest
        are green. Unlike the `build` failure case, this one also proves break truncates
        mid-list rather than merely stopping at the first entry.
        """
        jobs = run_checks.build_jobs(FAKE_TEMP, quick=True, skip_baseline=False, reproducible_fn=NOOP_REPRODUCIBLE)
        baseline_cmd = dict(jobs)['single-file baseline']
        emit, lines = capture_emit()
        failures, executed = run_checks.run_jobs(jobs, run=fail_only(baseline_cmd), emit=emit)
        self.assertEqual(executed, QUICK_NAMES_WITH_BASELINE[:4])
        self.assertEqual(failures, ['single-file baseline'])
        for name in POST_BASELINE_NAMES:
            self.assertNotIn(name, executed)
        self.assertIn('FAIL single-file baseline', lines)

    def test_a_failure_in_a_non_critical_job_does_not_break_the_run(self):
        # Sanity check for the break list itself: a job outside the critical four (e.g. 'size budget')
        # is recorded as a failure but does not stop later jobs from running.
        jobs = run_checks.build_jobs(FAKE_TEMP, quick=True, skip_baseline=True, reproducible_fn=NOOP_REPRODUCIBLE)
        size_budget_cmd = dict(jobs)['size budget']
        emit, lines = capture_emit()
        failures, executed = run_checks.run_jobs(jobs, run=fail_only(size_budget_cmd), emit=emit)
        self.assertEqual(failures, ['size budget'])
        self.assertEqual(executed, QUICK_NAMES_WITHOUT_BASELINE)  # the run continued to the end
        self.assertIn('FAIL size budget', lines)  # captured, not leaked to real stdout


if __name__ == '__main__':
    unittest.main()
