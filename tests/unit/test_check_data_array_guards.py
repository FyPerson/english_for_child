"""里程碑 2 收口批 内部预筛 M-5：wallLetters/rackG4/rackG5 三个字段第 7 步迁成字位 ID
数组后缺 Array.isArray 守卫（只有同批的 newPatterns 补了）。

背景：这三个字段都会被直接传进 frontend/src/shared/graphemes.js 的 assertIdList()
（里程碑 2 第 8 步已把 normalizeIdList 收口改名为 assertIdList，签名也从
(value, options) 改成 (value, sounds)）。若拿到迁移期遗留的旧字符串形态，
assertIdList 会抛出未捕获的 GraphemeError('id-list-legacy-string-rejected')，
整个 Node 进程带栈退出——check_data.js 剩余全部断言（⑥—⑫）一条都不会跑。副机
（GPT）沿用旧字符串形态写第五周数据层时，拿到的会是一段陌生的栈，而不是一条
"这个字段现在要写成数组"的清晰错误。

本文件按本项目"改坏副本证明会红"的规矩，走真实 CLI 入口（`node tools/validation/
check_data.js <文件>`），不直接调 assertIdList——那只证明库函数会拒绝字符串，
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
            f'{field} 仍在 stderr 触发未捕获的 GraphemeError，说明守卫没有真正拦住 assertIdList')
        self.assertNotIn('id-list-legacy-string-rejected', result.stderr,
            f'{field} 的 stderr 仍带着底层错误码，说明进程还是崩了，不是清晰的 ok(false, ...) 失败')

    def test_wallLetters_legacy_string_reported_cleanly(self):
        self._assert_poison_reported_cleanly('wallLetters')

    def test_rackG4_legacy_string_reported_cleanly(self):
        self._assert_poison_reported_cleanly('rackG4')

    def test_rackG5_legacy_string_reported_cleanly(self):
        self._assert_poison_reported_cleanly('rackG5')


def poison_to_unknown_id(raw, field):
    """把 META 里 "<field>": [...] 的第一个元素换成 SOUNDS 里不存在的 ID 'zz'。

    里程碑 2 第 8 步给 assertIdList 新增了一层校验：数组每一项都要真的在 sounds 里
    存在，不存在则抛 GraphemeError('unknown-id')。这是本文件之前没有覆盖过的
    校验层——之前只测过"整个字段是字符串"这一种坏输入，没测过"字段是合法数组，
    但数组里混进一个不存在的 ID"这种新坏输入是否也会被 check_data.js 的
    safeAssertIdList 妥善捕获而不是带栈崩溃。"""
    pattern = re.compile(r'"%s":\s*\[([^\]]*)\]' % re.escape(field))
    m = pattern.search(raw)
    assert m, f'fixture 里找不到 "{field}": [...] 声明'
    items = [a or b for a, b in re.findall(r"'([^']*)'|\"([^\"]*)\"", m.group(1))]
    assert items, f'{field} 数组为空，检查 fixture 格式'
    poisoned_items = ['zz'] + items[1:]
    replacement = '"%s": [%s]' % (field, ','.join(f"'{x}'" for x in poisoned_items))
    assert raw.count(m.group(0)) == 1, f'"{field}": [...] 应恰好出现一次，避免误替换'
    return raw.replace(m.group(0), replacement, 1)


class UnknownIdGuardTests(unittest.TestCase):
    """第 8 步新增的 safeAssertIdList 防崩溃包装：同 ArrayFieldGuardTests 的规矩，
    走真实 CLI 入口证明「数组含未知 ID 时进程仍能跑到底、给出清晰失败」，而不是
    像 assertIdList 未被包装时那样带栈崩溃、让 ⑥—⑫ 剩余断言一条都不跑。"""

    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        self.baseline_text = FIXTURE.read_text(encoding='utf-8')
        baseline_result = run_check_data(FIXTURE)
        self.assertEqual(baseline_result.returncode, 0,
            f'基线 fixture 应全部通过：{baseline_result.stdout[-500:]}')
        _, self.baseline_fail = count_pass_fail(baseline_result.stdout)
        self.assertEqual(self.baseline_fail, 0)

    def _assert_unknown_id_reported_cleanly(self, field):
        injected = poison_to_unknown_id(self.baseline_text, field)
        self.assertNotEqual(injected, self.baseline_text, '替换应生效（否则测试没有真正改动文件）')
        target = Path(self.tmpdir.name) / f'week02-data-{field}-unknown-id.js'
        target.write_text(injected, encoding='utf-8')

        result = run_check_data(target)
        self.assertNotEqual(result.returncode, 0, f'{field} 含未知 ID 时应以非 0 退出')
        # 核心断言：进程必须跑到底、打印出通过/失败摘要——不能带栈崩溃让剩余断言不跑。
        _, f = count_pass_fail(result.stdout)
        self.assertGreater(f, self.baseline_fail,
            f'{field} 含未知 ID 应比基线（{self.baseline_fail}）多至少一条失败')
        self.assertIn(f'{field} 未通过字位 ID 校验（unknown-id）', result.stdout,
            f'{field} 含未知 ID 时应出现 safeAssertIdList 的清晰失败消息，而不是让人去看一段 Node 原生栈')
        self.assertIn('zz', result.stdout, '失败消息应点名具体的未知 ID zz')
        # 修复前（若没有 safeAssertIdList 包装），崩溃会把未捕获异常的类名/堆栈写到 stderr。
        self.assertNotIn('GraphemeError', result.stderr,
            f'{field} 仍在 stderr 触发未捕获的 GraphemeError，说明 safeAssertIdList 没有真正拦住 unknown-id')
        self.assertNotIn('unknown-id', result.stderr,
            f'{field} 的 stderr 仍带着底层错误码，说明进程还是崩了，不是清晰的 ok(false, ...) 失败')

    def test_wallLetters_unknown_id_reported_cleanly(self):
        self._assert_unknown_id_reported_cleanly('wallLetters')

    def test_rackG4_unknown_id_reported_cleanly(self):
        # META.rackG4 是字位 ID 的多重集（保留重复项，方案 §2.3），poison_to_unknown_id
        # 只替换第一个元素，不影响"多重集"这个形状本身，仍是合法的坏输入构造。
        self._assert_unknown_id_reported_cleanly('rackG4')

    def test_rackG5_unknown_id_reported_cleanly(self):
        self._assert_unknown_id_reported_cleanly('rackG5')


# ---- M4（外审 medium，2026-09-10）：poison_to_unknown_id 只覆盖了"合法字符串但
# 在 SOUNDS 里不存在"这一种坏元素。assertIdList 对元素本身还有更早一层类型判断
# （typeof id !== 'string' -> id-list-invalid），null/数字/空串三类没有被覆盖过——
# 空串虽然 typeof 是 'string'，能跳过类型判断，但会落进 resolveSoundEntry 的
# unknown-id 分支（hasOwnProperty(sounds, '') 恒假）。四类都要各自证明 check_data.js
# 的 safeAssertIdList 包装能扛住而不崩溃，与 UnknownIdGuardTests 同一套写法。
def poison_element(raw, field, replacement_literal):
    """把 META 里 "<field>": [...] 的第一个元素换成 replacement_literal 这个**原样
    写入的字面量**（不加引号——调用方自己决定是不是字符串，null/42 这类非字符串
    字面量才需要这样传）。"""
    pattern = re.compile(r'"%s":\s*\[([^\]]*)\]' % re.escape(field))
    m = pattern.search(raw)
    assert m, f'fixture 里找不到 "{field}": [...] 声明'
    items = [a or b for a, b in re.findall(r"'([^']*)'|\"([^\"]*)\"", m.group(1))]
    assert items, f'{field} 数组为空，检查 fixture 格式'
    poisoned_items = [replacement_literal] + [f"'{x}'" for x in items[1:]]
    replacement = '"%s": [%s]' % (field, ','.join(poisoned_items))
    assert raw.count(m.group(0)) == 1, f'"{field}": [...] 应恰好出现一次，避免误替换'
    return raw.replace(m.group(0), replacement, 1)


class ElementTypeGuardTests(unittest.TestCase):
    """M4：数组元素本身是 null / 数字 / 空串 / 非法 ID（合法字符串但 SOUNDS 里不存在）
    四类坏输入时，check_data.js 必须仍能跑到底并给出清晰失败，而不是带栈崩溃。只用
    rackG4 一个字段做代表——三个字段共用同一条 safeAssertIdList 包装路径（见
    check_data.js 的 safeAssertIdList 定义），wallLetters/rackG5 已由
    ArrayFieldGuardTests/UnknownIdGuardTests 证明走的是同一函数，这里不重复三组合。"""

    FIELD = 'rackG4'

    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        self.baseline_text = FIXTURE.read_text(encoding='utf-8')
        baseline_result = run_check_data(FIXTURE)
        self.assertEqual(baseline_result.returncode, 0,
            f'基线 fixture 应全部通过：{baseline_result.stdout[-500:]}')
        _, self.baseline_fail = count_pass_fail(baseline_result.stdout)
        self.assertEqual(self.baseline_fail, 0)

    def _run_poisoned(self, literal, filename_suffix):
        injected = poison_element(self.baseline_text, self.FIELD, literal)
        self.assertNotEqual(injected, self.baseline_text, '替换应生效（否则测试没有真正改动文件）')
        target = Path(self.tmpdir.name) / f'week02-data-{self.FIELD}-{filename_suffix}.js'
        target.write_text(injected, encoding='utf-8')
        result = run_check_data(target)
        # 核心断言：进程必须跑到底、打印出通过/失败摘要——不能带栈崩溃让 ⑥—⑫ 剩余
        # 断言一条都不跑。count_pass_fail 解析不到摘要就会直接失败。
        _, f = count_pass_fail(result.stdout)
        self.assertNotEqual(result.returncode, 0, f'{self.FIELD} 含 {filename_suffix} 元素时应以非 0 退出')
        self.assertGreater(f, self.baseline_fail,
            f'{self.FIELD} 含 {filename_suffix} 元素应比基线（{self.baseline_fail}）多至少一条失败')
        self.assertNotIn('GraphemeError', result.stderr,
            f'{self.FIELD} 含 {filename_suffix} 元素仍在 stderr 触发未捕获的 GraphemeError，说明守卫没有真正拦住')
        return result

    def test_null_element_reported_cleanly(self):
        result = self._run_poisoned('null', 'null-element')
        self.assertIn('rackG4 未通过字位 ID 校验（id-list-invalid）', result.stdout,
            'null 元素应命中 assertIdList 的类型检查（typeof !== string），不是 unknown-id')
        self.assertIn('第 0 项', result.stdout, '失败消息应点名是第几项元素非法')

    def test_number_element_reported_cleanly(self):
        result = self._run_poisoned('42', 'number-element')
        self.assertIn('rackG4 未通过字位 ID 校验（id-list-invalid）', result.stdout,
            '数字元素应命中 assertIdList 的类型检查（typeof !== string），不是 unknown-id')
        self.assertIn('第 0 项', result.stdout)

    def test_empty_string_element_reported_cleanly(self):
        result = self._run_poisoned("''", 'empty-string-element')
        # 空串 typeof 是 'string'，跳过类型检查，落进 resolveSoundEntry 的 unknown-id
        # 分支（hasOwnProperty(sounds, '') 恒假）——与 null/数字不是同一条错误码，
        # 但同样必须被 safeAssertIdList 捕获而不是让 resolveSoundEntry 的异常冒出来。
        self.assertIn('rackG4 未通过字位 ID 校验（unknown-id）', result.stdout,
            '空串元素应命中 resolveSoundEntry 的 unknown-id 分支，不是 id-list-invalid')

    def test_invalid_id_element_reported_cleanly(self):
        # 与 UnknownIdGuardTests 的 'zz' 不同：这里用一个连字位 ID 字符集规则
        # （^[a-z][a-z0-9_]*$）都不满足的字符串（含连字符），覆盖"字符串合法但
        # 既不是合法 ID 格式、也不在 SOUNDS 里"这一类，与"格式合法但未教过"的 zz
        # 走的是同一个 unknown-id 分支（resolveSoundEntry 只查 hasOwnProperty，
        # 不重复校验 ID 字符集格式），一并证明两种"非法 ID"都不会让进程崩溃。
        result = self._run_poisoned("'123-bad'", 'invalid-id-element')
        self.assertIn('rackG4 未通过字位 ID 校验（unknown-id）', result.stdout)
        self.assertIn('123-bad', result.stdout, '失败消息应点名具体的非法 ID')


class LegalDuplicateRackPositiveTest(unittest.TestCase):
    """M4 收尾正例：rack 是多重集，不是集合（方案 §2.3）——一个字位在 rackG4 里
    合法出现两次（周一"每个字母两块积木"的真实场景，如 week01 的 ssaattiippnn）
    时，safeAssertIdList 不应把"重复元素"误判成非法输入。用 week02 fixture 的
    rackG4 追加一个已存在字位的重复项，断言失败数不比基线多（不引入新的假失败）。"""

    def test_duplicate_element_in_rackG4_is_not_flagged_as_invalid(self):
        raw = FIXTURE.read_text(encoding='utf-8')
        baseline_result = run_check_data(FIXTURE)
        self.assertEqual(baseline_result.returncode, 0)
        _, baseline_fail = count_pass_fail(baseline_result.stdout)
        self.assertEqual(baseline_fail, 0)

        pattern = re.compile(r'"rackG4":\s*\[([^\]]*)\]')
        m = pattern.search(raw)
        self.assertIsNotNone(m, 'fixture 里找不到 "rackG4": [...] 声明')
        items = [a or b for a, b in re.findall(r"'([^']*)'|\"([^\"]*)\"", m.group(1))]
        self.assertIn('c', items, "fixture 的 rackG4 应含 'c'，检查 fixture")
        duplicated_items = items + ['c']  # 合法重复：c 出现两次
        replacement = '"rackG4": [%s]' % ','.join(f"'{x}'" for x in duplicated_items)
        injected = raw.replace(m.group(0), replacement, 1)
        self.assertNotEqual(injected, raw)

        with tempfile.TemporaryDirectory() as tmpdir:
            target = Path(tmpdir) / 'week02-data-rackG4-legal-duplicate.js'
            target.write_text(injected, encoding='utf-8')
            result = run_check_data(target)

        _, f = count_pass_fail(result.stdout)
        self.assertEqual(result.returncode, 0, f'rackG4 里合法重复一个字位不应导致失败：{result.stdout[-800:]}')
        self.assertEqual(f, baseline_fail, 'rackG4 含合法重复元素不应比基线多任何失败——safeAssertIdList 不应把重复当非法')


if __name__ == '__main__':
    unittest.main()
