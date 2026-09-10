"""M4（外审 medium，2026-09-10，对 W5 是实质问题）：check_data.js ③「字母全在已教
范围内」改前按 `[...w]` 拆字符与 TAUGHT（= Object.keys(SOUNDS)，其实是字位 ID 集合）
逐字符比——W5 起 SOUNDS 出现多字母字位（比如 `ai`）后，这个判据双向出错：

  - `ai` 未教而 a、i 已教时，含 `ai` 的词（如 rain）按字符拆成 r/a/i/n 逐个查
    TAUGHT 全部命中，会被误判"字母全在已教范围内"——但 rain 实际上无法用当周
    字位表分词（W.rain.segments 若声称含 'ai'，那是一个不存在的字位 ID，
    segmentWord 应该拒绝，不该被字符级判据放过）。
  - 反过来只教了 `ai`、没有分别教 a/i 时，字符级拆分同样会给出误判。

改法：非豁免词一律走 idsForWord(w)（segments 感知）取字位 ID 数组，逐 ID 与
TAUGHT（字位 ID 集合）比；零解/多解无 segments 时结构化失败（ok(false, ...)，不
崩溃），与 H1（tests/unit/test_grapheme_semantics.js 的 isZeroSolutionExemptRecord）
"零解/多解即数据缺陷、不允许静默放行"同一个口径。

本文件按本项目"改坏副本证明会红"的规矩，走真实 CLI 入口（`node tools/validation/
check_data.js <文件>`）。合成 fixture 基于 tests/fixtures/week02-data.js 做最小外科
手术式修改：SOUNDS 里**不**加 'ai'（W2 真实数据里 r/a/i/n 均已教，但 ai 本就不存在），
往一个 words 块里追加 'rain'，同时给 W.rain 声明 segments:['r','ai','n']（引用一个
SOUNDS 里根本不存在的 'ai' 字位 ID）——这是 M4 描述的具体反例场景。
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


def poison_rain_with_nonexistent_ai_segment(raw):
    """在 week02 fixture 追加 'rain'（SOUNDS 不含 'ai'，只有 r/a/i/n 单字母字位）到
    一个真实 words 块，并给 W.rain 声明 segments:['r','ai','n']——'ai' 引用了 SOUNDS
    里不存在的字位 ID，是本条要验证的具体反例。"""
    needle = "{b:'words', items:['cat','cap','can','kit']}"
    assert needle in raw, 'fixture 里找不到目标 words 块，检查 fixture 是否已变'
    poisoned_block = needle.replace("['cat','cap','can','kit']", "['cat','cap','can','kit','rain']")
    assert poisoned_block != needle
    raw2 = raw.replace(needle, poisoned_block, 1)

    w_needle = "kid:{zh:'小孩',art:null}"
    assert w_needle in raw2, 'fixture 里找不到 W.kid 声明，检查 fixture 是否已变'
    raw3 = raw2.replace(w_needle, w_needle + ",\n  rain:{zh:'雨（合成测试词，segments 引用不存在的 ai）',art:null,segments:['r','ai','n']}", 1)
    assert raw3 != raw2
    return raw3


class LetterRangeByGraphemeIdTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        self.baseline_text = FIXTURE.read_text(encoding='utf-8')
        baseline_result = run_check_data(FIXTURE)
        self.assertEqual(baseline_result.returncode, 0,
            f'基线 fixture 应全部通过：{baseline_result.stdout[-500:]}')
        _, self.baseline_fail = count_pass_fail(baseline_result.stdout)
        self.assertEqual(self.baseline_fail, 0)

    def test_rain_with_segments_referencing_untaught_ai_is_caught(self):
        injected = poison_rain_with_nonexistent_ai_segment(self.baseline_text)
        self.assertNotEqual(injected, self.baseline_text, '替换应生效')
        target = Path(self.tmpdir.name) / 'week02-data-rain-untaught-ai-segment.js'
        target.write_text(injected, encoding='utf-8')

        result = run_check_data(target)
        self.assertNotEqual(result.returncode, 0,
            'ai 未教、W.rain.segments 却声称含 ai 时，③ 应报失败——改前按字符判会误绿'
            '（r/a/i/n 逐字符都已教），因为字符级判据看不出 segments 里那个"ai"根本不是'
            '真实存在的字位')
        _, f = count_pass_fail(result.stdout)
        self.assertGreater(f, self.baseline_fail, f'应比基线（{self.baseline_fail}）多至少一条失败：{result.stdout[-1500:]}')
        self.assertIn('"rain" 无法按字位分词', result.stdout,
            '失败消息应点名 rain 无法按字位分词（segments 引用了不存在的 ai 字位 ID），'
            '而不是被字符级判据误判为"含未教字母"或干脆放行')
        self.assertNotIn('GraphemeError', result.stderr,
            '不应在 stderr 触发未捕获的 GraphemeError——分词失败应被 try/catch 转成清晰的 ok(false, ...) 失败')


if __name__ == '__main__':
    unittest.main()
