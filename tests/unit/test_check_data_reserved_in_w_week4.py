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
        self.assertIn('保留词 "fib" 不在 W 里', result.stdout,
            f'失败消息应点名具体缺失的周检词 "fib"：{result.stdout[-1500:]}')


if __name__ == '__main__':
    unittest.main()
