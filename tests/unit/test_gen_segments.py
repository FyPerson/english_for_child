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

      ⚠️（L3，2026-09-09 里程碑 2 收口批）如实拆开这条 fixture 到底证明了什么、
      没证明什么，两半可信度不对称：
        · **可证伪、也确实被断言了**："allCandidates（全部完整解析）会把 b+a+t 与
          b+at 一起列出来"——test_dry_run_reports_all_five_statuses 断言了
          'b+a+t' 与 'b+at' 都出现在报告里；test_write_heuristic_writes_resolved_words
          断言了 --write-heuristic 写回后源码里出现 `segments:["b","at"]`。这两条是
          机器可验证、真的会因为代码退化而转红的断言。
        · **不可证伪，只存在于注释与合成数据的 zh 文案里**："b+a+t 才是这个词的
          目标读法，b+at 不是"——这件事本身没有独立真相源可比对（不像 rain/aid
          那样能靠 test_grapheme_semantics.js 的明确断言核对），只是这份合成周
          数据在 zh 字段里写死的教学设定（见下方 W.bat 的注释），没有任何断言会
          因为"工具改成把 b+a+t 当成目标读法"而转红或转绿——这半只是叙事，不是
          机器判据。写这段是为了不让"这条 fixture 证明了工具会犯错"被过度解读成
          "这条 fixture 能机械判定哪个解是对的"。

M5（2026-09-09 里程碑 2 收口批，协调者裁定「不采纳你的理由，本批必须做」）：写回行为
按新默认拆成两档，本文件同步覆盖：
  - `--write`（不加 `--write-heuristic`）：只写 status='unique' 的词（tan，没有歧义，
    不需要启发式）。resolved 的词（rain/aid/bat，多解但按"字位数最少"能选出候选）
    **一律不再被默认写回**，只在报告里列出全部解析——这正是这条 medium 要堵住的口子：
    bat fixture 已证明这条启发式会给错，不能让错误建议先写进源码。
  - `--write-heuristic`：显式打开后，才会额外写回 resolved 的词（仍带
    @gen-segments-unreviewed 标记 + check_data.js 门槛）。
  - tie（pqr）/unknown（zap）两种状态不受影响，一直都不会被任何写回模式处理。
  - unique 词写回时不带 @gen-segments-unreviewed 标记（没有歧义，没有"需要复核"这回事，
    见 tools/validation/gen_segments.js 的 injectSegmentsIntoWDeclaration 头注释）。

写回是"合成一份完整周数据文件到临时目录、跑一遍 CLI、读回文件核对 diff"，不依赖也不
修改仓库里任何真实数据文件。
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

    # ---- M5：默认 --write 只写 unique（tan），resolved（rain/aid/bat）一律不自动写回 ----
    def test_write_default_only_writes_unique_words(self):
        result = gs.run(str(self.target), write=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0, 'pqr/zap 仍未解决，--write 后退出码也应非 0')
        self.assertIn('已写回 1 个词的 segments：tan', result.stdout, 'M5：默认 --write 只应写回 unique（无歧义）的 tan')
        self.assertIn('rain, aid, bat', result.stdout, '未写回的候选词清单应点名 rain/aid/bat')
        self.assertIn('默认不自动写回', result.stdout, '应明确提示 resolved 候选默认不写回，需要 --write-heuristic')
        self.assertIn('bat fixture 已证明它会给错', result.stdout, '提示文案应带上安全警示，不能只说"不写回"不说原因')
        self.assertIn('pqr', result.stdout)
        self.assertIn('zap', result.stdout)

        after = self.target.read_text(encoding='utf-8')
        # tan：唯一解，应被写回，且不带 @gen-segments-unreviewed（没有歧义，不需要复核）。
        m_tan = re.search(r"tan:\{[^{}]*\}", after)
        self.assertIsNotNone(m_tan, '写回后应仍能找到 tan 的完整声明块')
        self.assertIn('segments:["t","a","n"]', m_tan.group(0))
        self.assertNotIn('@gen-segments-unreviewed', m_tan.group(0), 'unique 词写回不应带未复核标记——没有歧义就没有"需要复核"这回事')

        # rain/aid/bat：resolved（多解候选），默认 --write 不应写回。
        m_rain = re.search(r"rain:\{[^{}]*\}", after)
        self.assertIsNotNone(m_rain)
        self.assertNotIn('segments', m_rain.group(0), 'M5：rain 是 resolved（候选），默认 --write 不应自动写回')
        m_aid = re.search(r"aid:\{[^{}]*\}", after)
        self.assertIsNotNone(m_aid)
        self.assertNotIn('segments', m_aid.group(0), 'M5：aid 是 resolved（候选），默认 --write 不应自动写回')
        m_bat = re.search(r"bat:\{[^{}]*\}", after)
        self.assertIsNotNone(m_bat, '写回后应仍能找到 bat 的完整声明块')
        self.assertNotIn('segments', m_bat.group(0),
                          'M5 核心断言：bat fixture 存在的意义就是证明"字位数最少"会给错——默认 --write 绝不能把这条错误' +
                          '建议（b+at）自动写进源码，这正是本 fixture 现在要守住的行为')

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
        # 一次，tan 应变成"已声明 segments"（与 paid 合计 2 个），rain/aid/bat 仍应
        # 停留在 resolved（候选），不应因为写回过一次就悄悄消失或被误判成已处理。
        reloaded = gs.run(str(self.target), write=False, capture_output=True)
        self.assertEqual(reloaded.returncode, 1, '重新加载后 pqr/zap 仍未解决，退出码应仍非 0')
        self.assertIn('唯一解（不需要 segments）：0 个词', reloaded.stdout, 'tan 写回后不应再计入"唯一解待处理"')
        self.assertIn('已声明 segments（本工具不覆盖）：2 个词', reloaded.stdout, 'tan 写回后 + 原有的 paid，共 2 个词已有 segments（M5 前是 4 个，因为改前 rain/aid/bat 也会被默认写回）')
        self.assertIn('rain -> [r, ai, n]', reloaded.stdout, 'M5：rain 仍应停留在 resolved 候选状态，不应被默认写回"消化掉"')
        self.assertIn('bat -> [b, at]', reloaded.stdout, 'M5：bat 仍应停留在 resolved 候选状态，默认写回不应处理它')

    # ---- M5：--write-heuristic 显式打开后，才会额外写回 resolved（rain/aid/bat） ----
    def test_write_heuristic_writes_resolved_words(self):
        result = gs.run(str(self.target), write=True, write_heuristic=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0, 'pqr/zap 仍未解决，--write-heuristic 后退出码也应非 0')
        self.assertIn('已写回 4 个词的 segments：rain, aid, tan, bat', result.stdout,
                       '--write-heuristic 打开后应把 unique（tan）与全部 resolved（rain/aid/bat）一并写回')
        self.assertIn('其中 3 个是按"字位数最少"启发式选出的候选', result.stdout)
        self.assertIn('rain, aid, bat', result.stdout)

        after = self.target.read_text(encoding='utf-8')
        m_rain = re.search(r"rain:\{[^{}]*\}", after)
        self.assertIsNotNone(m_rain)
        self.assertIn('segments:["r","ai","n"]', m_rain.group(0))
        self.assertIn('@gen-segments-unreviewed', m_rain.group(0), 'resolved 词写回仍要带"候选/需人工复核"标记，不因为加了 --write-heuristic 就免检')

        m_aid = re.search(r"aid:\{[^{}]*\}", after)
        self.assertIsNotNone(m_aid)
        self.assertIn('segments:["ai","d"]', m_aid.group(0))
        self.assertIn('@gen-segments-unreviewed', m_aid.group(0))

        # bat：--write-heuristic 显式打开后，工具按"字位数最少"写回了 b+at——这个合成周
        # 设定的目标读法其实是 b+a+t，工具在这个词上写回的是错误建议。断言它确实被写回
        # （证明"resolved 状态会被 --write-heuristic 自动写入"这条机制本身在起作用），
        # 同时断言行内注释存在（证明"这是候选不是答案"的提醒在写回路径上也没有丢）——
        # 这正是这条 fixture 要留的证据：工具的局限性是真实存在的，不能指望它自己发现
        # b+at 是错的；也正因为这个局限性真实存在，M5 才要求默认不写回，只有显式加
        # --write-heuristic 才会走到这里。
        m_bat = re.search(r"bat:\{[^{}]*\}", after)
        self.assertIsNotNone(m_bat, '写回后应仍能找到 bat 的完整声明块')
        self.assertIn('segments:["b","at"]', m_bat.group(0), 'bat 应被写回工具建议的 b+at——这是"字位数最少"启发式给出的错误答案，证明工具确实会犯这种错')
        self.assertIn('@gen-segments-unreviewed', m_bat.group(0), 'bat 的写回同样要带"候选/需人工复核"注释，提醒复核者这条建议本身就是本 fixture 证明过的错误案例')

        m_tan = re.search(r"tan:\{[^{}]*\}", after)
        self.assertIsNotNone(m_tan)
        self.assertIn('segments:["t","a","n"]', m_tan.group(0))
        self.assertNotIn('@gen-segments-unreviewed', m_tan.group(0), 'tan 是 unique，即使在 --write-heuristic 模式下也不应带未复核标记')

        # tie（pqr）与 unknown（zap）不应被写回：源码里不应新增 segments 字段
        m_pqr = re.search(r"pqr:\{[^{}]*\}", after)
        self.assertIsNotNone(m_pqr)
        self.assertNotIn('segments', m_pqr.group(0), 'pqr 是并列（tie），--write-heuristic 也不应写回——tie 连一个候选都排不出来')
        m_zap = re.search(r"zap:\{[^{}]*\}", after)
        self.assertIsNotNone(m_zap)
        self.assertNotIn('segments', m_zap.group(0), 'zap 无法识别，不应被写回')

        # paid 原有的 segments 必须保持原样，不被工具重新生成/覆盖
        m_paid = re.search(r"paid:\{[^{}]*\}", after)
        self.assertIsNotNone(m_paid)
        self.assertIn('segments:[\'p\',\'ai\',\'d\']', m_paid.group(0).replace('"', "'"),
                       'paid 已有的 segments 不应被工具覆盖或改写引号风格')

        reloaded = gs.run(str(self.target), write=False, capture_output=True)
        # H3（外审 high，2026-09-10）：磁盘上此时已经带着 rain/aid/bat 三处
        # @gen-segments-unreviewed 标记（本次写回遗留），4 的优先级高于 1——
        # pqr/zap 仍未解决不改变这一点，退出码应是 4，不是 1（旧顺序 1→3→4 才会
        # 先命中 1；见 GenSegmentsExitCodePriorityTests 的专项断言）。
        self.assertEqual(reloaded.returncode, 4, '重新加载后磁盘上仍有未复核标记（rain/aid/bat），退出码应为 4，不是 1')
        self.assertIn('唯一解（不需要 segments）：0 个词', reloaded.stdout)
        self.assertIn('已声明 segments（本工具不覆盖）：5 个词', reloaded.stdout, 'rain/aid/tan/bat 写回后 + 原有的 paid，共 5 个词已有 segments')

    # ---- 幂等：默认 --write 只处理 unique，跑两次不会重复写入/报错 ----
    def test_write_is_idempotent(self):
        gs.run(str(self.target), write=True, capture_output=True)
        second = gs.run(str(self.target), write=True, capture_output=True)
        self.assertIn('没有可写回的建议（无 unique 状态的词）', second.stdout, '第二次运行时 tan 已经"已声明 segments"，不应再被当成 unique 写回')
        self.assertIn('已声明 segments（本工具不覆盖）：2 个词', second.stdout, '第二次运行时 tan/paid 共 2 个词已有 segments（rain/aid/bat 默认不写回，不计入）')
        # rain/aid/bat 仍应作为候选出现在第二次的报告里（没有因为跑过 --write 就消失）。
        self.assertIn('rain, aid, bat', second.stdout, '第二次运行仍应在"默认不自动写回"提示里点名 rain/aid/bat')

    # ---- 幂等：--write-heuristic 跑两次，第二次应无新写回（rain/aid/tan/bat 均已有 segments） ----
    def test_write_heuristic_is_idempotent(self):
        gs.run(str(self.target), write=True, write_heuristic=True, capture_output=True)
        second = gs.run(str(self.target), write=True, write_heuristic=True, capture_output=True)
        self.assertIn('没有可写回的建议（无 unique 状态的词，也无 resolved 状态的词）', second.stdout,
                       '第二次运行时 rain/aid/tan/bat 均已"已声明 segments"，不应再被写回')
        self.assertIn('已声明 segments（本工具不覆盖）：5 个词', second.stdout, '第二次运行时 rain/aid/tan/bat/paid 共 5 个词都已有 segments')


# ---- H1（外审 high，2026-09-09）：只含 unique + resolved（没有 tie/unknown/error）
# 的合成周——旧 fixture（SYNTHETIC_WEEK_JS）永远带着 pqr（tie）与 zap（unknown），
# needsHumanExit 恒为 true，从未覆盖过"文件只有 resolved 候选"这一种场景，而这正是
# 这条 high 指出的漏报场景：resolved 候选未经复核也会被判定为「可以放行」。
# 复用 rain/aid（与主 fixture 同款 r/a/i/n/ai 共存，两个词都会被 resolved 为唯一的
# 最短解）+ tan（unique，无歧义），不含 pqr/zap，也不含任何已带 segments 的词。
ONLY_UNIQUE_AND_RESOLVED_WEEK_JS = """/* 合成周数据（H1 专用：只含 unique + resolved，不含 tie/unknown/error）。 */

const META = {
  "week": 98,
  "storageKey": "test-gen-segments-h1",
  "newPatterns": ["ai"]
};

const SOUNDS = {
  r:{grapheme:'r', type:'c'},
  a:{grapheme:'a', type:'v'},
  i:{grapheme:'i', type:'v'},
  n:{grapheme:'n', type:'c'},
  d:{grapheme:'d', type:'c'},
  t:{grapheme:'t', type:'c'},
  ai:{grapheme:'ai', type:'v'}
};

const W = {
  rain:{zh:'雨',art:'rain'},
  aid:{zh:'帮助',art:null},
  tan:{zh:'晒黑',art:null}
};
"""


class GenSegmentsOnlyResolvedExitCodeTests(unittest.TestCase):
    """H1：只含 unique + resolved 的文件，dry-run / --write / --write-heuristic 三种
    模式的退出码断言。这条 fixture 本身没有 tie/unknown/error，是专门用来证明"改前
    退出码恒为 0"这个漏洞、以及"改后退出码按模式正确区分"这两件事的最小复现。"""

    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        self.target = Path(self.tmpdir.name) / 'week98.data.js'
        self.target.write_text(ONLY_UNIQUE_AND_RESOLVED_WEEK_JS, encoding='utf-8')

    def test_dry_run_exits_nonzero_when_only_resolved_present(self):
        # 改前：dry-run 只看 tie/unknown/error，本 fixture 三者都没有，退出码会是 0——
        # 这正是 H1 指出的漏报（"没有 tie/unknown/error 就等于全部处理完成"是假的，
        # rain/aid 仍是未经人工复核的候选）。改后应为退出码 3。
        result = gs.run(str(self.target), write=False, capture_output=True)
        self.assertEqual(result.returncode, 3,
                          'H1：dry-run 时存在未落盘的 resolved 候选（rain/aid），退出码应为 3，不能是 0')
        self.assertIn('rain -> [r, ai, n]', result.stdout)
        self.assertIn('aid -> [ai, d]', result.stdout)

    def test_write_without_heuristic_exits_nonzero(self):
        # 默认 --write 只写 unique（tan），rain/aid 仍是未落盘的候选，退出码应为 3。
        result = gs.run(str(self.target), write=True, capture_output=True)
        self.assertEqual(result.returncode, 3,
                          'H1：--write（不加 --write-heuristic）后 rain/aid 仍未落盘，退出码应为 3，不能是 0')
        self.assertIn('已写回 1 个词的 segments：tan', result.stdout)
        after = self.target.read_text(encoding='utf-8')
        m_rain = re.search(r"rain:\{[^{}]*\}", after)
        self.assertIsNotNone(m_rain)
        self.assertNotIn('segments', m_rain.group(0), 'rain 是 resolved，默认 --write 不应写回')

    def test_write_heuristic_exits_nonzero_with_unreviewed_marker_left(self):
        # H2（外审 high，2026-09-09）：改前这条用例断言退出码 0——"--write-heuristic
        # 后 rain/aid 也被写回（带标记），不再有'未落盘候选'，且没有 tie/unknown/error，
        # 退出码应恢复为 0"。这正是 H2 指出的矛盾本身：写回的 segments 仍带
        # @gen-segments-unreviewed 标记，check_data.js 会拦截这份数据，"退出码 0=全部
        # 处理完毕"与"下游门槛必然 fail"直接矛盾。改后退出码应为 4（"已落盘但未复核"，
        # 与 3"根本没落盘"区分），不是 0。
        result = gs.run(str(self.target), write=True, write_heuristic=True, capture_output=True)
        self.assertEqual(result.returncode, 4,
                          'H2：--write-heuristic 写回带 @gen-segments-unreviewed 标记的候选后，'
                          '退出码应为 4（已落盘但未复核），不能是 0——check_data.js 仍会拦截这份数据')
        after = self.target.read_text(encoding='utf-8')
        m_rain = re.search(r"rain:\{[^{}]*\}", after)
        self.assertIsNotNone(m_rain)
        self.assertIn('@gen-segments-unreviewed', m_rain.group(0))
        self.assertIn('退出码将是 4', result.stdout, '写回时的提示文案应点名退出码 4，不能只说"需人工复核"却不点出机器可判的退出码')

    def test_rerun_after_write_heuristic_still_exits_4(self):
        # H2 复测修复（内部预筛 2026-09-10）：改前 hasUnreviewedWritten 只在"本次
        # writeSuggestions 真的新写入了 heuristic 候选"时才置真——首跑 --write-heuristic
        # 后 rain/aid 已经变成 already-has-segments（带着 @gen-segments-unreviewed
        # 标记），不会再进入 resolveWord/writeSuggestions 的处理路径，之后不论重跑
        # dry-run / --write / 再来一次 --write-heuristic，"这次是不是我写的"都是否，
        # 退出码因此恒为 0，而标记其实还在磁盘上，check_data.js 依然会拦截——这正是
        # 内部预筛复测实测复现的漏洞。改法是直接扫描本次运行结束后磁盘上的最终文件
        # 内容，不再问"这次是不是我写的"。这里断言：首跑 rc=4 且标记留下 4 处；随后
        # dry-run / --write / --write-heuristic 三次重跑，rc 必须仍是 4，标记个数
        # 一个不少（不是被静默清掉，只是没人复核）。
        first = gs.run(str(self.target), write=True, write_heuristic=True, capture_output=True)
        self.assertEqual(first.returncode, 4, '首跑 --write-heuristic 应以退出码 4 结束（rain/aid 写回但未复核）')
        after_first = self.target.read_text(encoding='utf-8')
        marker_count_after_first = after_first.count('@gen-segments-unreviewed')
        # L2（外审 low，2026-09-10）：改前把 marker_count_after_first 硬编码钉死为
        # 字面量 4，理由写的是"每条注释里出现 2 次字面量"——这钉住的是当前注释怎么
        # 写（injectSegmentsIntoWDeclaration 里 seg 文案恰好提到两次），措辞一改这条
        # 断言就会假红/假绿，跟"标记是否被正确留存"这件事本身无关。改为按"被标记的
        # 词数"这个结构量反推：先各自统计 rain / aid 的 W 声明块里是否出现标记
        # （按被标记词计数，不依赖注释里字面量出现几次），再断言总字面量数至少
        # 覆盖这两个词、且非零——真正要保护的不变量是"这次重跑前后标记数量不变"，
        # 由本方法最后三段的相等性断言负责，这里只需确认首跑确实留下了标记。
        marked_words = [w for w in ('rain', 'aid')
                        if '@gen-segments-unreviewed' in re.search(w + r":\{[^{}]*\}", after_first).group(0)]
        self.assertEqual(sorted(marked_words), ['aid', 'rain'], '首跑后 rain/aid 两个 resolved 词都应带上未复核标记')
        self.assertGreater(marker_count_after_first, 0, '首跑后磁盘上应留有非零个未复核标记')

        dry = gs.run(str(self.target), write=False, capture_output=True)
        self.assertEqual(dry.returncode, 4,
                          'H2 复测：首跑后再来一次 dry-run，磁盘上标记仍在，退出码必须仍是 4，不能因为"这次没写"就跌回 0')
        self.assertEqual(self.target.read_text(encoding='utf-8').count('@gen-segments-unreviewed'), marker_count_after_first,
                          'dry-run 不应改动文件，标记数不应变化')

        write_only = gs.run(str(self.target), write=True, capture_output=True)
        self.assertEqual(write_only.returncode, 4,
                          'H2 复测：再来一次 --write（不加 --write-heuristic），rain/aid 已是 already-has-segments，'
                          '这次没有新写入任何东西，但磁盘上仍残留标记，退出码必须仍是 4')
        self.assertEqual(self.target.read_text(encoding='utf-8').count('@gen-segments-unreviewed'), marker_count_after_first,
                          '--write 不应触碰已带 segments 的 rain/aid，标记数不应变化')

        write_heuristic_again = gs.run(str(self.target), write=True, write_heuristic=True, capture_output=True)
        self.assertEqual(write_heuristic_again.returncode, 4,
                          'H2 复测：第三次重跑（再来一次 --write-heuristic），rain/aid 仍是 already-has-segments，'
                          '这次同样没有新写入，退出码必须仍是 4，不能被"重跑"本身掩盖已存在的标记')
        self.assertEqual(self.target.read_text(encoding='utf-8').count('@gen-segments-unreviewed'), marker_count_after_first,
                          '三次重跑标记数应保持不变——本用例证明的是退出码不该跌回 0，不是标记会被意外清除或重复写入')

    def test_unreviewed_marker_matches_the_exact_pattern_check_data_scans_for(self):
        # H2 的矛盾点是："退出码 4 时写进文件的标记" 与 "check_data.js §⑪ 实际扫描的
        # 标记" 必须是同一个字符串，否则"退出码 4 提醒人去复核"这件事本身就对不上下游
        # 门槛真正拦截的依据。不直接跑 check_data.js（它要求一份完整可加载的周数据，
        # 本测试的合成 fixture 只有 META/SOUNDS/W 三个字段，跑起来会先在无关的 DAYS/
        # RESERVED 等字段上崩溃，不是这条用例要验证的东西）——改为直接核对两处的
        # 正则/字面量是同一个标记，这是把"会被拦截"这件事钉死的更精确方式。
        gs.run(str(self.target), write=True, write_heuristic=True, capture_output=True)
        after = self.target.read_text(encoding='utf-8')
        self.assertIn('@gen-segments-unreviewed', after)
        checker_src = (Path(__file__).resolve().parents[2] / 'tools' / 'validation' / 'check_data.js').read_text(encoding='utf-8')
        self.assertIn('@gen-segments-unreviewed', checker_src,
                       'check_data.js 应仍在扫描同一个字面标记 @gen-segments-unreviewed，'
                       '否则 gen_segments 退出码 4 的"会被下游门槛拦截"这个理由就落空了')


# ---- H3（外审 high，2026-09-10）：main() 末尾改前的判断顺序是
# `if needsHumanExit: exit(1); if hasUnwrittenCandidates: exit(3); if hasUnreviewedMarkersOnDisk: exit(4)`——
# 与上面 hasUnreviewedMarkersOnDisk 的注释承诺的"只要磁盘还有 @gen-segments-unreviewed
# 标记，重跑必须一直是 4"矛盾：标记与 tie/unknown/error 同时存在时会先命中 1，标记与
# 未落盘候选同时存在时会先命中 3，4 因此永远轮不到。裁定 4 优先（磁盘上的标记是跨次
# 运行持久的状态，1/3 只是本次运行的局部状态）。以下两个用例各自在"旧顺序"下会先转红：
# 用旧代码跑过（1→3→4），marker+tie 得 1、marker+unwritten 得 3，均不是 4。
class GenSegmentsExitCodePriorityTests(unittest.TestCase):
    """H3：磁盘上已经残留未复核标记时，不论本次运行是否还命中 tie/unknown/error 或
    未落盘候选，退出码都必须是 4——4 的优先级最高。"""

    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        self.target = Path(self.tmpdir.name) / 'week97.data.js'

    def test_marker_on_disk_together_with_tie_still_exits_4(self):
        # 场景：磁盘上已有一个未复核标记（rain 曾用 --write-heuristic 写回），同时
        # 这一周另有 pqr（tie）与 zap（unknown）两个词。旧顺序下 needsHumanExit 先于
        # hasUnreviewedMarkersOnDisk 判断，会先命中 exit(1)。改后应恒为 4。
        marked_week_js = """/* 合成周数据（H3 专用：磁盘已有未复核标记 + tie/unknown 并存）。 */

const META = {
  "week": 97,
  "storageKey": "test-gen-segments-h3-marker-tie",
  "newPatterns": ["ai"]
};

const SOUNDS = {
  r:{grapheme:'r', type:'c'},
  a:{grapheme:'a', type:'v'},
  i:{grapheme:'i', type:'v'},
  n:{grapheme:'n', type:'c'},
  ai:{grapheme:'ai', type:'v'},
  p:{grapheme:'p', type:'c'},
  q:{grapheme:'q', type:'c'},
  pq:{grapheme:'pq', type:'c'},
  qr:{grapheme:'qr', type:'c'}
};

const W = {
  rain:{zh:'雨',art:'rain',segments:['r','ai','n'] /* @gen-segments-unreviewed：模拟上一次 --write-heuristic 遗留、尚未人工复核的标记 */},
  pqr:{zh:'（合成，无实义，tie）',art:null},
  zap:{zh:'（合成，含未教字位 z，unknown）',art:null}
};
"""
        self.target.write_text(marked_week_js, encoding='utf-8')
        result = gs.run(str(self.target), write=False, capture_output=True)
        self.assertEqual(result.returncode, 4,
            'H3：磁盘已有未复核标记，即便本次运行同时命中 tie（pqr）/unknown（zap），退出码也必须是 4，不能是 1'
            f'（旧顺序 1→3→4 会先命中 1，实际得到 {result.returncode}）')

    def test_marker_on_disk_together_with_unwritten_candidate_still_exits_4(self):
        # 场景：磁盘上已有一个未复核标记（rain），同时这一周另有 aid——一个 resolved
        # 但尚未落盘的候选（本次 --write 不加 --write-heuristic，不会写回 aid）。
        # 旧顺序下 hasUnwrittenCandidates 先于 hasUnreviewedMarkersOnDisk 判断，会先
        # 命中 exit(3)。改后应恒为 4。
        marked_week_js = """/* 合成周数据（H3 专用：磁盘已有未复核标记 + 未落盘候选并存）。 */

const META = {
  "week": 97,
  "storageKey": "test-gen-segments-h3-marker-unwritten",
  "newPatterns": ["ai"]
};

const SOUNDS = {
  r:{grapheme:'r', type:'c'},
  a:{grapheme:'a', type:'v'},
  i:{grapheme:'i', type:'v'},
  n:{grapheme:'n', type:'c'},
  d:{grapheme:'d', type:'c'},
  ai:{grapheme:'ai', type:'v'}
};

const W = {
  rain:{zh:'雨',art:'rain',segments:['r','ai','n'] /* @gen-segments-unreviewed：模拟上一次 --write-heuristic 遗留、尚未人工复核的标记 */},
  aid:{zh:'帮助',art:null}
};
"""
        self.target.write_text(marked_week_js, encoding='utf-8')
        result = gs.run(str(self.target), write=True, write_heuristic=False, capture_output=True)
        self.assertEqual(result.returncode, 4,
            'H3：磁盘已有未复核标记，即便本次 --write（不加 --write-heuristic）还剩 aid 这个未落盘候选，'
            f'退出码也必须是 4，不能是 3（旧顺序 1→3→4 会先命中 3，实际得到 {result.returncode}）')
        after = self.target.read_text(encoding='utf-8')
        m_aid = re.search(r"aid:\{[^{}]*\}", after)
        self.assertIsNotNone(m_aid)
        self.assertNotIn('segments', m_aid.group(0), 'aid 是 resolved 且未加 --write-heuristic，本次不应被写回')


if __name__ == '__main__':
    unittest.main()
