"""Size guardrail: budgets come from project.json; a forged oversize product must fail; equal passes."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
import size_budget
from project_config import BUILD, load_config

MB = size_budget.MB


def config(week=8, course=20, weeks=(1, 2)):
    return {'schemaVersion': 1, 'weeks': list(weeks), 'courseWeeks': [1], 'entry': 'course.html', 'sizeBudgetMB': {'week': week, 'course': course}}


def products(temp, sizes):
    for name, size in sizes.items():
        (Path(temp) / name).write_bytes(b'x' * size)


class SizeBudgetTests(unittest.TestCase):
    def test_repository_budget_is_declared_and_current_build_passes(self):
        cfg = load_config()
        self.assertEqual(set(cfg['sizeBudgetMB']), {'week', 'course'})
        for name in size_budget.budgets(cfg):
            self.assertTrue((BUILD / name).is_file(), f'{name} missing; run python tools/project.py build')
        size_budget.check(BUILD, cfg)

    def test_forged_oversize_product_fails_and_names_it(self):
        with tempfile.TemporaryDirectory() as temp:
            products(temp, {'week01.html': 8 * MB + 1, 'week02.html': 100, 'course.html': 100, 'index.html': 5 * 10**7})
            with self.assertRaisesRegex(SystemExit, r'week01\.html is 8,000,001 bytes, budget 8,000,000'):
                size_budget.check(temp, config())
        with tempfile.TemporaryDirectory() as temp:
            products(temp, {'week01.html': 100, 'week02.html': 100, 'course.html': 20 * MB + 1})
            with self.assertRaisesRegex(SystemExit, r'course\.html is 20,000,001 bytes'):
                size_budget.check(temp, config())

    def test_equal_to_budget_passes_and_index_is_not_counted(self):
        with tempfile.TemporaryDirectory() as temp:
            products(temp, {'week01.html': 8 * MB, 'week02.html': 8 * MB, 'course.html': 20 * MB, 'index.html': 10**9 // 10})
            size_budget.check(temp, config())

    def test_missing_product_is_reported(self):
        with tempfile.TemporaryDirectory() as temp:
            products(temp, {'week01.html': 100, 'course.html': 100})
            with self.assertRaisesRegex(SystemExit, 'MISSING product'):
                size_budget.check(temp, config())

    def test_budget_declaration_is_validated(self):
        for bad in [None, 8, {'week': 8}, {'week': 8, 'course': 20, 'extra': 1}, {'week': 0, 'course': 20},
                    {'week': '8', 'course': 20}, {'week': True, 'course': 20}, {'week': 8, 'course': -1},
                    {'week': 8.5, 'course': 20}, {'week': float('nan'), 'course': 20}, {'week': 8, 'course': float('inf')}]:
            cfg = config()
            cfg['sizeBudgetMB'] = bad
            with self.assertRaises(ValueError, msg=repr(bad)):
                size_budget.budgets(cfg)
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'project.json'
            cfg = config()
            del cfg['sizeBudgetMB']
            path.write_text(json.dumps(cfg))
            with self.assertRaises(ValueError):
                load_config(path)


if __name__ == '__main__':
    unittest.main()
