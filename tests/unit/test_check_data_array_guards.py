"""里程碑 2 收口批 内部预筛 M-5：wallLetters/rackG4/rackG5 三个字段第 7 步迁成字位 ID
数组后缺 Array.isArray 守卫（只有同批的 newPatterns 补了）。

背景：这三个字段都会被直接传进 frontend/src/shared/graphemes.js 的 normalizeIdList()。
若拿到迁移期遗留的旧字符串形态，normalizeIdList 会抛出未捕获的
GraphemeError('id-list-legacy-string-rejected')，整个 Node 进程带栈退出——
check_data.js 剩余全部断言（⑥—⑫）一条都不会跑。副机（GPT）沿用旧字符串形态写
第五周数据层时，拿到的会是一段陌生的栈，而不是一条"这个字段现在要写成数组"的
清晰错误。

本文件按本项目"改坏副本证明会红"的规矩，走真实 CLI 入口（`node tools/validation/
check_data.js <文件>`），不直接调 normalizeIdList——那只证明库函数会拒绝字符串，
证明不了生产入口（check_data.js）现在能不能扛住这种输入而不崩溃。
"""
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / 'tests' / 'fixtures' / 'week02-data.js'

GUARD_MESSAGE = {
    'wallLetters': 'META.wallLetters 必须是字位 ID 数组（迁移期不再接受旧的单字符串）',
    'rackG4': 'META.rackG4 必须是字位 ID 数组（迁移期不再接受旧的单字符串）',
    'rackG5': 'META.rackG5 必须是字位 ID 数组（迁移期不再接受旧的单字符串）',
}


def run_check_data(target):
    return subprocess.run(
        ['node', str(ROOT / 'tools' / 'validation' / 'check_data.js'), str(target)],
        cwd=str(ROOT), capture_output=True, text=True, encoding='utf-8'
    )


def count_pass_fail(stdout):
    m = re.search(r'通过 (\d+) 项，失败 (\d+) 项', stdout)
    assert m, ('未能在输出里找到通过/失败摘要——若进程带栈崩溃，摘要根本不会打印，'
               f'这正是本文件要拦住的回归：{stdout[-800:]}')
    return int(m.group(1)), int(m.group(2))


def poison_to_legacy_string(raw, field):
    """把 META 里 "<field>": [...] 换成迁移期遗留的旧单字符串形态 "<field>": "abc..."。
    fixture 里三个字段都是单行、逐字符字符串字面量、无嵌套括号，非贪婪正则可以安全定位。"""
    pattern = re.compile(r'"%s":\s*\[([^\]]*)\]' % re.escape(field))
    m = pattern.search(raw)
    assert m, f'fixture 里找不到 "{field}": [...] 声明'
    items = re.findall(r"'([^']*)'|\"([^\"]*)\"", m.group(1))
    letters = ''.join(a or b for a, b in items)
    assert letters, f'{field} 数组解析出的字母序列为空，检查 fixture 格式'
    replacement = f'"{field}": "{letters}"'
    assert raw.count(m.group(0)) == 1, f'"{field}": [...] 应恰好出现一次，避免误替换'
    return raw.replace(m.group(0), replacement, 1)


class ArrayFieldGuardTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        self.baseline_text = FIXTURE.read_text(encoding='utf-8')
        baseline_result = run_check_data(FIXTURE)
        self.assertEqual(baseline_result.returncode, 0,
            f'基线 fixture 应全部通过：{baseline_result.stdout[-500:]}')
        _, self.baseline_fail = count_pass_fail(baseline_result.stdout)
        self.assertEqual(self.baseline_fail, 0)

    def _assert_poison_reported_cleanly(self, field):
        injected = poison_to_legacy_string(self.baseline_text, field)
        self.assertNotEqual(injected, self.baseline_text, '替换应生效（否则测试没有真正改动文件）')
        target = Path(self.tmpdir.name) / f'week02-data-{field}-legacy-string.js'
        target.write_text(injected, encoding='utf-8')

        result = run_check_data(target)
        self.assertNotEqual(result.returncode, 0, f'{field} 是旧字符串形态时应以非 0 退出')
        # 核心断言：进程必须跑到底、打印出通过/失败摘要——不能像修复前那样带栈崩溃，
        # 让 ⑥ 到 ⑫ 剩余断言一条都不跑。count_pass_fail 解析不到摘要就会直接失败。
        _, f = count_pass_fail(result.stdout)
        self.assertGreater(f, self.baseline_fail,
            f'{field} 是旧字符串形态应比基线（{self.baseline_fail}）多至少一条失败')
        self.assertIn(GUARD_MESSAGE[field], result.stdout,
            f'{field} 的守卫消息应出现在输出里，给出清晰指引而不是让人去看一段 Node 原生栈')
        # 修复前，崩溃会把未捕获异常的类名/堆栈写到 stderr；守卫生效后不应再看到它。
        self.assertNotIn('GraphemeError', result.stderr,
            f'{field} 仍在 stderr 触发未捕获的 GraphemeError，说明守卫没有真正拦住 normalizeIdList')
        self.assertNotIn('id-list-legacy-string-rejected', result.stderr,
            f'{field} 的 stderr 仍带着底层错误码，说明进程还是崩了，不是清晰的 ok(false, ...) 失败')

    def test_wallLetters_legacy_string_reported_cleanly(self):
        self._assert_poison_reported_cleanly('wallLetters')

    def test_rackG4_legacy_string_reported_cleanly(self):
        self._assert_poison_reported_cleanly('rackG4')

    def test_rackG5_legacy_string_reported_cleanly(self):
        self._assert_poison_reported_cleanly('rackG5')


if __name__ == '__main__':
    unittest.main()
