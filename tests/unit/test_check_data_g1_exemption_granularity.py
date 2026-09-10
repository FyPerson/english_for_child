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

    def test_sight_word_in_sight_and_words_block_unspellable_still_checked(self):
        # 入口级测试（轮 D 复审第三轮，H1+H2，2026-09-10）：认读词同时在 sight
        # 声明本身（阅读文本类来源，合法豁免）与 words 块（词卡墙，字位操作类
        # 来源）两处出现，且这个词本身在 week02 字位表下无法分词（合成词 'low'：
        # l/o/w 均未教）。改前 check_data.js ③ 循环开头有一条独立的
        # `if (SIGHT.has(w.toLowerCase())) continue;`——只要词在认读词集合里就
        # 整词跳过，不管当前记录的 kind，words 块这处真实的"字位操作类来源"
        # 会被一起放过。改后 words 块这条记录必须被查出。
        raw = self.baseline_text
        sight_needle = "{b:'sight', items:[['the','这个 / 那个'],['is','是']]},"
        self.assertIn(sight_needle, raw, 'fixture 里找不到目标 sight 块声明，检查 fixture 是否已变')
        poisoned = raw.replace(
            sight_needle,
            "{b:'sight', items:[['the','这个 / 那个'],['is','是'],['low','低']]},",
            1
        )
        self.assertNotEqual(poisoned, raw)
        words_needle = "{b:'words', items:['cat','cap','can','kit']}"
        self.assertIn(words_needle, poisoned, 'fixture 里找不到目标 words 块声明，检查 fixture 是否已变')
        poisoned = poisoned.replace(
            words_needle,
            "{b:'words', items:['cat','cap','can','kit','low']}",
            1
        )
        target = Path(self.tmpdir.name) / 'week02-data-sight-and-words-unspellable.js'
        target.write_text(poisoned, encoding='utf-8')

        result = run_check_data(target)
        self.assertNotEqual(result.returncode, 0,
            '认读词 "low" 同时出现在 sight 声明（豁免）与 words 块（不豁免）时，words 块这条应该被查出，不应被整词跳过放行')
        self.assertIn('"low"', result.stdout)
        self.assertIn('无法按字位分词', result.stdout)
        self.assertIn('words', result.stdout,
            f'失败消息应点名 words 这个非豁免来源，实际：{result.stdout[-1500:]}')

    def test_g1_pos_bucket_in_week1_still_exempt(self):
        # 正例回归：第一周的 pos 桶依然豁免（规范原文允许的那一条）。用 week01
        # 真实数据核对：若 week01 的 G1 pos 桶本就没有不可分词的词，这条测试至少
        # 确认基线仍然通过（不额外注入变异，只做"现状仍然绿"的回归锚点）。
        week01 = ROOT / 'frontend' / 'src' / 'weeks' / 'week01.data.js'
        result = run_check_data(week01)
        self.assertEqual(result.returncode, 0,
            f'week01 真实数据应保持通过（G1 pos 桶豁免在第一周仍然生效）：{result.stdout[-1500:]}')


class CumulativeSightWordExemptionTests(unittest.TestCase):
    """I-H1（段 3 第九批，外审 high，2026-09-10）：check_data.js ③ 传给
    `isExemptConsumptionRecord` 的 `cumulativeSightWords` 改前只是"本周 SIGHT"（本地
    变量，只收当前正在校验的这份文件自己声明的 sight 记录），不是跨周累计——历史周
    教过的认读词出现在**后续周**的 book-page/sentences 里，会因为"不在当周这个临时
    集合里"被误判为不豁免，与语义套件早已修好的"累计认读词"口径（H3）不一致。

    真实项目数据里找不到"某个字母从未被教过"的天然认读词案例可以直接复用——sight
    词虽然拼读不规则，但组成它们的每个字母通常已经单独教过（比如 'the' = t+h+e，
    三个字母都是已教字母，idsForWord('the') 能正常分词，不会触发"无法按字位分词"，
    没有分辨力）。这里对 frontend/src/weeks/week01.data.js 做一次最小手术式临时
    修改：追加一个含未教字母 'z'（本项目四周数据从未教过 z）的合成认读词 'zil'，
    测完原样写回读到的原始字节（不用 git 命令还原，规避"改动可能撞上仓库当前未
    提交的其它改动"这条风险；与 test_wall_order.js 的 fs.readFileSync 猴子补丁思路
    同一目的、不同手法——这里要跑的是真实 CLI 子进程，进程内猴子补丁对子进程无效，
    只能真的写盘再还原）。
    """

    def setUp(self):
        # newline=''（读写都要）：本仓库 .gitattributes 强制 `* text=auto eol=lf`，
        # 工作区文本文件一律 LF。Python 的文本模式在 Windows 上默认按 os.linesep
        # 做换行转换（read 端把 CRLF 归一成 \n 不算坏事，但 write 端会把 \n 写回
        # CRLF）——不传 newline='' 会把这份真实文件从 LF 悄悄改写成 CRLF，就算
        # 还原时字符内容完全一致，也会在磁盘上留下一次"整文件换行符变更"的假改动
        # （已实测踩过：第一版用 read_text()/write_text() 不传 newline，还原后
        # git status 显示文件被修改，diff 却因为 git 的 autocrlf 比对时做了归一化
        # 而看不出差异——具有迷惑性，唯一可靠的检查是直接读字节数一数 \r\n）。
        self.week01_path = ROOT / 'frontend' / 'src' / 'weeks' / 'week01.data.js'
        with open(self.week01_path, 'r', encoding='utf-8', newline='') as f:
            self.week01_original = f.read()
        self.addCleanup(self._restore_week01)
        needle = "{b:'sight', items:[['I','我'],['a','一个'],['see','看见']]},"
        self.assertIn(needle, self.week01_original,
            'week01.data.js 目标 sight 声明未找到，检查该文件是否已变')
        mutated = self.week01_original.replace(
            needle,
            "{b:'sight', items:[['I','我'],['a','一个'],['see','看见'],"
            "['zil','测试认读词（I-H1 合成，z 从未被教过）']]},",
            1
        )
        self.assertNotEqual(mutated, self.week01_original)
        with open(self.week01_path, 'w', encoding='utf-8', newline='') as f:
            f.write(mutated)

        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        self.week02_baseline = FIXTURE.read_text(encoding='utf-8')

    def _restore_week01(self):
        # 副本对比式还原（不用 git 命令）：写回 setUp 一开始读到的原始字节
        # （newline=''，理由同上，避免把 LF 悄悄写回 CRLF）。
        with open(self.week01_path, 'w', encoding='utf-8', newline='') as f:
            f.write(self.week01_original)

    def test_historical_sight_word_exempt_in_book_page(self):
        # 正例：week01 声明的认读词 'zil' 出现在 week02 的 book-page 正文（阅读文本类
        # 来源）——改前只信本周 SIGHT，week02 自己没声明过 'zil'，会被误判为不豁免、
        # 因无法分词（z 未教）而报失败；改后应正确沿用累计集合豁免，CLI 通过。
        needle = "{line:'Dan sat.',          art:'danSit',   zh:'丹也坐下了。'},"
        self.assertIn(needle, self.week02_baseline, 'fixture 里找不到目标 BOOK 页台词，检查 fixture 是否已变')
        poisoned = self.week02_baseline.replace(needle, needle.replace('Dan sat.', 'Dan has zil.'), 1)
        self.assertNotEqual(poisoned, self.week02_baseline)
        target = Path(self.tmpdir.name) / 'week02-data-ih1-book-page-zil.js'
        target.write_text(poisoned, encoding='utf-8')

        result = run_check_data(target)
        self.assertEqual(result.returncode, 0,
            'I-H1：week01 声明的认读词 "zil" 出现在 week02 的 book-page 正文时应被跨周累计'
            f'豁免、CLI 应正常通过：{result.stdout[-1500:]}\n{result.stderr[-1000:]}')

    def test_historical_sight_word_still_checked_in_words_block(self):
        # 反例：同一个词 'zil' 改放进 week02 的 words 块（字位操作类来源，不在
        # SIGHT_EXEMPT_READING_KINDS 里）——即使它跨周累计豁免（认读词身份成立），
        # 出现在这类要求可拼读的位置仍然不豁免，应该被查出且报"无法按字位分词"。
        words_needle = "{b:'words', items:['cat','cap','can','kit']}"
        self.assertIn(words_needle, self.week02_baseline, 'fixture 里找不到目标 words 块声明，检查 fixture 是否已变')
        poisoned = self.week02_baseline.replace(
            words_needle, "{b:'words', items:['cat','cap','can','kit','zil']}", 1)
        self.assertNotEqual(poisoned, self.week02_baseline)
        target = Path(self.tmpdir.name) / 'week02-data-ih1-words-zil.js'
        target.write_text(poisoned, encoding='utf-8')

        result = run_check_data(target)
        self.assertNotEqual(result.returncode, 0,
            'I-H1：认读词 "zil" 即使跨周累计豁免成立，出现在 words 块（字位操作类来源）时仍不应豁免')
        self.assertIn('"zil"', result.stdout)
        self.assertIn('无法按字位分词', result.stdout)
        self.assertIn('words', result.stdout,
            f'失败消息应点名 words 这个非豁免来源，实际：{result.stdout[-1500:]}')


if __name__ == '__main__':
    unittest.main()
