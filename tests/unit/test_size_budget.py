"""Size guardrail: budgets come from project.json; a forged oversize product must fail; equal passes."""
import contextlib
import io
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

    def test_equal_to_budget_is_ok_not_over_but_still_warns(self):
        # L1（外审 low，2026-09-10）：注释曾把"size === limit"这个边界错写成
        # "size >= limit 走 OVER"，与代码的 `>` 硬失败判据不一致。这里显式断言
        # 恰好等于预算时的真实行为：verdict 是 (ok) 不是 (OVER)，但因为余量恰好
        # 为零（0 < 15% 预算），仍然会打一行 SIZE WARN——通过但不安静地通过。
        with tempfile.TemporaryDirectory() as temp:
            products(temp, {'week01.html': 8 * MB, 'week02.html': 100, 'course.html': 100})
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                size_budget.check(temp, config())  # 不应抛出——恰好等于预算按既有契约通过
            out = buf.getvalue()
            self.assertIn('SIZE week01.html: 8.00 MB of 8 MB budget (ok), margin 0.00 MB (0.0%)', out,
                '恰好等于预算的产物 verdict 应是 (ok) 不是 (OVER)')
            self.assertIn('SIZE WARN week01.html: 余量 0.00 MB (0.0%)', out,
                '恰好等于预算时余量为零，应该打 WARN 提醒——"通过"不等于"安全，不用管"')

    def test_missing_product_is_reported(self):
        with tempfile.TemporaryDirectory() as temp:
            products(temp, {'week01.html': 100, 'course.html': 100})
            with self.assertRaisesRegex(SystemExit, 'MISSING product'):
                size_budget.check(temp, config())

    def test_low_margin_prints_warn_without_failing(self):
        # T8②（外审 medium，2026-09-10）：余量 < 15%（size > 0.85×limit）应打一行
        # SIZE WARN，但不改变退出码——week01.html 预算 8 MB，7 MB 恰好余量 1/8=12.5%
        # < 15%，course.html 预算 20 MB，17.5 MB 余量 2.5/20=12.5% < 15%，两者都应
        # 触发 WARN 但整体仍应正常返回（不抛 SystemExit）。
        with tempfile.TemporaryDirectory() as temp:
            products(temp, {'week01.html': 7 * MB, 'week02.html': 100, 'course.html': int(17.5 * MB)})
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                size_budget.check(temp, config())  # 不应抛出
            out = buf.getvalue()
            self.assertIn('SIZE WARN week01.html: 余量 1.00 MB (12.5%)', out)
            self.assertIn('SIZE WARN course.html: 余量 2.50 MB (12.5%)', out)
            # week02.html 几乎没占用预算，余量远大于 15%，不应被误报 WARN。
            self.assertNotIn('SIZE WARN week02.html', out)

    def test_healthy_margin_does_not_warn(self):
        # 余量充足（> 15%）时不应打印 WARN 行，只有 verdict/margin 的常规一行。
        with tempfile.TemporaryDirectory() as temp:
            products(temp, {'week01.html': 5 * MB, 'week02.html': 5 * MB, 'course.html': 10 * MB})
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                size_budget.check(temp, config())
            out = buf.getvalue()
            self.assertNotIn('SIZE WARN', out)
            # 每个产物都应额外打印余量 MB（不只是触发 WARN 的那些）。
            self.assertIn('margin 3.00 MB', out)  # week01/week02：8-5=3
            self.assertIn('margin 10.00 MB', out)  # course：20-10=10

    def test_over_budget_does_not_also_print_warn(self):
        # 已经 OVER 的产物走硬失败分支，不应该在异常抛出前重复打一条 WARN——
        # OVER 本身已经是更明确的信号，两条同时打反而混淆严重程度。
        with tempfile.TemporaryDirectory() as temp:
            products(temp, {'week01.html': 9 * MB, 'week02.html': 100, 'course.html': 100})
            buf = io.StringIO()
            with self.assertRaises(SystemExit):
                with contextlib.redirect_stdout(buf):
                    size_budget.check(temp, config())
            out = buf.getvalue()
            self.assertIn('SIZE week01.html', out)
            self.assertIn('(OVER)', out)
            self.assertNotIn('SIZE WARN week01.html', out)

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
