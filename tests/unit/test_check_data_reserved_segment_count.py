"""T5（外审 medium，2026-09-10）：check_data.js 周检词校验改前按 `RESERVED.every(w =>
w.length === 3)` 判字符数（tools/validation/check_data.js 原 166 行附近）。W5 起会
出现 `rain` 这类三个字位、四个字符的周检词，按字符数判会被误判为不合格——明明字位数
合格，只因为拼写含双字母字位就被判成"不是三个字母"。

改法：换成用本文件已有的 idsForWord(w)（segments 感知，走 segmentWord）取字位数组
长度 === 3，失败消息写"字位"；分词抛错时 ok(false, ...) 报出而不是让整个 Node 进程
带栈崩溃。

本文件按本项目"改坏副本证明会红"的规矩，走真实 CLI 入口（`node tools/validation/
check_data.js <文件>`）。合成 fixture 基于 tests/fixtures/week02-data.js 做最小外科
手术式修改：在 SOUNDS 里追加一个 displayOnWall:false 的 'ai' 双字母字位（不参与墙/
newPatterns 语义，避免这条测试节外生枝去动 DATA-WALL-01 那一整套断言），RESERVED
把 'kid' 换成 'rain'（W2 真实数据里 r/a/i/n 均已教，'rain' 本身在这份 fixture 里
除了周检块外从未出现，不会触发"泄漏"检查）。
"""
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / 'tests' / 'fixtures' / 'week02-data.js'

SOUNDS_AI_ENTRY = """  ai:{grapheme:'ai', ipa:'/eɪ/', type:'v', art:'rain', mem:'下雨的声音 ai-ai-ai',
     cue:'两个字母粘在一起读一个音：<span class="en">ai</span>。',
     challenge:'合体挑战', try:'先说 a，再说 i，然后把它们粘起来只发一个音。',
     pass:'听起来是一个完整的音，不是两个断开的音。',
     how:'嘴型从 a 平滑滑向 i，中间不停顿。',
     warn:'不要读成两个分开的音节。',
     demo:[['rain','雨']], displayOnWall:false},
"""


def run_check_data(target):
    return subprocess.run(
        ['node', str(ROOT / 'tools' / 'validation' / 'check_data.js'), str(target)],
        cwd=str(ROOT), capture_output=True, text=True, encoding='utf-8'
    )


def count_pass_fail(stdout):
    m = re.search(r'通过 (\d+) 项，失败 (\d+) 项', stdout)
    assert m, f'未能在输出里找到通过/失败计数：{stdout[-500:]}'
    return int(m.group(1)), int(m.group(2))


def base_fixture_with_ai_sound():
    """在 SOUNDS 里插入 displayOnWall:false 的 ai 双字母字位，不改 RESERVED/W。"""
    raw = FIXTURE.read_text(encoding='utf-8')
    needle = "const SOUNDS = {\n"
    assert needle in raw, 'fixture 里找不到 const SOUNDS = { 声明起始，检查 fixture 是否已变'
    return raw.replace(needle, needle + SOUNDS_AI_ENTRY, 1)


def swap_reserved_kid_for(raw, new_word, w_entry):
    """把 RESERVED 里的 'kid' 换成 new_word，同时把 W 里的 kid:{...} 换成
    new_word 的释义条目（保留原 W.kid 声明的位置与格式，只换词与释义）。"""
    old_reserved = "const RESERVED = ['ram','hem','rid','dam','kid'];"
    assert old_reserved in raw, 'fixture 里找不到 RESERVED 声明，检查 fixture 是否已变'
    new_reserved = "const RESERVED = ['ram','hem','rid','dam','%s'];" % new_word
    raw = raw.replace(old_reserved, new_reserved, 1)

    old_w = "kid:{zh:'小孩',art:null}"
    assert old_w in raw, 'fixture 里找不到 W.kid 声明，检查 fixture 是否已变'
    raw = raw.replace(old_w, w_entry, 1)
    return raw


class ReservedSegmentCountTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        self.baseline_text = FIXTURE.read_text(encoding='utf-8')
        baseline_result = run_check_data(FIXTURE)
        self.assertEqual(baseline_result.returncode, 0,
            f'基线 fixture 应全部通过：{baseline_result.stdout[-500:]}')
        _, self.baseline_fail = count_pass_fail(baseline_result.stdout)
        self.assertEqual(self.baseline_fail, 0)

    def test_rain_with_explicit_segments_passes(self):
        # 正例：'rain' 三个字位（r/ai/n）、四个字符，写了 explicit segments 消歧，
        # check_data.js ②「周检词字位数」这条检查本身应该通过——这正是 T5 要修的
        # 场景：旧的按字符数判会把它误判成"不是三个字母"。
        #
        # ⚠️ 范围说明：这里不断言整个 CLI 的退出码为 0。tools/validation/
        # assessment_contract.js（⑩「第四周起的测评隔离与巩固周契约」调用的
        # validateAssessment）有一条**独立于本次 T5 改动**的 CVC 判据
        # （`/^[^aeiou][aeiou][^aeiou]$/` 逐字符正则），同样判不出双字母元音的
        # CVC——这正是 docs/里程碑2实施方案 §2.2 表格里已经记录、待后续处理的
        # 已知缺口，不是 T5 要修的 check_data.js:165 那一处，也不在本批任务范围内。
        # 断言范围收窄为：check_data.js 自己的 ② 检查不再报"字位数不对"，同时
        # 如实断言 assessment_contract.js 那条已知的、范围外的 CVC 判据仍会命中
        # （证明本次改动没有意外把它也修好或修坏，边界清楚）。
        raw = base_fixture_with_ai_sound()
        raw = swap_reserved_kid_for(raw, 'rain', "rain:{zh:'雨',art:null,segments:['r','ai','n']}")
        target = Path(self.tmpdir.name) / 'week02-data-rain-with-segments.js'
        target.write_text(raw, encoding='utf-8')

        result = run_check_data(target)
        self.assertNotIn('必须是三个字位', result.stdout, '不应报"必须是三个字位"这条失败——rain 恰好是三个字位，check_data.js ② 本身的判据应该放行')
        self.assertNotIn('"rain" 无法按字位分词', result.stdout, '写了正确 segments 时不应报分词失败')
        # 如实记录范围外的已知缺口（不是本次断言的重点，只是不隐瞒它仍然存在）：
        self.assertIn('周检词不是已教 CVC：rain', result.stdout,
            'assessment_contract.js 的独立 CVC 判据是已知的、范围外的字符级正则缺口，'
            '本次 T5 未涉及，如实记录其仍然存在，不隐瞒也不越权修复')

    def test_rains_four_segments_fails(self):
        # 反例①：'rains' 是四个字位（r/ai/n/s），即便写了完整 segments 也不满足
        # "三个字位"这条规则——用来证明改后的判据真的按字位数（不是字符数）判，
        # 且字位数不等于 3 时会被正确拦下（rains 字符数是 5，用旧字符判也会失败，
        # 但这里要验证的是"字位数判据本身"，而不是碰巧字符数也不对）。
        raw = base_fixture_with_ai_sound()
        raw = swap_reserved_kid_for(raw, 'rains', "rains:{zh:'雨（复数，合成测试词）',art:null,segments:['r','ai','n','s']}")
        target = Path(self.tmpdir.name) / 'week02-data-rains-four-segments.js'
        target.write_text(raw, encoding='utf-8')

        result = run_check_data(target)
        self.assertNotEqual(result.returncode, 0, '"rains"（四个字位）应报失败')
        self.assertIn('"rains" 必须是三个字位，实际 4 个字位', result.stdout)

    def test_two_segment_word_fails(self):
        # 反例②：只有两个字位（e/a），同样不满足"三个字位"。用合成词 'ea'（e+a
        # 两个已教单字母字位拼接，恰好等于词形本身，不需要额外的多字母字位）——
        # 不能直接用真实词 'at'：它已经在 week02 fixture 别处被使用（wordforge
        # tail 与 words 块），拿来当 RESERVED 会先触发"泄漏"检查，测不出本条要验证
        # 的"字位数不等于 3"这条判据；也不能用带数字后缀的 'at2' 这类写法——数字
        # 字符本身会被③「字母全在已教范围内」判成未教字母，混进一条不相关的失败。
        raw = base_fixture_with_ai_sound()
        raw = swap_reserved_kid_for(raw, 'ea', "ea:{zh:'（合成测试词，两个字位）',art:null,segments:['e','a']}")
        target = Path(self.tmpdir.name) / 'week02-data-two-segments.js'
        target.write_text(raw, encoding='utf-8')

        result = run_check_data(target)
        self.assertNotEqual(result.returncode, 0, '两个字位的合成周检词应报失败')
        self.assertIn('"ea" 必须是三个字位，实际 2 个字位', result.stdout)

    def test_ambiguous_word_without_segments_reported_not_crashed(self):
        # 不写 segments 的多解词：'rain' 在 r/a/i/n/ai 共存的字位表下天然多解
        # （r+ai+n 与 r+a+i+n 两种完整解析），不给 explicit segments 时
        # segmentWord 会抛 segment-ambiguous——这条检查必须把它转成清晰的
        # ok(false, ...) 失败（不是让整个 Node 进程带栈崩溃），按现有③/④同一套
        # "分词失败即数据缺陷"的语义处理。
        raw = base_fixture_with_ai_sound()
        raw = swap_reserved_kid_for(raw, 'rain', "rain:{zh:'雨',art:null}")  # 故意不写 segments
        target = Path(self.tmpdir.name) / 'week02-data-rain-no-segments.js'
        target.write_text(raw, encoding='utf-8')

        result = run_check_data(target)
        self.assertNotEqual(result.returncode, 0, '未写 segments 的多解周检词应报失败')
        _, f = count_pass_fail(result.stdout)  # 核心断言：摘要行必须正常打印，证明进程跑到底没有带栈崩溃
        self.assertGreater(f, self.baseline_fail)
        self.assertIn('无法按字位分词', result.stdout)
        self.assertIn('segment-ambiguous', result.stdout, '失败消息应点名 segmentWord 的歧义错误码')
        self.assertNotIn('GraphemeError', result.stderr,
            '不应在 stderr 触发未捕获的 GraphemeError——多解未消歧应被 try/catch 转成清晰的 ok(false, ...) 失败')


if __name__ == '__main__':
    unittest.main()
