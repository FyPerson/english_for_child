"""里程碑 2 收口批 内部预筛 M-6：DATA-WALL-01 三条既有断言（wallLetters 顺序/缺项/额外
项/重复项、FIRST_TEACH_DAY 与 newPatterns 集合相等、首教日落到对应天）留了两处盲区，
各配一份能证明"改前全绿、改后转红"的破坏固件：

M-6a（newPatterns 内部顺序未核对首教日天号）：newPatterns 数组顺序就是真相源本身——
wall_order.js 的 computeTeachingOrder 直接按这个数组顺序累计成独立教学顺序，断言①
再拿它去核对 wallLetters。但把某周 newPatterns 整体打乱、wallLetters 对应尾部同步
打乱后，两边用的是同一份（错误的）顺序，断言①仍然对得上；断言②只比集合不比顺序；
断言③逐键独立核对，也不看数组顺序——三条全绿，但墙会按错误顺序点亮。

M-6b（SOUNDS 里的孤儿键测不出来）：规范的取值规则是「wallLetters 恒等于 SOUNDS 全部
键，除非显式标了 displayOnWall:false」。但校验器只查了「wallIds ⊆ SOUNDS」（存在性，
一个方向）与「wallLetters == 累计 newPatterns」，SOUNDS 里混进一个既不在 newPatterns
也不在 wallLetters 里的孤儿键，两边都不会报错。

本文件按本项目"改坏副本证明会红"的规矩，走真实 CLI 入口（`node tools/validation/
check_data.js <文件>`）。
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


def extract_array_field(raw, field):
    pattern = re.compile(r'"%s":\s*\[([^\]]*)\]' % re.escape(field))
    m = pattern.search(raw)
    assert m, f'fixture 里找不到 "{field}": [...] 声明'
    items = [a or b for a, b in re.findall(r"'([^']*)'|\"([^\"]*)\"", m.group(1))]
    return m, items


def poison_scrambled_new_patterns(raw):
    """M-6a 的破坏手法：newPatterns 整体倒序，wallLetters 只倒序对应的"本周新增"尾部
    （继承自上一周的字母保持不动），复现"newPatterns 内部打乱、wallLetters 同步打乱，
    既有三条断言仍然全绿"的场景——两边用的是同一份错误顺序，断言①（比对象）不会发现。"""
    m_new, new_items = extract_array_field(raw, 'newPatterns')
    reversed_new = list(reversed(new_items))
    assert reversed_new != new_items, '本周新音只有一个或回文时倒序等于原序，测试就失去意义，检查 fixture'
    raw2 = raw[:m_new.start()] + '"newPatterns": [' + ','.join(f'"{x}"' for x in reversed_new) + ']' + raw[m_new.end():]

    m_wall, wall_items = extract_array_field(raw2, 'wallLetters')
    assert wall_items[-len(new_items):] == new_items, 'wallLetters 尾部应与 newPatterns 原序一致，检查 fixture'
    wall_items = wall_items[:-len(new_items)] + reversed_new
    raw3 = raw2[:m_wall.start()] + '"wallLetters": [' + ','.join(f'"{x}"' for x in wall_items) + ']' + raw2[m_wall.end():]
    return raw3


def poison_orphan_sounds_key(raw):
    """M-6b 的破坏手法：往 SOUNDS 里插入一个 schema 完全合法、但既不在 newPatterns
    也不在 wallLetters 里的孤儿键——不使用任何已有词/字母，不引入新的分词歧义。
    定位方法：从 "const SOUNDS = {" 起，找第一处顶格 "};" 收尾（fixture 里 SOUNDS
    结尾之后紧跟一行 "SOUNDS.k = Object.assign(...)"，不能死绑 "const W = {" 前一行）。"""
    start = re.search(r'^const SOUNDS = \{', raw, re.M)
    assert start, 'fixture 里找不到 const SOUNDS = { 声明'
    end = re.search(r'^\};$', raw[start.end():], re.M)
    assert end, 'SOUNDS 声明未找到顶格 }; 收尾'
    idx = start.end() + end.start()
    # 上一个真实条目的收尾未必带逗号（fixture 里最后一个键就没有）——先确保补上逗号，
    # 再插入新条目，否则 "}\n  zz:{" 中间缺逗号是语法错误（真遇到过：SyntaxError:
    # Unexpected identifier 'zz'）。
    head_text = raw[:idx]
    stripped = head_text.rstrip()
    trailing_ws = head_text[len(stripped):]
    if not stripped.endswith(','):
        stripped += ','
    injected_entry = (
        "\n  zz:{grapheme:'zz', ipa:'/zz/', type:'c', art:'zebra', mem:'test', cue:'test', "
        "challenge:'test', try:'test', pass:'test', how:'test', warn:'test', demo:[['zz','zz']]},"
    )
    return stripped + injected_entry + trailing_ws + raw[idx:]


class WallAssertionBlindSpotTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        self.baseline_text = FIXTURE.read_text(encoding='utf-8')
        baseline_result = run_check_data(FIXTURE)
        self.assertEqual(baseline_result.returncode, 0,
            f'基线 fixture 应全部通过：{baseline_result.stdout[-500:]}')
        _, self.baseline_fail = count_pass_fail(baseline_result.stdout)
        self.assertEqual(self.baseline_fail, 0)

    def test_scrambled_new_patterns_order_is_caught(self):
        injected = poison_scrambled_new_patterns(self.baseline_text)
        self.assertNotEqual(injected, self.baseline_text, '替换应生效')
        target = Path(self.tmpdir.name) / 'week02-data-newpatterns-scrambled.js'
        target.write_text(injected, encoding='utf-8')

        result = run_check_data(target)
        self.assertNotEqual(result.returncode, 0, 'newPatterns 内部顺序打乱（与首教日天号不对齐）应报失败')
        _, f = count_pass_fail(result.stdout)
        self.assertEqual(f, 1,
            f'newPatterns 顺序打乱应恰好新增 1 条失败（只命中新加的顺序断言，wallLetters 已同步打乱、'
            f'不应连带碰红①②③三条既有断言）：实际失败 {f} 条，输出：{result.stdout[-1500:]}')
        self.assertIn('newPatterns 顺序应按首教日天号非降序排列', result.stdout,
            '应报出新增的"newPatterns 顺序与首教日天号不对齐"断言消息')
        # 反向确认三条既有断言确实仍然全绿（不是因为别的原因侥幸躲过）
        self.assertNotIn('wallLetters 顺序与独立教学顺序序列', result.stdout)
        self.assertNotIn('wallLetters 缺少独立教学顺序序列', result.stdout)
        self.assertNotIn('FIRST_TEACH_DAY 的键集合与 newPatterns 不一致', result.stdout)

    def test_orphan_sounds_key_not_on_wall_is_caught(self):
        injected = poison_orphan_sounds_key(self.baseline_text)
        self.assertNotEqual(injected, self.baseline_text, '替换应生效')
        target = Path(self.tmpdir.name) / 'week02-data-orphan-sound.js'
        target.write_text(injected, encoding='utf-8')

        result = run_check_data(target)
        self.assertNotEqual(result.returncode, 0, 'SOUNDS 里的孤儿键（未教也未上墙）应报失败')
        _, f = count_pass_fail(result.stdout)
        self.assertEqual(f, 1,
            f'孤儿键应恰好新增 1 条失败（只命中新加的反向存在性断言，其余 schema/teaching 字段'
            f'都是合法克隆，不应连带报别的错）：实际失败 {f} 条，输出：{result.stdout[-1500:]}')
        self.assertIn('孤儿字位', result.stdout, '应报出新增的"孤儿字位"断言消息')
        self.assertIn('"zz"', result.stdout, '失败消息应点名具体的孤儿键 zz')


if __name__ == '__main__':
    unittest.main()
