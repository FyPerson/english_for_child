"""任务 1 / P16（主会话裁定，2026-09-10）：check_data.js 原 :83 有一条
`META.week >= 4 || W[w]` 豁免——W4 的 RESERVED 五词当年不要求进 W。规范六稿已写死
「RESERVED 必须在 W」，迁移审计 migration_audit.js:308-309 早把这条豁免标成"待删除"。
真正的驱动力是 W5：`rain` 这类周检词要靠 `W[word].segments` 显式消歧才能分词，若周检词
不进 W，`segmentWord` 拿不到 explicit segments，多解词会直接抛 segment-ambiguous。

改法：tools/validation/check_data.js 删掉 `META.week >= 4 ||`，改成一律要求
`W[w]` 存在；frontend/src/weeks/week04.data.js 的 W 补齐 RESERVED（dab/nag/nod/sob/rot）
与 RESERVED_RETEST（gab/gal/hub/rib/sod）十词的释义条目（zh 复用同文件已有的
ASSESSMENT_WORDS 常量，art:null，单字母字位不需要 segments）。

本文件按本项目"改坏副本证明会红"的规矩，走真实 CLI 入口（`node tools/validation/
check_data.js <文件>`）。合成 fixture 基于 tests/fixtures/week03-data.js 做最小外科
手术式修改：只把 META.week/storageKey 从 3 改成 4（RESERVED 五词 gut/bud/fin/lob/fib
本就已经在 W 里，week03 fixture 本身在 week<4 时就已经要求"RESERVED 必须在 W"，
这里只是把它套进曾经被豁免的 week>=4 语境，验证豁免删除后现状仍然通过）——正例；
反例再从正例基础上删掉一条 W 声明，验证 CLI 会点名报出缺失的那个词，不是被豁免悄悄放行。
"""
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / 'tests' / 'fixtures' / 'week03-data.js'


def run_check_data(target):
    return subprocess.run(
        ['node', str(ROOT / 'tools' / 'validation' / 'check_data.js'), str(target)],
        cwd=str(ROOT), capture_output=True, text=True, encoding='utf-8'
    )


def count_pass_fail(stdout):
    m = re.search(r'通过 (\d+) 项，失败 (\d+) 项', stdout)
    assert m, f'未能在输出里找到通过/失败计数：{stdout[-500:]}'
    return int(m.group(1)), int(m.group(2))


def base_fixture_as_week4():
    """把 week03 fixture 的周次相关声明改成 4，其余（含 RESERVED 与 W）原样保留。

    真实 week01-03.data.js（磁盘上的现役数据）到 week3 为止已经累计教满全部 19 个
    字位（wall_order.js 的 gatherWeekRecordsUpTo 会读它们）——week03 fixture的
    wallLetters 本就是这满编 19 个。若原样把 fixture 的 newPatterns（本属于"周3
    新教"的 g/o/u/l/f/b）套在 META.week=4 的语境下，wall_order.js 会认为磁盘上的
    真实 week3 与这份"假冒 week4"文件对同一批字位各申报了一次首教，判"教学顺序
    重复"（与本文件要验证的 P16 无关的另一类失败）。改成 newPatterns:[]（与真实
    week04.data.js 的巩固周形态一致——week4 不再新教任何字位）+ FIRST_TEACH_DAY:{}
    （DATA-WALL-01 断言②要求其键集合恒等于 newPatterns），规避这个交叉引用，只让
    这份 fixture 单独测 P16 这一条规则。"""
    raw = FIXTURE.read_text(encoding='utf-8')
    old_week = '"week": 3,'
    old_key = '"storageKey": "soundblocks-w3-v1",'
    old_new_patterns = '"newPatterns": ["g","o","u","l","f","b"],'
    old_first_teach_day = 'const FIRST_TEACH_DAY = { g:1, o:2, u:3, l:4, f:5, b:6 };'
    assert old_week in raw, 'fixture 里找不到 "week": 3，检查 fixture 是否已变'
    assert old_key in raw, 'fixture 里找不到 storageKey soundblocks-w3-v1，检查 fixture 是否已变'
    assert old_new_patterns in raw, 'fixture 里找不到 newPatterns 声明，检查 fixture 是否已变'
    assert old_first_teach_day in raw, 'fixture 里找不到 FIRST_TEACH_DAY 声明，检查 fixture 是否已变'
    raw = raw.replace(old_week, '"week": 4,', 1)
    raw = raw.replace(old_key, '"storageKey": "soundblocks-w4-v1",', 1)
    raw = raw.replace(old_new_patterns, '"newPatterns": [],', 1)
    raw = raw.replace(old_first_teach_day, 'const FIRST_TEACH_DAY = {};', 1)
    return raw


class ReservedInWAtWeek4Tests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)

    def test_reserved_already_in_w_still_passes_at_week4(self):
        # 正例：week03 fixture 的 RESERVED 五词（gut/bud/fin/lob/fib）本就在 W 里
        # （week<4 从来没有被豁免过），改成 week4 后，删掉豁免不应该引入任何新失败——
        # "豁免只是把 week>=4 这条本来就该满足的规则悄悄跳过"，数据本身已经合格时，
        # 删豁免是无操作。
        raw = base_fixture_as_week4()
        target = Path(self.tmpdir.name) / 'week04-data-reserved-in-w.js'
        target.write_text(raw, encoding='utf-8')

        result = run_check_data(target)
        self.assertEqual(result.returncode, 0,
            f'RESERVED 五词已在 W 里，week4 不应报错：{result.stdout[-1500:]}')
        _, f = count_pass_fail(result.stdout)
        self.assertEqual(f, 0)

    def test_reserved_missing_from_w_fails_at_week4(self):
        # 反例：从"合格"基础上删掉一条 W 声明（fib），模拟"周检词只在 RESERVED、
        # 不在 W"——删豁免前这种数据在 week>=4 会被静默放行（`META.week >= 4 ||`
        # 恒真，右侧 W[w] 从不求值），删豁免后必须被拦下并点名具体是哪个词。
        raw = base_fixture_as_week4()
        old_w_entry = "gut:{zh:'肚子',art:null},  bud:{zh:'花苞',art:null},  fin:{zh:'鱼鳍',art:null},  lob:{zh:'高高抛起',art:null},  fib:{zh:'小谎话',art:null}"
        assert old_w_entry in raw, 'fixture 里找不到目标 W 声明整行，检查 fixture 是否已变'
        new_w_entry = "gut:{zh:'肚子',art:null},  bud:{zh:'花苞',art:null},  fin:{zh:'鱼鳍',art:null},  lob:{zh:'高高抛起',art:null}"
        raw = raw.replace(old_w_entry, new_w_entry, 1)
        target = Path(self.tmpdir.name) / 'week04-data-reserved-missing-from-w.js'
        target.write_text(raw, encoding='utf-8')

        result = run_check_data(target)
        self.assertNotEqual(result.returncode, 0,
            '周检词 "fib" 只在 RESERVED、不在 W 时，week4 应报失败（删豁免前会被静默放行）')
        self.assertIn('周检词 "fib" 不在 W 里', result.stdout,
            f'失败消息应点名具体缺失的周检词 "fib"：{result.stdout[-1500:]}')

    def base_fixture_with_reserved_retest(self):
        """在 week4 化的 fixture 基础上追加一份 RESERVED_RETEST 声明（week03
        fixture 本身没有这个常量——它是 monthly 专属，weekly fixture 不声明）。
        五个复测词全取自 fixture 已有的 W 词条（pin/pan/nap/tap/tip，均已在 W 里
        有释义、全是已教字位的三字位 CVC），保证"正例"天然合格，不需要额外造词。"""
        raw = base_fixture_as_week4()
        old_reserved = "const RESERVED = ['gut','bud','fin','lob','fib'];   /* 周检五词，全 CVC，本周任何练习/游戏/小书里都不出现 */"
        assert old_reserved in raw, 'fixture 里找不到 RESERVED 声明，检查 fixture 是否已变'
        new_block = old_reserved + "\nconst RESERVED_RETEST = ['pin','pan','nap','tap','tip'];   /* H1 测试专用：复测五词，均已在 W 里有释义 */"
        raw = raw.replace(old_reserved, new_block, 1)
        return raw

    def test_reserved_retest_already_in_w_still_passes_at_week4(self):
        # H1（轮 D 复审第二轮，外审 high，2026-09-10）正例：RESERVED_RETEST 五词
        # （pin/pan/nap/tap/tip）本就在 W 里，追加这个声明不应引入①「复测词不在 W
        # 里」这条新失败。
        #
        # 范围说明：这份 fixture 的 assessmentMode 仍是 'weekly'（week03 fixture
        # 原样），追加 RESERVED_RETEST 声明本身会触发⑩测评隔离的另一条独立规则
        # 「weekly 周不得声明 RESERVED_RETEST」——那是 assessmentMode 路由的职责，
        # 与本条要验证的①「复测词是否在 W 里」是两件不同的事，不在这条测试的范围内
        # （造一份完整合法的 monthly fixture 需要 PROBE_A/PROBE_B/GLOBAL_RESERVED/
        # ASSESS_TEXT 等一整套字段，成本远超本条要证明的东西）。这里只断言①那一条
        # 具体的失败消息不出现，不要求整体 0 失败。
        raw = self.base_fixture_with_reserved_retest()
        target = Path(self.tmpdir.name) / 'week04-data-reserved-retest-in-w.js'
        target.write_text(raw, encoding='utf-8')

        result = run_check_data(target)
        self.assertNotIn('不在 W 里', result.stdout,
            f'RESERVED_RETEST 五词已在 W 里，①这一层不应报任何"不在 W 里"的失败：{result.stdout[-1500:]}')
        self.assertIn('weekly 周不得声明 RESERVED_RETEST', result.stdout,
            'range check：这份 fixture 仍是 weekly，应该命中⑩的独立规则（与本条无关，只是确认 fixture 状态符合预期）')

    def test_reserved_retest_missing_from_w_fails_at_week4(self):
        # H1 反例：删掉复测词 'tip' 的 W 声明——改前 check_data.js ①「保留词不在 W
        # 里」只查 RESERVED（周检词），完全不查 RESERVED_RETEST（复测词），这类
        # 数据缺陷在①这一层查不出来（只有 monthly 路径的 assertCvcByGraphemes 分词
        # 失败时才会连带暴露，且报错信息不会点名"复测词缺释义"这件事本身）。改后
        # 应该在①这一层就被拦下，并点名是"复测词"不是笼统的"保留词"。
        raw = self.base_fixture_with_reserved_retest()
        old_w_entry = "pan:{zh:'平底锅'"
        assert old_w_entry in raw, 'fixture 里找不到 W.pan 声明起始，检查 fixture 是否已变'
        old_tip_entry = "tip:{zh:'小费'"
        assert old_tip_entry in raw, 'fixture 里找不到 W.tip 声明起始，检查 fixture 是否已变'
        # tip 声明的完整形态需要连同它所在的整行一起核对，直接找到该 key 到下一个
        # 逗号为止的片段整体删除，避免破坏同一行里其它词条的声明。
        m = re.search(r"tip:\{zh:'[^']*',art:[^,}]*\},?\s*", raw)
        assert m, '找不到完整的 tip:{...} 声明片段，检查 fixture 格式是否已变'
        raw = raw[:m.start()] + raw[m.end():]
        target = Path(self.tmpdir.name) / 'week04-data-reserved-retest-missing-from-w.js'
        target.write_text(raw, encoding='utf-8')

        result = run_check_data(target)
        self.assertNotEqual(result.returncode, 0,
            '复测词 "tip" 只在 RESERVED_RETEST、不在 W 时，week4 应报失败')
        self.assertIn('复测词 "tip" 不在 W 里', result.stdout,
            f'失败消息应点名具体缺失的复测词 "tip"，且措辞应是"复测词"不是"周检词"：{result.stdout[-1500:]}')


class AssessmentWordsSafeAccessTests(unittest.TestCase):
    """H-M4（段 3 第九批，外审 medium，2026-09-10）：frontend/src/weeks/week04.data.js
    的 `ASSESSMENT_WORDS` 声明从 W 派生 zh 释义（`W[w].zh`），这行声明是
    tools/validation/load_data.js NAMES 之一，`loadData()` 用 vm 执行它的时机早于
    check_data.js ①「保留词在 W」检查——若某个 RESERVED 词漏写进 W，改前
    `W[w].zh` 会在 vm 执行阶段直接抛出未包装的 TypeError（check_data.js 的
    loadData try/catch 只能吐出这句原生报错、以 exit 2 退出），①原本准备好的清晰
    校验消息（"周检词 X 不在 W 里"）完全没有机会跑到。改用 `(W[w] || {}).zh`
    安全取值后，应该改为走①的正常失败路径（清晰消息 + exit 1，不是原生异常 +
    exit 2）。

    本测试直接对真实 frontend/src/weeks/week04.data.js 做最小手术式临时删除（删掉
    一条 W 声明），跑真实 CLI，测完原样写回（byte-safe，newline=''——同
    CumulativeSightWordExemptionTests 踩过的坑：Python 文本模式在 Windows 上默认
    按 os.linesep 转换换行，不传 newline='' 会把这份 LF 文件悄悄写回 CRLF，即使
    还原后字符内容一致，也会在磁盘上留下一次整文件换行符变更）。
    """

    def setUp(self):
        self.week04_path = ROOT / 'frontend' / 'src' / 'weeks' / 'week04.data.js'
        with open(self.week04_path, 'r', encoding='utf-8', newline='') as f:
            self.week04_original = f.read()
        self.addCleanup(self._restore_week04)

    def _restore_week04(self):
        with open(self.week04_path, 'w', encoding='utf-8', newline='') as f:
            f.write(self.week04_original)

    def test_missing_w_entry_gives_clean_validation_message_not_crash(self):
        needle = '  "dab": {\n    "zh": "轻点",\n    "art": null\n  },\n'
        self.assertIn(needle, self.week04_original,
            '真实 week04.data.js 里找不到目标 W.dab 声明整块，检查文件是否已变')
        mutated = self.week04_original.replace(needle, '', 1)
        self.assertNotEqual(mutated, self.week04_original)
        with open(self.week04_path, 'w', encoding='utf-8', newline='') as f:
            f.write(mutated)

        result = run_check_data(self.week04_path)
        self.assertNotEqual(result.returncode, 0, '周检词 "dab" 缺 W 条目时应该报失败')
        self.assertNotEqual(result.returncode, 2,
            'H-M4：不应该是 loadData 阶段崩溃退出（exit 2），应该是①正常校验失败路径（exit 1）：'
            f'stdout={result.stdout[-800:]} stderr={result.stderr[-800:]}')
        self.assertIn('周检词 "dab" 不在 W 里', result.stdout,
            f'H-M4：应得到①准备好的清晰校验消息，实际 stdout：{result.stdout[-1500:]}')
        self.assertNotIn('Cannot read', result.stderr,
            f'H-M4：不应该出现未包装的原生 TypeError 消息，实际 stderr：{result.stderr[-500:]}')


if __name__ == '__main__':
    unittest.main()
