# -*- coding: utf-8 -*-
"""week02.html → week03.html 换数据层移植 + 里程碑 0（积木架分组固定位）。

按 docs/声音积木周课件设计规范_20260831_v1.0.md §5.1 的清单执行；数据层各常量直接从
tools/week-checks/week03-data.js 切片注入（不手抄，规范"誊抄类产出禁手抄"）。
每一处替换都断言锚点唯一命中，漏一处即报错退出，不产出半成品。

用法：python tools/week-checks/port_w3.py
"""
import re
import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent.parent.parent
SRC = ROOT / "week02.html"
DST = ROOT / "week03.html"
DATA = ROOT / "tools" / "week-checks" / "week03-data.js"

text = SRC.open(encoding="utf-8", newline="").read()
data = DATA.open(encoding="utf-8", newline="").read()
done = []


def sub(old, new, label, count=1):
    global text
    n = text.count(old)
    assert n == count, f"[{label}] 期望出现 {count} 次，实际 {n} 次"
    text = text.replace(old, new, count)
    done.append(label)


def cut(start, end, new, label):
    global text
    assert text.count(start) == 1, f"[{label}] 起始锚点不唯一：{text.count(start)} 次"
    i = text.index(start)
    j = text.index(end, i + len(start)) + len(end)
    text = text[:i] + new + text[j:]
    done.append(label)


def slice_const(src, name, opener, closer):
    anchor = f"const {name} = {opener}"
    assert src.count(anchor) == 1, f"数据文件里 `{anchor}` 出现 {src.count(anchor)} 次"
    i = src.index(anchor)
    j = src.index(closer, i + len(anchor)) + len(closer)
    return src[i:j]


# ═════════════════════════════════════════ #22 头部注释 / 标题 / 顶栏
cut("<!--\n设计假设", "-->", """<!--
设计假设（第三周 · 沿用前两周定稿引擎）：
- 本文件由 week02.html 换数据层而来（tools/week-checks/port_w3.py）。引擎、设计系统、播放层、
  六个游戏、状态 schema、打印视图、无障碍实现全部继承。
- 唯一的引擎改动是课程方案 §9.2 里程碑 0：G4 / G5 积木架按元音 / 辅音分组渲染，组内顺序为
  累计教学顺序，新字母只在末尾追加、旧字母位置不动（用户 2026-09-02 拍板"分组固定位架"）。
- 换周规则见 docs/声音积木周课件设计规范_20260831_v1.0.md；教学内容按 docs/声音积木六年课程方案 §5.3 第 3 周行。
- 周主题背景色换成蓝灰色系（每周换一次底色是刻意设计）。元音红 / 辅音青 / 琥珀 accent / 完成绿
  四个教学语义色跨周冻结，未跟着换。
- 本周新增 g、o、u、l、f、b 六块字母积木，累计十九块；五块红积木到齐。真人孤立音与助记插画
  尚未就位：听音入口按铁律 8 降级为家长口令示范，插画按 hasIll 守卫降级为"单词 + 中文"。
-->""", "#22 头部注释")
sub("<title>声音积木 第二周 · 更多积木</title>", "<title>声音积木 第三周 · 十九块积木</title>", "#22 标题")
sub('<span class="brand__wk">第 2 周 · c k e h r m d</span>', '<span class="brand__wk">第 3 周 · g o u l f b</span>', "#22 顶栏周次")

# ═════════════════════════════════════════ §3.1 周主题色（蓝灰）
LIGHT = [("#F1EFF7", "#EEF2F7"), ("#F8F6FC", "#F5F8FC"), ("#E7E2F1", "#E1E7F0"),
         ("#292633", "#232B36"), ("#655F71", "#5B6675"), ("#8B8497", "#86919F"),
         ("#DED8E9", "#D7DFE9"), ("#CBBBE3", "#BECAD9"), ("#CFC7DE", "#C7D1DD")]
DARK = [("#18161D", "#15191F"), ("#24212B", "#1F252D"), ("#2C2835", "#272E38"), ("#121016", "#0F1318"),
        ("#F0EDF5", "#EEF2F7"), ("#B8B1C3", "#B3BCC8"), ("#8F879B", "#8A94A1"),
        ("#3C3648", "#36404C"), ("#4C4459", "#46525F"), ("#2F2A38", "#2A323D"), ("#453D52", "#3E4956")]
for old, new in LIGHT:
    sub(old, new, f"§3.1 浅色 {old}", count=1)
for old, new in DARK:
    sub(old, new, f"§3.1 深色 {old}", count=2)
sub("rgba(41,38,51,", "rgba(35,43,54,", "§3.1 阴影/庆祝图投影 ×6", count=6)

# ═════════════════════════════════════════ §3.1 G1 卡片描边（轮次键 c/e → g/u）
sub(".g1card--c{border-color:var(--cons-line)}\n.g1card--e{border-color:var(--vowel-line)}",
    ".g1card--g{border-color:var(--cons-line)}\n.g1card--u{border-color:var(--vowel-line)}", "§3.1 G1 卡片描边")
sub(".g1card--c .g1__target{border-color:var(--cons-line); background:var(--cons-soft)}",
    ".g1card--g .g1__target{border-color:var(--cons-line); background:var(--cons-soft)}", "§3.1 G1 轮A靶区")
sub(".g1card--c .g1__target::after{", ".g1card--g .g1__target::after{", "§3.1 G1 轮A靶区after")
sub(".g1card--e .g1__target{border-color:var(--vowel-line); background:var(--vowel-soft)}",
    ".g1card--u .g1__target{border-color:var(--vowel-line); background:var(--vowel-soft)}", "§3.1 G1 轮B靶区")

# ═════════════════════════════════════════ 里程碑 0：积木架分组固定位（CSS + 渲染）
sub(".g4__rack{display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap; margin-top:14px; padding-top:14px; border-top:1px dashed var(--line-2)}",
    ".g4__rack{display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; margin-top:14px; padding-top:14px; border-top:1px dashed var(--line-2)}\n"
    "/* 里程碑 0：积木架按元音 / 辅音分两组，组内顺序 = 累计教学顺序；辅音组最多 7 块一行，位置跨周不挪 */\n"
    ".rack__group{display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap; width:100%}\n"
    ".rack__group--c{max-width:calc(7 * 64px + 6 * 8px)}\n"
    ".rack__label{flex-basis:100%; text-align:center; font-family:var(--dis); font-size:12px; color:var(--ink-3); letter-spacing:.12em}",
    "里程碑0 CSS")

sub("function initG5(){",
    """/* 里程碑 0（课程方案 §9.2，用户 2026-09-02 拍板"分组固定位架"）：积木架按元音 / 辅音分两组渲染，
   组内顺序 = RACK_LETTERS 的累计教学顺序（新字母只在末尾追加，旧字母位置不动）。tiles 的索引
   仍是 RACK_LETTERS 的索引，G4 / G5 的入槽逻辑不受影响；辅音组由 CSS 限宽为最多 7 块一行。 */
function groupedRackHTML(letters, tiles){
  const v = [], c = [];
  letters.forEach((ch, i) => (vowels.includes(ch) ? v : c).push(tiles[i]));
  const group = (label, cls, arr) => arr.length
    ? `<div class="rack__group ${cls}"><span class="rack__label">${label}</span>${arr.join('')}</div>` : '';
  return group('元音', 'rack__group--v', v) + group('辅音', 'rack__group--c', c);
}

function initG5(){""", "里程碑0 helper")

sub("    function rackHTML(){\n      return RACK_LETTERS.map((c,i)=>{",
    "    function rackHTML(){\n      const tiles = RACK_LETTERS.map((c,i)=>{", "里程碑0 rackHTML 开头 ×2", count=2)
sub("      }).join('');\n    }\n    function slotsHTML(cls){",
    "      });\n      return groupedRackHTML(RACK_LETTERS, tiles);\n    }\n    function slotsHTML(cls){", "里程碑0 G4 rackHTML 结尾")
sub("      }).join('');\n    }\n    function slotsHTML(){",
    "      });\n      return groupedRackHTML(RACK_LETTERS, tiles);\n    }\n    function slotsHTML(){", "里程碑0 G5 rackHTML 结尾")

# ═════════════════════════════════════════ #13 积木架字母（两处）
sub("const RACK_LETTERS = 'atpncehmrd'.split('');   // 10 块，每字母 1 块——八张订单词都没有重复字母",
    "const RACK_LETTERS = 'aouhmdglfb'.split('');   // 10 块，每字母 1 块——八张订单词都没有重复字母；按教学顺序排，渲染按元音 / 辅音分组",
    "#13 RACK_LETTERS G4")
sub("const RACK_LETTERS = 'satipnckehrmd'.split('');   // 13 块，两周全部字母，每字母 1 块——白名单已排除叠字母词",
    "const RACK_LETTERS = 'satipnckehrmdgoulfb'.split('');   // 19 块，三周全部字母按教学顺序累计，每字母 1 块——白名单已排除叠字母词；渲染按元音 / 辅音分组",
    "#13 RACK_LETTERS G5")
sub("解锁后：12 块积木\n   (两周 13 个字母各 1 块)+2/3/4 槽切换", "解锁后：19 块积木\n   (三周 19 个字母各 1 块，按元音 / 辅音分组固定位)+2/3/4 槽切换", "G5 说明注释")

# ═════════════════════════════════════════ #1 / #13b 存储键与闪卡上限
sub("const KEY = 'soundblocks-w2-v1';", "const KEY = 'soundblocks-w3-v1';", "#1 KEY")
sub("const FLASH_CAPACITY_BY_KEY = { flash_words:12 };   /* 第五天一分钟裸读共 12 张，成绩不可能超过它 */",
    "const FLASH_CAPACITY_BY_KEY = { flash_words:12, flash_sounds:19 };   /* 第五天一分钟裸读 12 张、第六天十九音计时 19 张，成绩不可能超过它 */",
    "#13b FLASH_CAPACITY")

# ═════════════════════════════════════════ #16-#19 资产常量置空（素材由 embed_assets.py 注入）
cut("const PHONEME_ILL = {", "\n};", """const PHONEME_ILL = {
  /* 本周六个新音的助记插画（gulp / doctor / umbrella / lollipop / candle / ball）待生成，
     提示词见 docs/插画生成提示词_第三周_*.md。由 tools/embed_assets.py 注入，页面不用改代码。 */
};""", "#16 PHONEME_ILL")
cut("const BOOK_IMG = {", "\n};", """const BOOK_IMG = {
  /* 《The Big Dog》六页插画（dogBig / dogDug / danRag / dogLog / catLog / danHug）待生成。
     缺图时小书只显示句子和中文，阅读不受影响。 */
};""", "#17 BOOK_IMG")
cut("const WALL_ILL = {", "\n};", """const WALL_ILL = {
  /* 第一周的绘本裁切版插画不随第三周带过来——第三周不引用它们。 */
};""", "#18 WALL_ILL")
cut("const WORD_ILL = {", "\n};", """const WORD_ILL = {
  /* 本周 36 张词卡插画（let 为抽象词不出图）待生成，art 键与 W 里的键一一对应。
     缺图时词卡自动降级成"单词 + 中文"（hasIll 守卫），教学不受影响。 */
};""", "#18 WORD_ILL")
_m = re.findall(r"const CELEBRATE_NAT = '[^'\n]*';[^\n]*\n", text)   # 整行匹配：行尾带 embed_assets 的注释，不能用 "';\n" 当结束锚（会吃进 illSrc）
assert len(_m) == 1, f"[#19 CELEBRATE_NAT] 期望 1 行，实际 {len(_m)}"
text = text.replace(_m[0], "const CELEBRATE_NAT = '';   /* 第三周庆祝主角图（那只大狗）待生成，见插画文档。常量名沿用引擎约定（embed_assets.py 的注入锚），由它注入，勿手改 */\n")
done.append("#19 CELEBRATE_NAT")

# ═════════════════════════════════════════ #20 音素音注释（录音未获取，走守卫）
sub("   PHONEME AUDIO — 第一周六个音素原样继承，第二周六个新音也已补齐真人示范音。\n"
    "   c 与 k 共用 /k/ 的同一段录音；查不到时仍不渲染听音按钮（规范铁律 8）。",
    "   PHONEME AUDIO — 前两周十二段真人示范音原样继承（c 与 k 共用 /k/）。第三周六个新音\n"
    "   g o u l f b 的录音尚未获取，因此不在此表中——查不到就没有听音按钮（规范铁律 8）。",
    "#20 音素音注释")

# ═════════════════════════════════════════ #1-#12 数据层（从 week03-data.js 切片注入）
BLOCKS = [
    ("RESERVED", "[", "];"), ("SOUNDS", "{", "\n};"), ("W", "{", "\n};"), ("WALL_HINT", "{", "\n};"),
    ("BOOK", "{", "\n};"), ("G1_ROUNDS", "{", "\n};"), ("G1_THEME", "{", "\n};"),
    ("G3_PAIRS", "[", "];"), ("G4_WORDS", "[", "];"), ("G5_WHITELIST", "[", "\n];"), ("DAYS", "[", "\n];"),
]
for name, opener, closer in BLOCKS:
    block = slice_const(data, name, opener, closer)
    cut(f"const {name} = {opener}", closer, block, f"数据层 {name}")
sub("const FIRST_TEACH_DAY = { c:1, k:1, e:2, h:3, r:4, m:5, d:6 };   /* c 和 k 同一天教，同一个音两件外套 */",
    "const FIRST_TEACH_DAY = { g:1, o:2, u:3, l:4, f:5, b:6 };", "#6 首教日")

sub("   SOUNDS — 十三个音素的教学数据：第一周六个原样保留，第二周新增七块字母积木、\n"
    "   对应六个新音。c 与 k 是同一个音的两种写法，共用同一份录音数据。",
    "   SOUNDS — 十九块字母积木的教学数据：前两周十三块原样保留（快闪复习要用，录音已内置），\n"
    "   第三周新增 g o u l f b 六块。c 与 k 仍是同一个音的两种写法，共用同一份录音数据。",
    "#2 SOUNDS 注释")
sub("   BOOK — 第二本自主阅读小书", "   BOOK — 第三本自主阅读小书", "#5 BOOK 注释")
cut("   G3 两扇门 —— 第二天三组最小对立词", "（与第一周同口径）。",
    "   G3 两扇门 —— 第三天三组最小对立词，全部由页面播放录音。三组都是\"只差中间\n"
    "   一块红积木\"：hot/hut、cot/cut、not/nut 全是 ɑ↔ʌ，本周的关键训练。", "#9 G3 注释")
sub("   G4 点单游戏 —— 八张订单，覆盖本周全部六个新音。每个词都没有重复字母，所以\n"
    "   积木架每个字母只放一块（第一周放两块是为了 pip 这类叠字母词）。",
    "   G4 点单游戏 —— 八张订单全是 g 开头或 g 结尾的词，重点听词尾的塞音。每个词都没有\n"
    "   重复字母，积木架每个字母只放一块（10 块，按元音 / 辅音分组渲染）。", "#10 G4 注释")
sub("   G5 造词工坊 —— 真词白名单：两周学过的、且不含重复字母（积木架每字母一块）\n"
    "   的全部真词，共 50 个。保留词绝不在内，另有 Guard.isReserved 前置兜底。",
    "   G5 造词工坊 —— 真词白名单：三周学过的、且不含重复字母（积木架每字母一块）\n"
    "   的真词，累计 111 个。保留词绝不在内，另有 Guard.isReserved 前置兜底。", "#11 G5 注释")

# ═════════════════════════════════════════ #15 首页文案：hero / 点亮墙 / 家长三件事 / 页脚 / 周检说明
sub('<p class="hero__eyebrow">第 2 周 · 共 40 周</p>', '<p class="hero__eyebrow">第 3 周 · 共 40 周</p>', "#15 hero 眉标")
sub("<h1>七块新积木，<br>读完第二本书</h1>", "<h1>五块红积木到齐，<br>读完第三本书</h1>", "#15 hero 标题")
cut('<p class="hero__lede">', '</p>',
    '<p class="hero__lede">这一周加入六块新字母积木：<b class="en">g o u l f b</b>。其中 <b class="en">o</b> 和 <b class="en">u</b> 是两块新的红积木——'
    '<b>到第三天，五块红积木就到齐了</b>，现在拼的每个词里都至少有它们中的一块。十九块积木能拼的词一下子过百，'
    '<b>第四天孩子会自己读出从没见过的词，第五天用从后往前接的老办法拼出四个音的词，第六天读完第三本书。</b></p>',
    "#15 hero 导语")
sub("${'ckehrmd'.split('').map(c=>{", "${'goulfb'.split('').map(c=>{", "#15 点亮墙字母")
sub('<button class="tile tile--c" data-say="cat" style="width:auto;padding:0 22px;font-size:34px">cat</button>',
    '<button class="tile tile--c" data-say="dog" style="width:auto;padding:0 22px;font-size:34px">dog</button>', "#15 hero 示例词")

cut('<details class="fold" open>\n        <summary>一 · 六个新音，先自己过一遍</summary>', '</details>',
    '''<details class="fold" open>
        <summary>一 · 六个新音，先自己过一遍</summary>
        <div class="fold__body">
          <p class="lead">干净的音素示范仍然是整个方案里<b>最关键的技术点</b>。本周六个新音里最容易教歪的是两块红积木：<b class="en">o</b> 不要发成「喔」（那是嘴唇圆起来的另一个音），<b class="en">u</b> 不要发成「乌」（嘴唇要完全放松）。辅音里 /g/ 和 /b/ 在词尾最容易多带一个「哥」「波」的尾巴。</p>
          <p class="lead">后果不是「口音不好听」，而是<b>孩子永远拼不出词</b>——dog 会被念成「德-喔-哥」，然后合不起来。</p>
          <div class="pnote pnote--warn"><span class="pnote__ico">${ART.warn}</span><div class="pnote__b">
            <b>本周的三个自检动作：</b><br>
            · 对着镜子依次发 /æ/ /e/ /ɪ/ /ɑ/ /ʌ/：<b>o 嘴张得最大，u 嘴几乎不动</b>；<br>
            · 念 /g/ /b/ 时手按喉咙<b>应该有震动</b>，念 /k/ /p/ 时<b>不该有</b>——三对双胞胎（t/d、k/g、p/b）这周凑齐了；<br>
            · 念 /l/ 时舌尖<b>贴住</b>上牙后面，念 /r/ 时舌尖<b>悬空</b>——这是本周要专门分开的一对。
          </div></div>
          <div class="pnote pnote--warn"><span class="pnote__ico">${ART.warn}</span><div class="pnote__b">
            <b>本周六个新音还没有真人示范录音。</b>页面上这六块积木不会出现听音按钮，音素实验室里会显示「请按口令示范」——<b>由你亲自示范，不要用手机上的合成语音代替</b>，它会读成字母名或者多带一个元音尾巴。前两周的十三块积木仍可点听。
          </div></div>
        </div>
      </details>''', "#15 家长三件事 一")

cut('<details class="fold">\n        <summary>二 · 节奏不要变</summary>', '</details>',
    '''<details class="fold">
        <summary>二 · 节奏不要变</summary>
        <div class="fold__body">
          <p class="lead">两周下来习惯已经立住了，<b>第三周最大的风险是觉得"他已经会了"而放松</b>——每天 30 分钟、同一时间、同一位置、同一开场，一样都不要动。</p>
          <p class="lead">仍然放在<b>晚饭后、洗澡前</b>那个固定档位。不要挪到睡前——孩子累了效果减半，还会把英语和困倦绑在一起。</p>
          <div class="pnote pnote--ok"><span class="pnote__ico">${ART.tick}</span><div class="pnote__b">
            <b>宁可缩短，不要中断。</b>实在没时间的那天，就做 10 分钟的快闪复习，也算完成。断一天的代价远大于短一天。下周是巩固周，不教新音，正好把这三周的东西沉一沉。
          </div></div>
        </div>
      </details>''', "#15 家长三件事 二")

cut('<details class="fold">\n        <summary>三 · 这一周会比上一周难</summary>', '</details>',
    '''<details class="fold">
        <summary>三 · 这一周词一下子变多</summary>
        <div class="fold__body">
          <p class="lead">两块新的红积木让能拼的词从六十多个跳到一百多个，<b>第四天开始孩子会碰到没教过的词并自己读出来</b>——那正是这套方法要的效果，不是意外。另外两处要留神：<b>o 和 u 靠耳朵分</b>（第三天的关键训练），<b>b 和 d 靠字形分</b>（第六天）。</p>
          <p class="lead">判断标准不变：<b>看第七天的周检，不看每天的情绪。</b>某一天特别不顺，不代表这一周没学会；反过来，每天都很顺但周检读不出来，那才是真的要回头。</p>
          <div class="pnote"><span class="pnote__ico">${ART.bulb}</span><div class="pnote__b">
            每天最后都有一个打卡清单，第七天有一次周检。<b>那就是你要的尺子。</b>孩子学没学会，不用猜。周检读对 4 到 5 个进新课；2 到 3 个补救两天（重做第六天，再用你自编的 5 个三字母词复测，复测够 4 个才进新课）；0 到 1 个、或复测仍不到 4 个，这周从头再来。自编词的规矩写在第七天周检旁边。
          </div></div>
        </div>
      </details>''', "#15 家长三件事 三")

sub('凡是带喇叭图标的<b>字母积木、单词和句子</b>，点一下就读。本周课程实际使用到的录音都已内置，插画也已全部嵌入，<b>断网后仍可完整使用</b>。',
    '凡是带喇叭图标的<b>字母积木、单词和句子</b>，点一下就读。本周的单词与小书句子录音已内置（由 tools/build_audio.py 按 audio_manifest_w3.json 注入——<b>再跑本移植脚本后必须重跑注入</b>，否则这句自述失实）；<b>六个新音的真人示范音和插画尚未就位</b>，页面会自动降级（新音没有听音按钮、词卡显示"单词 + 中文"），<b>断网后仍可完整使用</b>。',
    "#15 发音功能说明 1")
cut('<b>单个音素使用真人教学录音，不用合成语音冒充。</b>第一周六个音和本周六个新音均已内置', '</div></div>',
    '<b>单个音素使用真人教学录音，不用合成语音冒充。</b>前两周十三块积木的录音已内置（出处见页脚），点字母积木即可听；本周六块新积木暂无录音，由你按口令示范。\n          </div></div>',
    "#15 发音功能说明 2")

cut('      <p><strong>为什么第二周是 c k e h r m d。</strong></p>', '<p class="foot__credits">音素示范音',
    '''      <p><strong>为什么第三周是 g o u l f b。</strong></p>
      <p>还是那条原则：按「能立刻组出真词」排，不按字母表排。这一组补上了两块红积木 <b class="en">o</b> 和 <b class="en">u</b>，五个短元音到齐，加上四块新辅音，能拼的真词过百——dog、cup、sun、leg、fan、bug……<b>孩子第一次会碰到没教过的词并自己读出来</b>，那是解码能力真正落地的标志。</p>
      <p>这一周还有三件第一次遇到的事：<b>三对清浊双胞胎凑齐</b>（t/d、k/g、p/b，靠喉咙振动分），<b>o 和 u 要靠耳朵分</b>（中文里不区分它们），以及<b>b 和 d 要靠字形分</b>（肚子朝右、肚子朝左）。下周不教新音，专门巩固这十九块积木。</p>
      <p class="foot__credits">音素示范音''', "#15 页脚")

sub('孩子这两周<b>一个都没练过</b>——它们只由学过的十三个音组成',
    '孩子这三周<b>一个都没练过</b>——它们只由学过的十九个音组成', "#15 周检说明")

# ═════════════════════════════════════════ 残留检查（写出前；命中即失败，不产出半成品）
# 禁止表：这些串只属于第二周，出现即串周（codex 首审 M-7：残留检查从"写出后警告"改为"写出前致命"）。
FORBIDDEN = re.compile(r"第 2 周|soundblocks-w2|'ckehrmd'|第二本书|七块新积木|第二周教学词|第二周是 c k e h r m d|第二周 · 更多积木")
# 宽扫描：可能是串周、也可能是合法的历史回顾；命中后再对允许表，不在允许表里的才算残留。
BROAD = re.compile(r"第二周|两周|十三个|13 个字母|ckehrmd")
# 允许表：合法的"前两周 / 上周"回顾与一音多形注释。新增合法叙述时在这里登记，不要放宽 BROAD。
ALLOWED = re.compile(r"前两周|两周下来|第二周 c 和 k|第二周 c/k|第二周七块|第二周即如此|十三个音一张张过|satipnckehrmdgoulfb|三周学过")
leftover = []
for ln in text.split("\n"):
    if "base64" in ln or "week02.html" in ln:
        continue
    # 复审 R-3：不按整行放行——先把允许短语从这一行剔掉，剩余文本再跑宽扫描，同行里藏着的真残留照样命中
    if FORBIDDEN.search(ln) or BROAD.search(ALLOWED.sub("", ln)):
        leftover.append(ln.strip()[:150])
if leftover:
    print(f"✗ 发现 {len(leftover)} 行疑似第二周残留，未写出 {DST.name}：")
    for ln in leftover[:20]:
        print("   ", ln)
    sys.exit(1)
DST.open("w", encoding="utf-8", newline="").write(text)
print(f"完成 {len(done)} 处替换 → {DST.name}（{len(text)/1024:.0f} KB）；残留检查 0 命中")
