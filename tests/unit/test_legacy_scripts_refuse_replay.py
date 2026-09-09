"""M4（外审 medium，2026-09-09，"换词影响面的第五层"）：tools/legacy/ 下的一次性移植
脚本（port.py、port_w3.py）不可重放——它们已经执行完毕并交付，仓库结构后来重排，
顶层 weekNN.html 输入/输出文件已不存在，脚本内的字面量断言（如 port.py 的 #7 保留词
一行，2026-09-09 W1 周检词 spit 换 pit 后就已失配）也随后续数据变化过期。

旧版只在注释里写"重跑前手动更新字面量"，这份提醒容易被忽略；改法是让"不可重放"这件事
本身在运行时就明确拒绝（`raise SystemExit(...)`），不依赖注释、也不依赖脚本各自因为
输入文件缺失而给出的、含义不明确的 FileNotFoundError。

本测试直接把两个脚本当子进程跑一遍，断言：①非 0 退出；②不是因为别的原因（比如语法
错误）失败，而是我们自己写的 REFUSED 拒绝文案；③不会真的动了仓库里任何文件（这两个
脚本读写的 SRC/DST 路径本就已不存在，但这里额外用 git status 兜底确认工作区没有意外
的新文件/改动，双重保险）。"""
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEGACY_SCRIPTS = ['tools/legacy/port.py', 'tools/legacy/port_w3.py']


def git_status():
    return subprocess.run(['git', 'status', '--porcelain'], cwd=ROOT, capture_output=True, text=True,
                           encoding='utf-8', check=True).stdout


class LegacyScriptsRefuseReplayTests(unittest.TestCase):
    def test_running_the_script_refuses_with_a_clear_message_and_touches_nothing(self):
        before = git_status()
        for rel in LEGACY_SCRIPTS:
            with self.subTest(script=rel):
                result = subprocess.run([sys.executable, rel], cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
                self.assertNotEqual(result.returncode, 0, f'{rel} 应拒绝执行（非 0 退出），实际 0')
                combined = (result.stdout or '') + (result.stderr or '')
                self.assertIn('REFUSED', combined, f'{rel} 的拒绝信息应含明确标志词 REFUSED，实际输出：{combined[:400]!r}')
                self.assertIn('不可重放', combined, f'{rel} 的拒绝信息应说明"不可重放"这件事本身，实际输出：{combined[:400]!r}')
                # 不是因为脚本本身语法错误/未捕获异常才失败——那样的失败不会打印 REFUSED，
                # 上面两条 assertIn 已经间接覆盖了这一点，这里再显式排除最容易混淆的一种
                # 假阳性：Python 语法错误的 traceback 里不会出现 REFUSED 字样。
                self.assertNotIn('SyntaxError', combined, f'{rel} 不应因为语法错误而失败：{combined[:400]!r}')
        after = git_status()
        self.assertEqual(before, after, '运行这两个已归档脚本不应改动工作区任何文件（它们的 SRC/DST 路径本就已不存在，这里再确认一次没有副作用）')


if __name__ == '__main__':
    unittest.main()
