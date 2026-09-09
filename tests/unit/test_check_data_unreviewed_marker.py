"""check_data.js 新增的 gen_segments 未复核标记门槛（里程碑 2 收口批 M4）单测。

背景：tools/validation/gen_segments.js 的 `--write` 会把候选 segments 写回 W 声明，
resolveWord 早就给 resolved 结果设了 needsHumanReview:true，但改前 writeSuggestions
完全不读这个字段——凡 resolved 一律写回，唯一护栏是一段行内注释，注释没有任何机器判据
（`bat` fixture 就是被自动写成 b+at 的活生生例子，见 tests/unit/test_gen_segments.py）。

修法：写回的注释里带机器可识别标记 `@gen-segments-unreviewed`；
tools/validation/check_data.js 新增「⑪ gen_segments 未复核建议门槛」一节，直接在原始
源码文本里找这个标记，数据里含标记即判 fail。本文件用"改坏副本"的办法证明这道门槛
真的会红：复制一份已知能通过 check_data.js 全部检查的 fixture
（tests/fixtures/week02-data.js），只注入一处带标记的字符串，其余不动，跑一遍
check_data.js，断言：①基线 fixture 本身零失败；②注入后失败数恰好比基线多 1（不是
被别的断言连带炸红，也不是被吞掉）；③失败输出里点名了「gen_segments」与
「未复核」；④标记被删除后重新通过（人工复核后的收尾动作确实能让门槛放行）。
"""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / 'tests' / 'fixtures' / 'week02-data.js'


def run_check_data(target):
    return subprocess.run(
        ['node', str(ROOT / 'tools' / 'validation' / 'check_data.js'), str(target)],
        cwd=str(ROOT), capture_output=True, text=True, encoding='utf-8'
    )


def count_pass_fail(stdout):
    # check_data.js 收尾打印："通过 N 项，失败 M 项"
    import re
    m = re.search(r'通过 (\d+) 项，失败 (\d+) 项', stdout)
    assert m, f'未能在输出里找到通过/失败计数：{stdout[-500:]}'
    return int(m.group(1)), int(m.group(2))


class UnreviewedMarkerGateTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        self.baseline_text = FIXTURE.read_text(encoding='utf-8')

    def test_baseline_fixture_has_zero_failures(self):
        result = run_check_data(FIXTURE)
        self.assertEqual(result.returncode, 0, f'基线 fixture 应全部通过：{result.stdout[-500:]}')
        p, f = count_pass_fail(result.stdout)
        self.assertEqual(f, 0, '基线 fixture 不应有任何失败项（否则下面的"+1"对照就不成立）')

    def test_injected_marker_adds_exactly_one_failure_and_is_named(self):
        baseline_result = run_check_data(FIXTURE)
        baseline_pass, baseline_fail = count_pass_fail(baseline_result.stdout)

        injected = self.baseline_text.replace(
            'const W = {',
            "const W = {\n  __gen_segments_marker_test_word__:{zh:'测试', "
            "segments:['a'] /* @gen-segments-unreviewed 测试注入，证明门槛会红 */},",
            1
        )
        self.assertNotEqual(injected, self.baseline_text, '替换应生效（否则测试没有真正改动文件）')
        target = Path(self.tmpdir.name) / 'week02-data-marker-injected.js'
        target.write_text(injected, encoding='utf-8')

        result = run_check_data(target)
        self.assertNotEqual(result.returncode, 0, '含未复核标记的数据应让 check_data.js 以非 0 退出')
        p, f = count_pass_fail(result.stdout)
        self.assertEqual(f, baseline_fail + 1,
            f'注入一处标记应恰好新增 1 条失败（基线 {baseline_fail} -> 注入后 {f}），'
            '不多不少——不能被别的断言连带炸红，也不能被吞掉')
        self.assertIn('gen_segments', result.stdout, '失败输出应点名 gen_segments')
        self.assertIn('未复核', result.stdout, '失败输出应点名"未复核"')

    def test_removing_marker_restores_pass(self):
        # 人工复核后的收尾动作：删除标记（连同注释），应恢复通过——证明门槛不是
        # 单向死锁，复核完成后确实能放行。
        injected = self.baseline_text.replace(
            'const W = {',
            "const W = {\n  __gen_segments_marker_test_word2__:{zh:'测试', "
            "segments:['a'] /* @gen-segments-unreviewed 测试注入 */},",
            1
        )
        reviewed = injected.replace(" /* @gen-segments-unreviewed 测试注入 */", "")
        self.assertNotIn('@gen-segments-unreviewed', reviewed, '删除标记后不应再含该标记')
        target = Path(self.tmpdir.name) / 'week02-data-marker-reviewed.js'
        target.write_text(reviewed, encoding='utf-8')

        result = run_check_data(target)
        self.assertEqual(result.returncode, 0, '删除标记（视为已人工复核）后应恢复全部通过')


if __name__ == '__main__':
    unittest.main()
