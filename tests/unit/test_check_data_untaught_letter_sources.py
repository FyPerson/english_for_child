"""B-M2（外审 medium，2026-09-10）：check_data.js ③「字母全在已教范围内」改前只遍历
本文件手写收集的 usedWords（blend/initialpick/words/pair/sight/flash/sentences 七类
块 + G1_ROUNDS + G4_WORDS），BOOK.pages 与 wordforge 两类真实词消费入口从未进入这个
检查——含未教字母的书页正文、或换头造词生成的词，不会被③抓到。

改法（见 tools/validation/check_data.js ③ 附近注释）：语料换成共享抽取器
tools/validation/word_consumers.js 的 collectWordConsumption，枚举全部 15 类来源，
含 book-page 与 wordforge-family/wordforge-swap。

本文件按本项目"改坏副本证明会红"的规矩，走真实 CLI 入口（`node tools/validation/
check_data.js <文件>`），各配一个最小变异证明这两类此前漏检的来源现在真的会被抓到，
且失败消息点名具体的来源类型（book-page / wordforge-family）。
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


def poison_book_page_untaught_letter(raw):
    """在 BOOK.pages 的一行正文里注入一个 week02 完全没教过的字母 'z'（week02 教
    s a t i p n c k e h r m d，不含 z）。只替换 'Dan sat.' 这一行的 'sat' 为 'zat'，
    这行台词此前从未被③检查过（BOOK.pages 不在旧 usedWords 收集范围内）。"""
    needle = "{line:'Dan sat.',          art:'danSit',   zh:'丹也坐下了。'},"
    assert needle in raw, 'fixture 里找不到目标 BOOK 页台词，检查 fixture 是否已变'
    poisoned = needle.replace('Dan sat.', 'Dan zat.')
    assert poisoned != needle
    return raw.replace(needle, poisoned, 1)


def poison_wordforge_family_untaught_letter(raw):
    """在 wordforge family 块的 heads 数组里追加一个会拼出未教字母词的头
    'z'（tail 是 'at'，'z'+'at'='zat'，z 未教）。这类词此前从未被③检查过
    （wordforge 不在旧 usedWords 收集范围内）。"""
    needle = "{tail:'at', heads:['c','h','p','s']},"
    assert needle in raw, 'fixture 里找不到目标 wordforge family 声明，检查 fixture 是否已变'
    poisoned = needle.replace("heads:['c','h','p','s']", "heads:['c','h','p','s','z']")
    assert poisoned != needle
    return raw.replace(needle, poisoned, 1)


class UntaughtLetterSourceCoverageTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        self.baseline_text = FIXTURE.read_text(encoding='utf-8')
        baseline_result = run_check_data(FIXTURE)
        self.assertEqual(baseline_result.returncode, 0,
            f'基线 fixture 应全部通过：{baseline_result.stdout[-500:]}')
        _, self.baseline_fail = count_pass_fail(baseline_result.stdout)
        self.assertEqual(self.baseline_fail, 0)

    def test_book_page_untaught_letter_is_caught(self):
        injected = poison_book_page_untaught_letter(self.baseline_text)
        self.assertNotEqual(injected, self.baseline_text, '替换应生效')
        target = Path(self.tmpdir.name) / 'week02-data-book-page-untaught.js'
        target.write_text(injected, encoding='utf-8')

        result = run_check_data(target)
        self.assertNotEqual(result.returncode, 0, 'BOOK.pages 台词含未教字母应报失败')
        _, f = count_pass_fail(result.stdout)
        self.assertGreater(f, self.baseline_fail,
            f'应比基线（{self.baseline_fail}）多至少一条失败：{result.stdout[-1500:]}')
        # M4（外审 medium，2026-09-10）后 ③ 改按字位 ID 分词判断，'z' 这个字母本身
        # 不对应任何已教字位，segmentWord 找不到任何可行解析（zero solution），
        # 消息因此是"无法按字位分词"而不是逐字符列出"含未教字母 [z]"——这是 M4
        # 修复后的正确行为（逐字符列举是字符级判据才会给出的旧形态）。
        self.assertIn('"zat" 无法按字位分词', result.stdout,
            '失败消息应点名具体的词无法按字位分词（z 不是任何已教字位）')
        self.assertIn('来源：book-page', result.stdout,
            '失败消息应点名来源类型 book-page——这正是 B-M2 要证明的：BOOK.pages 这条真实消费入口此前从未被③检查过')

    def test_wordforge_family_untaught_letter_is_caught(self):
        injected = poison_wordforge_family_untaught_letter(self.baseline_text)
        self.assertNotEqual(injected, self.baseline_text, '替换应生效')
        target = Path(self.tmpdir.name) / 'week02-data-wordforge-untaught.js'
        target.write_text(injected, encoding='utf-8')

        result = run_check_data(target)
        self.assertNotEqual(result.returncode, 0, 'wordforge family 生成的词含未教字母应报失败')
        _, f = count_pass_fail(result.stdout)
        self.assertGreater(f, self.baseline_fail,
            f'应比基线（{self.baseline_fail}）多至少一条失败：{result.stdout[-1500:]}')
        # 同上：M4 后按字位 ID 分词，'z' 不是任何已教字位，segmentWord 零解。
        self.assertIn('"zat" 无法按字位分词', result.stdout,
            "失败消息应点名具体的词无法按字位分词（family: heads=[...,'z'] + tail='at' -> 'zat'，z 不是任何已教字位）")
        self.assertIn('来源：wordforge-family', result.stdout,
            '失败消息应点名来源类型 wordforge-family——这正是 B-M2 要证明的：wordforge 这条真实消费入口此前从未被③检查过')


if __name__ == '__main__':
    unittest.main()
