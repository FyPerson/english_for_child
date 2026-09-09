"""check_data.js 对 SOUNDS 表级 schema 问题（issue.id === null）的漏报修复（里程碑 2
收口批 外审 H3）单测。

背景：tools/validation/graphemes.js 的 validateSoundsSchema 用 issue.id === null 表示
"表级"问题（sounds 本身不是普通映射对象 / sounds 原型链上携带额外可枚举数据——
sounds-invalid / sounds-prototype-chain），与"逐键"问题（issue.id 是 SOUNDS 的某个真实
键）混在同一个数组里返回。check_data.js 改前只按 `Object.keys(SOUNDS)` 逐键读取
`soundsIssuesByKey[k]`，null 永远不等于任何真实键，这类表级问题会被 validateSoundsSchema
正确识别出来，却从未传到 `ok()`——校验器本身没问题，是生产入口（check_data.js 的
CLI）漏报。

本文件按本项目"改坏副本证明会红"的规矩，走真实 CLI 入口（`node tools/validation/
check_data.js <文件>`），不是只调 validateSoundsSchema 本身（那只证明校验器识别出问题，
证明不了生产入口会失败——这正是 H3 指出的"测试看起来在验证 X、实际验证 Y"的同一种
故障模式，这次不能再犯）。

注入手法：SOUNDS 的原始声明（`const SOUNDS = {...多行...};`）用 load_data.js 的
declaration() 精确提取后，把其中的换行折叠成空格拼成单行，再包一层
`Object.assign(Object.create({__poison:1}), {...})`——单行是关键：load_data.js 的
declaration() 对含分号的单行声明直接整行返回，不需要靠"整块以 `};` 收尾"这条括号
匹配式的终止符逻辑（那条逻辑遇到 `});` 这种多出一层括号的收尾会解析失败）。折叠换行
是安全的：SOUNDS 声明里只有单引号字符串字面量，没有模板字面量，不含字面换行符。
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


def extract_sounds_declaration(raw):
    """按 load_data.js declaration() 同样的规则，从 raw 里精确切出
    `const SOUNDS = {...};` 整块文本（含首尾）。不依赖 Node，纯 Python 复刻，
    因为这里只是构造 fixture，不是测试 declaration() 本身。"""
    m = re.search(r'^const SOUNDS = ', raw, re.M)
    assert m, '基线 fixture 里找不到 const SOUNDS = 声明'
    tail = raw[m.start():]
    first_line = tail.split('\n', 1)[0]
    if ';' in first_line:
        return first_line
    end = re.search(r'^\s*[}\]];', tail, re.M)
    assert end, 'SOUNDS 声明未找到收尾的 }; 或 ];'
    return tail[:end.end()]


def build_poisoned_fixture(raw, poison_expr):
    """把 raw 里的 `const SOUNDS = {...多行...};` 换成折叠成单行、包一层
    Object.assign(Object.create(poison_expr), {...}) 的版本，其余内容原样不动。"""
    decl = extract_sounds_declaration(raw)
    assert decl.startswith('const SOUNDS = ')
    assert decl.rstrip().endswith(';')
    body = decl[len('const SOUNDS = '):].rstrip()
    assert body.endswith(';')
    body = body[:-1]  # 去掉尾部分号，body 现在是原始的 "{...}" 对象字面量文本（含内部换行）
    single_line_body = re.sub(r'\s*\n\s*', ' ', body)  # 折叠换行：SOUNDS 内只有单引号字符串，不含字面换行
    poisoned_decl = 'const SOUNDS = Object.assign(Object.create(' + poison_expr + '), ' + single_line_body + ');'
    assert raw.count(decl) == 1, 'SOUNDS 声明应恰好出现一次，避免误替换'
    return raw.replace(decl, poisoned_decl, 1)


class SoundsSchemaGlobalIssueGateTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        self.baseline_text = FIXTURE.read_text(encoding='utf-8')

    def test_baseline_fixture_has_zero_failures(self):
        result = run_check_data(FIXTURE)
        self.assertEqual(result.returncode, 0, f'基线 fixture 应全部通过：{result.stdout[-500:]}')
        _, f = count_pass_fail(result.stdout)
        self.assertEqual(f, 0, '基线 fixture 不应有任何失败项（否则下面的对照不成立）')

    def test_poisoned_prototype_is_reported_through_real_cli(self):
        """H3 核心断言：SOUNDS 原型链携带额外可枚举数据（sounds-prototype-chain，
        issue.id === null 的表级问题）经真实 check_data.js CLI 入口，必须体现为
        至少一条新增失败，且失败信息点名"SOUNDS 表本身"——不能像改前那样被
        `Object.keys(SOUNDS)` 的逐键遍历悄悄漏过。"""
        baseline_result = run_check_data(FIXTURE)
        _, baseline_fail = count_pass_fail(baseline_result.stdout)

        injected = build_poisoned_fixture(self.baseline_text, "{__poison:1}")
        self.assertNotEqual(injected, self.baseline_text, '替换应生效（否则测试没有真正改动文件）')
        target = Path(self.tmpdir.name) / 'week02-data-sounds-poisoned.js'
        target.write_text(injected, encoding='utf-8')

        result = run_check_data(target)
        self.assertNotEqual(result.returncode, 0, '原型链携带额外数据的 SOUNDS 应让 check_data.js 以非 0 退出')
        _, f = count_pass_fail(result.stdout)
        self.assertGreater(f, baseline_fail,
            f'H3：表级 schema 问题（sounds-prototype-chain）应让失败数比基线（{baseline_fail}）更多，'
            f'实际 {f}——改前这类问题会被逐键遍历漏掉，不会体现在失败计数里')
        self.assertIn('SOUNDS 表本身', result.stdout,
            'H3：失败信息应点名"SOUNDS 表本身"（新增的 soundsGlobalIssues 断言消息），不能只报出一堆逐键的连带失败')

    def test_poison_removed_restores_pass(self):
        """去掉污染原型（等价于"数据修好了"）应恢复基线的全部通过——证明这道门槛
        不是单向死锁，也证明上面那条失败确实是由 Object.create(poison) 这一层引起的，
        不是折叠单行这个构造手法本身带来的副作用。"""
        injected = build_poisoned_fixture(self.baseline_text, "{__poison:1}")
        cleaned = build_poisoned_fixture(self.baseline_text, "null")  # Object.create(null)：无额外原型数据，合法
        target = Path(self.tmpdir.name) / 'week02-data-sounds-clean-wrapped.js'
        target.write_text(cleaned, encoding='utf-8')

        result = run_check_data(target)
        self.assertEqual(result.returncode, 0,
            f'Object.create(null) 包一层（无额外原型数据）应与未包装的基线一样全部通过：{result.stdout[-500:]}')
        _, f = count_pass_fail(result.stdout)
        self.assertEqual(f, 0)


if __name__ == '__main__':
    unittest.main()
