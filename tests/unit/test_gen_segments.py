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

同时验证写回（--write）：resolved 的词被写进 W 声明的 segments 字段，tie/unknown 的词
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
  qr:{grapheme:'qr', type:'c'}
};

const W = {
  rain:{zh:'雨',art:'rain'},
  aid:{zh:'帮助',art:null},
  tan:{zh:'晒黑',art:null},
  pqr:{zh:'（合成，无实义）',art:null},
  zap:{zh:'（合成，含未教字位 z）',art:null},
  paid:{zh:'付过款',art:null,segments:['p','ai','d']}
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

    # ---- --write：resolved 的词被写回，tie/unknown 的词不被写回 ----
    def test_write_only_touches_resolved_words(self):
        result = gs.run(str(self.target), write=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0, 'pqr/zap 仍未解决，--write 后退出码也应非 0')
        self.assertIn('已写回 2 个词的 segments：rain, aid', result.stdout)
        self.assertIn('pqr', result.stdout)
        self.assertIn('zap', result.stdout)

        after = self.target.read_text(encoding='utf-8')
        m_rain = re.search(r"rain:\{[^{}]*\}", after)
        self.assertIsNotNone(m_rain, '写回后应仍能找到 rain 的完整声明块')
        self.assertIn("segments:[\"r\",\"ai\",\"n\"]", m_rain.group(0))

        m_aid = re.search(r"aid:\{[^{}]*\}", after)
        self.assertIsNotNone(m_aid)
        self.assertIn('segments:["ai","d"]', m_aid.group(0))

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
        self.assertIn('已声明 segments（本工具不覆盖）：3 个词', reloaded.stdout, 'rain/aid 写回后 + 原有的 paid，共 3 个词已有 segments')

    # ---- 幂等：写回一次后再跑，rain/aid 已经"有 segments"，不会被重复处理或二次写入 ----
    def test_write_is_idempotent(self):
        gs.run(str(self.target), write=True, capture_output=True)
        second = gs.run(str(self.target), write=True, capture_output=True)
        self.assertIn('没有可写回的建议', second.stdout, '第二次运行时 rain/aid 已经"已声明 segments"，不应再被当成 resolved 写回')
        self.assertIn('已声明 segments（本工具不覆盖）：3 个词', second.stdout, '第二次运行时 rain/aid/paid 共 3 个词都已有 segments')


if __name__ == '__main__':
    unittest.main()
