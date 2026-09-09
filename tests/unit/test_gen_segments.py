"""gen_segments 生成器（里程碑 2 · P3③，方案 §3.4）的端到端单测。

W5 真实数据还不存在，所以这里用合成周数据文件（不依赖任何 frontend/src/weeks 内容）
覆盖 gen_segments 的五种输出状态：unique（唯一解，无需处理）、resolved（多解但按"字位数
最少"能唯一选出）、tie（多解且字位数最少的解不唯一，需人工决定）、unknown（含未教字位，
无法识别）、already-has-segments（W 条目已声明 segments，工具不覆盖）。

合成字位表刻意复用两个已知构造：
  - rain/aid：与 tests/unit/test_grapheme_semantics.js 同款"r/a/i/n/ai 共存"，两个词都
    应该被 resolved（唯一的最短解）。
  - pqr：方案 §3.2 abc 例子（a/ab/bc/c 上 abc 两解）的同构变体（p/q/r/pq/qr 上 pqr 两解，
      p+qr 与 pq+r 都是 2 个字位，并列），验证"字位数最少不唯一时报错让人决定"。
  - bat（codex medium，2026-09-09：「生成器把启发式当成了权威」的证据 fixture）：
      b/a/t 单字母 + at 双字母字位共存，bat 有且只有两个完整解——b+a+t（3 字位）与
      b+at（2 字位）。按"字位数最少"启发式，工具会建议 b+at；但这个合成周里 bat 的
      "目标读法"就设定成 b+a+t（3 字位，at 在这个词里不该被当整体读）——也就是说
      **工具在这个词上会给出错误建议**。这条 fixture 的意义不是让工具变聪明去猜对
      bat，而是留证据证明：①"字位数最少"确实只是候选，不是权威答案；②报告里的
      "全部完整解析"必须同时列出 b+a+t 和 b+at，人复核时才有机会从中挑出正确的
      b+a+t，而不是被工具唯一给出的 b+at 误导直接采纳。

同时验证写回（--write）：resolved 的词被写进 W 声明的 segments 字段（且带"候选/需
人工复核"的行内注释——写回的字段本身也不能让人误以为是权威答案），tie/unknown 的词
不被写回；写回是"合成一份完整周数据文件到临时目录、跑一遍 CLI、读回文件核对 diff"，
不依赖也不修改仓库里任何真实数据文件。
"""
import re
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
import gen_segments as gs

SYNTHETIC_WEEK_JS = """/* 合成周数据（测试专用，不是任何真实周）。 */

const META = {
  "week": 99,
  "storageKey": "test-gen-segments",
  "newPatterns": ["ai"]
};

const SOUNDS = {
  r:{grapheme:'r', type:'c'},
  a:{grapheme:'a', type:'v'},
  i:{grapheme:'i', type:'v'},
  n:{grapheme:'n', type:'c'},
  d:{grapheme:'d', type:'c'},
  t:{grapheme:'t', type:'c'},
  ai:{grapheme:'ai', type:'v'},
  p:{grapheme:'p', type:'c'},
  q:{grapheme:'q', type:'c'},
  pq:{grapheme:'pq', type:'c'},
  qr:{grapheme:'qr', type:'c'},
  b:{grapheme:'b', type:'c'},
  at:{grapheme:'at', type:'v'}
};

const W = {
  rain:{zh:'雨',art:'rain'},
  aid:{zh:'帮助',art:null},
  tan:{zh:'晒黑',art:null},
  pqr:{zh:'（合成，无实义）',art:null},
  zap:{zh:'（合成，含未教字位 z）',art:null},
  paid:{zh:'付过款',art:null,segments:['p','ai','d']},
  bat:{zh:'（合成：目标读法是 b+a+t，工具会误建议 b+at，见文件头 codex medium 说明）',art:null}
};
"""


class GenSegmentsTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        self.target = Path(self.tmpdir.name) / 'week99.data.js'
        self.target.write_text(SYNTHETIC_WEEK_JS, encoding='utf-8')

    # ---- dry-run：五种状态都出现在报告里，且没有改动文件 ----
    def test_dry_run_reports_all_five_statuses(self):
        before = self.target.read_text(encoding='utf-8')
        result = gs.run(str(self.target), write=False, capture_output=True)
        self.assertEqual(self.target.read_text(encoding='utf-8'), before, 'dry-run 不应改动目标文件')
        # tie（pqr）与 unknown（zap）都存在，退出码必须非 0（"报错让人决定"）
        self.assertNotEqual(result.returncode, 0, 'tie/unknown 词存在时 dry-run 也应以非 0 退出，提醒需要人工处理')
        out = result.stdout
        self.assertIn('rain -> [r, ai, n]', out, 'rain 应按字位数最少 resolved 为 r/ai/n')
        self.assertIn('aid -> [ai, d]', out, 'aid 应按字位数最少 resolved 为 ai/d')
        self.assertIn('pqr', out)
        self.assertIn('并列', out, 'pqr 的两个 2 字位解应报告为并列，需人工决定')
        self.assertIn('zap', out)
        self.assertIn('无法识别', out, 'zap 含未教字位 z，应报告为无法识别')
        self.assertIn('唯一解（不需要 segments）：1 个词', out, 'tan 是唯一解，应计入"无需处理"分组')
        self.assertIn("已声明 segments（本工具不覆盖）：1 个词", out, 'paid 已有 segments，应被跳过且不计入建议')
        self.assertIn('[涉及本周新教字位]', out, 'rain/aid 都用到 newPatterns 里的 ai，报告应标注')

        # codex medium 证据 fixture：bat 被工具 resolved 为 b+at（字位数最少），但这个
        # 合成周设定的目标读法是 b+a+t——工具在这个词上给出的是错误建议。断言两件事：
        # ①工具确实（如预期地）给出了这个有缺陷的建议 b+at；②"全部完整解析"里必须
        # 同时列出 b+a+t，人复核时才有机会从候选列表里挑出正确答案，而不是被工具唯一
        # 摆在前面的 b+at 误导。这不是要工具变聪明，而是留证据证明"字位数最少"只是
        # 候选、不是权威答案。
        self.assertIn('bat -> [b, at]', out, 'bat 应按"字位数最少"被 resolved 为 b+at（这正是本 fixture 要证明的错误建议）')
        self.assertIn('[候选，需人工复核]', out, '每条 resolved 建议都必须显式标注"候选/需人工复核"，不能让人误以为是最终答案')
        self.assertIn('b+a+t', out, '"全部完整解析"必须同时列出 b+a+t——它才是这个合成周设定的目标读法，只是不是字位数最少的那个')
        self.assertIn('b+at', out)
        self.assertIn('以下全部是候选，不是答案', out, '报告头部必须显式声明：本工具产出的是候选而非权威答案，算法无从判断教学意图')

    # ---- --write：resolved 的词被写回，tie/unknown 的词不被写回 ----
    def test_write_only_touches_resolved_words(self):
        result = gs.run(str(self.target), write=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0, 'pqr/zap 仍未解决，--write 后退出码也应非 0')
        self.assertIn('已写回 3 个词的 segments：rain, aid, bat', result.stdout)
        self.assertIn('pqr', result.stdout)
        self.assertIn('zap', result.stdout)

        after = self.target.read_text(encoding='utf-8')
        m_rain = re.search(r"rain:\{[^{}]*\}", after)
        self.assertIsNotNone(m_rain, '写回后应仍能找到 rain 的完整声明块')
        self.assertIn("segments:[\"r\",\"ai\",\"n\"]", m_rain.group(0))
        self.assertIn('gen_segments 候选', m_rain.group(0), '写回的 segments 字段本身也要带"候选/需人工复核"的行内注释，不只是终端输出提醒')

        m_aid = re.search(r"aid:\{[^{}]*\}", after)
        self.assertIsNotNone(m_aid)
        self.assertIn('segments:["ai","d"]', m_aid.group(0))

        # bat：工具按"字位数最少"写回了 b+at——这个合成周里设定的目标读法其实是
        # b+a+t，工具在这个词上写回的是错误建议。断言它确实被写回（证明"resolved
        # 状态会被 --write 自动写入"这条机制本身在起作用），同时断言行内注释存在
        # （证明"这是候选不是答案"的提醒在写回路径上也没有丢）——这正是这条 fixture
        # 要留的证据：工具的局限性是真实存在的，不能指望它自己发现 b+at 是错的。
        m_bat = re.search(r"bat:\{[^{}]*\}", after)
        self.assertIsNotNone(m_bat, '写回后应仍能找到 bat 的完整声明块')
        self.assertIn('segments:["b","at"]', m_bat.group(0), 'bat 应被写回工具建议的 b+at——这是"字位数最少"启发式给出的错误答案，证明工具确实会犯这种错')
        self.assertIn('gen_segments 候选', m_bat.group(0), 'bat 的写回同样要带"候选/需人工复核"注释，提醒复核者这条建议本身就是本 fixture 证明过的错误案例')

        # tie（pqr）与 unknown（zap）不应被写回：源码里不应新增 segments 字段
        m_pqr = re.search(r"pqr:\{[^{}]*\}", after)
        self.assertIsNotNone(m_pqr)
        self.assertNotIn('segments', m_pqr.group(0), 'pqr 是并列（tie），不应被写回')
        m_zap = re.search(r"zap:\{[^{}]*\}", after)
        self.assertIsNotNone(m_zap)
        self.assertNotIn('segments', m_zap.group(0), 'zap 无法识别，不应被写回')

        # paid 原有的 segments 必须保持原样，不被工具重新生成/覆盖
        m_paid = re.search(r"paid:\{[^{}]*\}", after)
        self.assertIsNotNone(m_paid)
        self.assertIn('segments:[\'p\',\'ai\',\'d\']', m_paid.group(0).replace('"', "'"),
                       'paid 已有的 segments 不应被工具覆盖或改写引号风格')

        # 写回后文件仍是合法可加载的周数据（没有破坏 JS 语法/其余字段）：重新 dry-run
        # 一次，rain/aid 应变成"已声明 segments"，unique 分组（tan）计数应仍是 1 个词。
        reloaded = gs.run(str(self.target), write=False, capture_output=True)
        self.assertEqual(reloaded.returncode, 1, '重新加载后 pqr/zap 仍未解决，退出码应仍非 0')
        self.assertIn('唯一解（不需要 segments）：1 个词', reloaded.stdout, 'tan 仍应是唯一解，未被写回逻辑误伤')
        self.assertIn('已声明 segments（本工具不覆盖）：4 个词', reloaded.stdout, 'rain/aid/bat 写回后 + 原有的 paid，共 4 个词已有 segments')

    # ---- 幂等：写回一次后再跑，rain/aid 已经"有 segments"，不会被重复处理或二次写入 ----
    def test_write_is_idempotent(self):
        gs.run(str(self.target), write=True, capture_output=True)
        second = gs.run(str(self.target), write=True, capture_output=True)
        self.assertIn('没有可写回的建议', second.stdout, '第二次运行时 rain/aid 已经"已声明 segments"，不应再被当成 resolved 写回')
        self.assertIn('已声明 segments（本工具不覆盖）：4 个词', second.stdout, '第二次运行时 rain/aid/bat/paid 共 4 个词都已有 segments')


if __name__ == '__main__':
    unittest.main()
