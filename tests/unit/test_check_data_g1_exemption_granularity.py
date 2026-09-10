"""轮 D 复审（H1/H2，外审 high，2026-09-10）：check_data.js ③「字母全在已教范围内」
的 G1 豁免有两处漏洞，均出在同一段代码（`tools/validation/check_data.js` ③ 附近的
`wordRecords`/`isExemptRecord`，改前叫 `wordSourceKinds`）。

H1（豁免按"词"聚合，跨来源误放行）：改前把同一拼写在全部来源的 kind 合并成一个
`Set`，只要其中任一来源命中 `g1-rounds` 就整词 `continue`——某拼写只要在 G1
（哪怕是合法豁免的 neg 桶）出现过，它在 book-page/wordforge 等**其他非豁免来源**
里的出现也会被一起放过，即便那处根本无法分词/含未教字位。

H2（G1 豁免范围本身判宽了）：规范只豁免「全部 neg 桶」+「仅第一周的 pos 桶」，
改前的 `kinds.has('g1-rounds')` 不分桶、不分周，对任何周任何桶的 g1-rounds 来源
一律豁免——W2 起的 pos 桶词若含未教字母/无法分词，同样会被放过。

改法：豁免判定下沉到"记录"级别（`isExemptRecord`），只有 `bucket==='neg'` 或
`(META.week===1 && bucket==='pos')` 才豁免；同一词形只要**至少有一条非豁免记录**，
就必须能正常分词、落在已教字位范围内。

本文件按本项目"改坏副本证明会红"的规矩，走真实 CLI 入口（`node tools/validation/
check_data.js <文件>`），基于 tests/fixtures/week02-data.js 做最小外科手术式修改。
"""
import re
import subprocess
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
    m = re.search(r'通过 (\d+) 项，失败 (\d+) 项', stdout)
    assert m, f'未能在输出里找到通过/失败计数：{stdout[-500:]}'
    return int(m.group(1)), int(m.group(2))


class G1ExemptionGranularityTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        self.baseline_text = FIXTURE.read_text(encoding='utf-8')
        baseline_result = run_check_data(FIXTURE)
        self.assertEqual(baseline_result.returncode, 0,
            f'基线 fixture 应全部通过：{baseline_result.stdout[-500:]}')
        _, self.baseline_fail = count_pass_fail(baseline_result.stdout)
        self.assertEqual(self.baseline_fail, 0)

    def test_h1_word_exempt_via_g1_neg_but_also_in_book_page_still_checked(self):
        # H1：'milk' 已经是 G1_ROUNDS 'c' 轮 neg 桶的词（合法豁免——纯听力辨音，
        # 不要求可解码；week02 taught 字位不含 'l'/'k' 之外的必要字位，'milk' 本身
        # 无法用 week02 字位表分词）。把它额外注入 BOOK.pages 的一行正文——这是
        # 真实阅读内容，必须可解码。改前会因为"milk 在 G1 出现过"而把这处 book-page
        # 出现也一起放过；改后应该被抓到，且消息点名 book-page 这个来源。
        raw = self.baseline_text
        needle = "{line:'Dan sat.',          art:'danSit',   zh:'丹也坐下了。'},"
        self.assertIn(needle, raw, 'fixture 里找不到目标 BOOK 页台词，检查 fixture 是否已变')
        poisoned = raw.replace(needle, needle.replace('Dan sat.', 'Dan has milk.'), 1)
        self.assertNotEqual(poisoned, raw)
        target = Path(self.tmpdir.name) / 'week02-data-h1-book-page-milk.js'
        target.write_text(poisoned, encoding='utf-8')

        result = run_check_data(target)
        self.assertNotEqual(result.returncode, 0,
            'H1：milk 虽在 G1 neg 桶合法豁免，但也出现在 book-page 正文（非豁免来源），应报失败')
        self.assertIn('"milk"', result.stdout)
        self.assertIn('无法按字位分词', result.stdout)
        self.assertIn('来源：', result.stdout)
        self.assertIn('book-page', result.stdout,
            f'H1：失败消息应点名 book-page 这个非豁免来源，实际：{result.stdout[-1500:]}')

    def test_h2_g1_pos_bucket_in_non_week1_is_not_exempt(self):
        # H2：week02 fixture 的 G1 'c' 轮 pos 桶塞一个含未教字母的合成词
        # 'cog'（c 已教，o/g 未教）——规范只豁免「全部 neg 桶」+「仅第一周的
        # pos 桶」，week02 的 pos 桶不豁免，应该被抓到。
        raw = self.baseline_text
        needle = "c: { pos:['cat','cap','can','kit'], neg:['dog','fish','milk','sun'] },"
        self.assertIn(needle, raw, 'fixture 里找不到目标 G1_ROUNDS c 轮声明，检查 fixture 是否已变')
        poisoned = raw.replace(
            needle,
            "c: { pos:['cat','cap','can','kit','cog'], neg:['dog','fish','milk','sun'] },",
            1
        )
        self.assertNotEqual(poisoned, raw)
        target = Path(self.tmpdir.name) / 'week02-data-h2-pos-bucket-untaught.js'
        target.write_text(poisoned, encoding='utf-8')

        result = run_check_data(target)
        self.assertNotEqual(result.returncode, 0,
            'H2：week02（非第一周）的 G1 pos 桶含未教字母词应报失败，不应被豁免')
        self.assertIn('"cog"', result.stdout)
        self.assertIn('g1-rounds', result.stdout,
            f'H2：失败消息应点名 g1-rounds 来源，实际：{result.stdout[-1500:]}')

    def test_g1_neg_bucket_alone_still_exempt_regardless_of_week(self):
        # 正例回归：不额外注入 book-page，也不改 pos 桶——'milk'/'fish' 只出现在
        # G1 neg 桶时，仍然不因为无法分词而报错（这条豁免本身没有被本次修复误伤）。
        result = run_check_data(FIXTURE)
        self.assertEqual(result.returncode, 0,
            f'纯 G1 neg 桶不应因不可分词被误报：{result.stdout[-1500:]}')

    def test_g1_pos_bucket_in_week1_still_exempt(self):
        # 正例回归：第一周的 pos 桶依然豁免（规范原文允许的那一条）。用 week01
        # 真实数据核对：若 week01 的 G1 pos 桶本就没有不可分词的词，这条测试至少
        # 确认基线仍然通过（不额外注入变异，只做"现状仍然绿"的回归锚点）。
        week01 = ROOT / 'frontend' / 'src' / 'weeks' / 'week01.data.js'
        result = run_check_data(week01)
        self.assertEqual(result.returncode, 0,
            f'week01 真实数据应保持通过（G1 pos 桶豁免在第一周仍然生效）：{result.stdout[-1500:]}')


if __name__ == '__main__':
    unittest.main()
