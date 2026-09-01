# -*- coding: utf-8 -*-
"""week01-v3.html → week02.html 换数据层移植。

严格按 docs/声音积木周课件设计规范_20260831_v1.0.md §5.1 的 22 项清单执行。
每一处替换都断言锚点唯一命中，漏一处即报错退出，不产出半成品。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import w2data as D
import w2days as DY

ROOT = Path(__file__).resolve().parent.parent.parent   # 从脚本自身位置推导仓库根，不写死盘符
SRC = ROOT / "week01-v3.html"
DST = ROOT / "week02.html"

text = SRC.read_text(encoding="utf-8")
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


# ═════════════════════════════════════════ #22 头部注释 / 标题 / 顶栏
cut("<!--\n设计假设", "-->", D.HEADER_COMMENT, "#22 头部注释")
sub("<title>声音积木 第一周 · 发音实验版</title>", D.TITLE, "#22 标题")
sub('<div class="brand">声音积木<span class="brand__wk">第 1 周 · s a t i p n</span></div>',
    '<div class="brand">声音积木<span class="brand__wk">第 2 周 · c k e h r m d</span></div>',
    "#22 顶栏周次")
sub("   PHONEME AUDIO — 六个音素的真人示范音（MP3 内嵌）。",
    "   PHONEME AUDIO — 第一周六个音素的真人示范音（MP3 内嵌，原样继承）。第二周七个\n"
    "   新音的录音尚未获取，因此不在此表中——查不到就没有听音按钮（规范铁律 8）。",
    "#20 音素音注释")

# ═════════════════════════════════════════ §3.1 周主题色（紫）
sub(D.TOKENS_LIGHT_OLD, D.TOKENS_LIGHT_NEW, "§3.1 浅色令牌")
sub(D.SHADOW_LIGHT_OLD, D.SHADOW_LIGHT_NEW, "§3.1 浅色阴影+积木")
sub(D.DARK_OLD_4, D.DARK_NEW_4, "§3.1 深色令牌(media)")
sub(D.DARK_OLD_2, D.DARK_NEW_2, "§3.1 深色令牌(data-theme)")
sub(D.DARK_TILE_OLD_4, D.DARK_TILE_NEW_4, "§3.1 深色积木(media)")
sub(D.DARK_TILE_OLD_2, D.DARK_TILE_NEW_2, "§3.1 深色积木(data-theme)")
sub("filter:drop-shadow(0 12px 12px rgba(35,43,40,.2));",
    "filter:drop-shadow(0 12px 12px rgba(41,38,51,.2));", "§3.1 庆祝图投影")
sub(".g1card--s{border-color:var(--ok-line)}\n.g1card--a{border-color:var(--vowel-line)}",
    ".g1card--c{border-color:var(--cons-line)}\n.g1card--e{border-color:var(--vowel-line)}",
    "§3.1 G1 卡片描边")
sub(".g1card--s .g1__target{border-color:var(--ok-line); background:var(--ok-soft)}",
    ".g1card--c .g1__target{border-color:var(--cons-line); background:var(--cons-soft)}",
    "§3.1 G1 轮A靶区")
sub(".g1card--s .g1__target::after{", ".g1card--c .g1__target::after{", "§3.1 G1 轮A靶区after")
sub(".g1card--a .g1__target{border-color:var(--vowel-line); background:var(--vowel-soft)}",
    ".g1card--e .g1__target{border-color:var(--vowel-line); background:var(--vowel-soft)}",
    "§3.1 G1 轮B靶区")

# ═════════════════════════════════════════ §5.3 缺素材守卫
sub("function illHTML(key, size){",
    "/* hasIll：art 键写着、但对应插画还没内嵌时，illHTML 返回空串，而调用方的\n"
    "   `d.art ? illHTML(...) : 降级` 只判了键在不在，于是渲染出一个空洞。改判\n"
    "   \"图到底在不在\"，插画后补进来就自动点亮，数据层一个字都不用改。（规范 §5.3） */\n"
    "function hasIll(key){ return !!(key && illSrc(key)); }\n"
    "function illHTML(key, size){", "§5.3 hasIll 助手")

sub("${d.art?illHTML(d.art,72):", "${hasIll(d.art)?illHTML(d.art,72):", "§5.3 守卫·词卡72")
sub("${d.art?illHTML(d.art,56):''}", "${hasIll(d.art)?illHTML(d.art,56):''}",
    "§5.3 守卫·词卡56 ×2", count=2)
sub("${d.art?illHTML(d.art,112):", "${hasIll(d.art)?illHTML(d.art,112):", "§5.3 守卫·词卡112")
sub("      return d.art\n        ? illHTML(d.art, size)",
    "      return hasIll(d.art)\n        ? illHTML(d.art, size)", "§5.3 守卫·闪卡")
sub("const art = (showArt && d.art) ? illHTML(d.art, 56) : '';",
    "const art = (showArt && hasIll(d.art)) ? illHTML(d.art, 56) : '';", "§5.3 守卫·G3开门图")

sub('            <img class="mnemonic-img" src="${PHONEME_ILL[s.art]}" alt="" width="112" height="112">',
    '            ${PHONEME_ILL[s.art] ? `<img class="mnemonic-img" src="${PHONEME_ILL[s.art]}"'
    ' alt="" width="112" height="112">` : \'\'}', "§5.3 守卫·助记图")

sub('            <button class="btn btn--ghost soundlab__listen" data-sayph="${b.s}">'
    '${ART.spk} 先听一遍 <span class="en">${s.ipa}</span></button>',
    '            ${PHONEME_AUDIO[b.s]\n'
    '              ? `<button class="btn btn--ghost soundlab__listen" data-sayph="${b.s}">'
    '${ART.spk} 先听一遍 <span class="en">${s.ipa}</span></button>`\n'
    '              : `<p class="lead" style="font-size:13.5px;margin:0;color:var(--ink-2)">'
    '<b>这个音还没有真人录音。</b>请按下面的口令亲自示范——<b>不要用手机上的合成语音代替</b>，'
    '它会读成字母名或者多带一个元音尾巴。</p>`}', "§5.3 守卫·听音按钮")

sub("""  if(live && SOUNDS[ch]) return `<button class="tile ${t} ${cls||''}" data-sayph="${ch}" aria-label="听 ${SOUNDS[ch].ipa} 的发音">${ch}</button>`;""",
    """  // 只有真人录音在的音才做成发音按钮；没录音的积木保持静态，不做点了没反应的哑巴按钮（铁律 8）
  if(live && SOUNDS[ch] && PHONEME_AUDIO[ch]) return `<button class="tile ${t} ${cls||''}" data-sayph="${ch}" aria-label="听 ${SOUNDS[ch].ipa} 的发音">${ch}</button>`;""",
    "§5.3 守卫·字母积木")

sub("""          return `<button class="tile ${vowels.includes(c)?'tile--v':'tile--c'} ${lit?'tile--wallon':'tile--walloff'}" data-sayph="${c}" aria-label="听 ${SOUNDS[c].ipa} 的发音${lit?'（已点亮）':''}">${c}</button>`;""",
    """          const canHear = !!PHONEME_AUDIO[c];
          return `<button class="tile ${vowels.includes(c)?'tile--v':'tile--c'} ${lit?'tile--wallon':'tile--walloff'}" ${canHear?`data-sayph="${c}"`:''} aria-label="${canHear?`听 ${SOUNDS[c].ipa} 的发音`:`字母 ${c}`}${lit?'（已点亮）':''}">${c}</button>`;""",
    "§5.3 守卫·点亮墙积木")

sub("""        return `<button class="tile ${cls}" data-sayph="${c}" data-g4-tile="${i}" data-g4-letter="${c}" ${used?'disabled':''} aria-label="听 ${SOUNDS[c].ipa} 的发音">${c}</button>`;""",
    """        const canHear = !!PHONEME_AUDIO[c];
        return `<button class="tile ${cls}" ${canHear?`data-sayph="${c}"`:''} data-g4-tile="${i}" data-g4-letter="${c}" ${used?'disabled':''} aria-label="${canHear?`听 ${SOUNDS[c].ipa} 的发音`:`字母 ${c}`}">${c}</button>`;""",
    "§5.3 守卫·G4积木架")

sub("""        return `<button class="tile ${cls}" data-sayph="${c}" data-g5-tile="${i}" data-g5-letter="${c}" ${used?'disabled':''} aria-label="听 ${SOUNDS[c].ipa} 的发音">${c}</button>`;""",
    """        const canHear = !!PHONEME_AUDIO[c];
        return `<button class="tile ${cls}" ${canHear?`data-sayph="${c}"`:''} data-g5-tile="${i}" data-g5-letter="${c}" ${used?'disabled':''} aria-label="${canHear?`听 ${SOUNDS[c].ipa} 的发音`:`字母 ${c}`}">${c}</button>`;""",
    "§5.3 守卫·G5积木架")

sub("  : ART[key];", "  : (ART[key] || '');   // 图和图标都没有时给空串，别把 undefined 渲染出去",
    "§5.3 守卫·bookArt")
sub('        <img class="pb-art" src="${BOOK_IMG[pg.art]}" alt="">',
    '        ${BOOK_IMG[pg.art] ? `<img class="pb-art" src="${BOOK_IMG[pg.art]}" alt="">` : \'\'}',
    "§5.3 守卫·打印插画")

# ═════════════════════════════════════════ 游戏轮次改为数据驱动
sub("""  if(!isPlainObject(g.grab)) g.grab = {};
  ['s','a'].forEach(k=>{
    if(!isPlainObject(g.grab[k])) g.grab[k] = {};
    const v = g.grab[k].best;
    g.grab[k].best = (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 8) ? v : 0;
  });
  Object.keys(g.grab).forEach(k=>{ if(k !== 's' && k !== 'a') delete g.grab[k]; });   // S3 预筛 L1：未知键删除""",
    """  if(!isPlainObject(g.grab)) g.grab = {};
  // 轮次键从 G1_ROUNDS 派生，不再写死 ['s','a']——换周只改题库常量，清洗层自动跟上
  const grabKeys = Object.keys(G1_ROUNDS);
  grabKeys.forEach(k=>{
    if(!isPlainObject(g.grab[k])) g.grab[k] = {};
    const v = g.grab[k].best;
    g.grab[k].best = (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 8) ? v : 0;
  });
  Object.keys(g.grab).forEach(k=>{ if(!grabKeys.includes(k)) delete g.grab[k]; });   // S3 预筛 L1：未知键删除""",
    "G1 清洗层数据驱动")
sub("      ${['s','a'].map(rk=>{", "      ${Object.keys(G1_ROUNDS).map(rk=>{", "G1 渲染数据驱动")
sub("    const roundKey = root.dataset.g1Round;             // 's' | 'a'",
    "    const roundKey = root.dataset.g1Round;             // G1_ROUNDS 的键", "G1 轮次注释")

# ═════════════════════════════════════════ #16-#19 资产常量置空
cut("const PHONEME_ILL = {", "\n};", """const PHONEME_ILL = {
  /* 本周六个新音的助记插画（camera / huh / breath / racecar / yum / drum）待生成，
     提示词见 docs/插画生成提示词_第二周_20260831_v1.0.md §3。图就位后按
     `键:'data:image/png;base64,...'` 填进来即可，页面不用改代码。 */
};""", "#16 PHONEME_ILL")

cut("const BOOK_IMG = {", "\n};", """const BOOK_IMG = {
  /* 《Dan and the Cat》六页插画（catSit / danSit / danPat / catSad / danPatIt / catNap）
     待生成，提示词见插画文档 §5。缺图时小书只显示句子和中文，阅读不受影响。 */
};""", "#17 BOOK_IMG")

cut("const WALL_ILL = {", "\n};", """const WALL_ILL = {
  /* 第一周的绘本裁切版插画不随第二周带过来——第二周不引用它们。 */
};""", "#18 WALL_ILL")

cut("const WORD_ILL = {", "\n};", """const WORD_ILL = {
  /* 本周 34 张词卡插画待生成，art 键与 W 里的键一一对应，提示词见插画文档 §4。
     缺图时词卡自动降级成"单词 + 中文"（hasIll 守卫），教学不受影响。 */
};""", "#18 WORD_ILL")

cut("const CELEBRATE_NAT = '", "';\n",
    "const CELEBRATE_NAT = '';   /* 第二周庆祝主角图（那只猫欢呼）待生成，见插画文档 §6 */\n",
    "#19 CELEBRATE_NAT")

sub("""function celebrateNat(){ showCelebration(confettiHTML() + `<img class="celebrate-nat" src="${CELEBRATE_NAT}" alt="" decoding="async">`); }""",
    """function celebrateNat(){
  // 主角图还没就位时只放彩带，不渲染 src="" 的破图（规范 §5.3）
  const hero = CELEBRATE_NAT ? `<img class="celebrate-nat" src="${CELEBRATE_NAT}" alt="" decoding="async">` : '';
  showCelebration(confettiHTML() + hero);
}""", "#19 celebrateNat 守卫")

# ═════════════════════════════════════════ #1-#13 数据层
sub("""     demo:[['nose','鼻子'],['net','网'],['nap','小睡']]}
};""", "     demo:[['nose','鼻子'],['net','网'],['nap','小睡']]},\n\n"
      "  /* ---- 第二周七个新音 ---- */\n" + D.SOUNDS_W2 + "\n};" + D.SOUNDS_ALIAS, "#2 SOUNDS")
sub("   SOUNDS — 六个音素的教学数据",
    "   SOUNDS — 十三个音素的教学数据：第一周六个原样保留（快闪复习要用，而且真人录音\n"
    "   已内置），第二周七个新增。c 与 k 是同一个音的两种写法，共用同一份数据。",
    "#2 SOUNDS 注释")

cut("const W = {", "\n};", D.W_BLOCK, "#3 W 词库")
cut("const WALL_HINT = {", "\n};", D.WALL_HINT_BLOCK, "#4 WALL_HINT")
cut("const BOOK = {", "\n};", D.BOOK_BLOCK, "#5 BOOK")
sub("   BOOK — 第一本自主阅读小书", "   BOOK — 第二本自主阅读小书", "#5 BOOK 注释")
sub("const FIRST_TEACH_DAY = { s:1, a:1, t:2, i:3, p:4, n:5 };", D.FIRST_TEACH_DAY, "#6 首教日")
sub("const RESERVED = ['nit','sap','tan','pip','spit'];", D.RESERVED, "#7 保留词")
cut("const G1_ROUNDS = {", "\n};", D.G1_ROUNDS, "#8 G1_ROUNDS")
cut("const G1_THEME = {", "\n};", D.G1_THEME, "#8 G1_THEME")
cut("""/* ==================================================================
   G3 两扇门 —— 第三天三组最小对立词都由页面播放录音。""", "];", D.G3_PAIRS, "#9 G3_PAIRS")
cut("""/* ==================================================================
   G4 点单游戏 —— 题库常量""",
    "const G4_WORDS = ['at','it','an','in','sat','pin','nap'];", D.G4_WORDS, "#10 G4_WORDS")
cut("""/* ==================================================================
   G5 造词工坊 —— 白名单常量""",
    "const G5_WHITELIST = ['an','at','in','it','nap','nip','pan','pat','pin','pit','sat','sip','sit','snap','spin','tap','tin','tip'];",
    D.G5_WHITELIST, "#11 G5_WHITELIST")
cut("const DAYS = [", "\n];", DY.DAYS, "#12 DAYS")
sub("const KEY = 'soundblocks-w1-v1';", D.KEY, "#1 存储键")
sub("const FLASH_CAPACITY_BY_KEY = { flash_words:18 };   // 词卡 30 秒挑战成绩上限（v1.3 S-4）",
    D.FLASH_CAP, "闪卡成绩上限")

# #13 积木架：两处同字面量，先换 G4，剩下唯一那处换 G5
text = text.replace(D.RACK_G4_OLD, D.RACK_G4_NEW, 1)
done.append("#13 G4 积木架")
sub(D.RACK_G5_OLD, D.RACK_G5_NEW, "#13 G5 积木架")
sub("   (satipn×2)+2/3/4 槽切换（默认3）+清空重来；点积木入下一空槽、点槽内积木",
    "   (两周 13 个字母各 1 块)+2/3/4 槽切换（默认3）+清空重来；点积木入下一空槽、点槽内积木",
    "#13 G5 注释")

# ═════════════════════════════════════════ #15 首页与页脚文案
sub(D.WALL_LETTERS_OLD, D.WALL_LETTERS_NEW, "#15 点亮墙字母集")
sub('<button class="tile tile--c" data-say="sat" style="width:auto;padding:0 22px;font-size:34px">sat</button>',
    '<button class="tile tile--c" data-say="cat" style="width:auto;padding:0 22px;font-size:34px">cat</button>',
    "#15 hero 示例词")
sub('      <p class="hero__eyebrow">第 1 周 · 共 40 周</p>\n'
    '      <h1>六个声音，<br>拼出第一本书</h1>\n'
    '      <p class="hero__lede">这一周只教六个字母音：<b class="en">s a t i p n</b>。'
    '为什么是这六个——因为它们能组合出二十多个真单词。'
    '<b>第二天孩子就能读出人生第一个自己拼出来的英文词，第六天读完第一本书。</b></p>',
    '      <p class="hero__eyebrow">第 2 周 · 共 40 周</p>\n'
    '      <h1>七块新积木，<br>读完第二本书</h1>\n'
    '      <p class="hero__lede">这一周教七个新字母音：<b class="en">c k e h r m d</b>。'
    '加上第一周那六个，能拼的词一下子多出好几倍。'
    '<b>第二天孩子会认识第三块红积木，第四天第一次拼出四个音的词，第六天读完第二本书。</b></p>',
    "#15 hero 文案")
sub("<h2>开课前，家长先做三件事</h2>", "<h2>这一周，家长盯住三件事</h2>", "#15 家长区标题")

sub("<summary>一 · 花半小时校准你自己的发音</summary>",
    "<summary>一 · 七个新音，先自己过一遍</summary>", "#15 折叠一标题")
sub("""          <p class="lead">这是整个第一年<b>唯一可能让方案失效</b>的技术点。中文母语家长最常见的错误是给辅音加元音尾巴：把 /t/ 念成「特」、/p/ 念成「泼」、/s/ 念成「斯」。</p>
          <p class="lead">后果不是「口音不好听」，而是<b>孩子永远拼不出词</b>——他会把 cat 念成「科-啊-特」，然后合不起来。而且这个错误要几个月后才会暴露。</p>""",
    """          <p class="lead">和第一周一样，这仍然是整个方案里<b>唯一可能让它失效</b>的技术点。本周七个新音里最容易加元音尾巴的是三个：/k/ 念成「科」、/h/ 念成「喝」、/d/ 念成「德」。</p>
          <p class="lead">后果不是「口音不好听」，而是<b>孩子永远拼不出词</b>——他会把 cat 念成「科-啊-特」，然后合不起来。第一周你已经躲过一次，这一周照样要躲。</p>""",
    "#15 折叠一正文")
sub("""            <b>三个自检动作：</b><br>
            · 念 /t/ /p/ /k/ 时，手按喉咙<b>不应该有震动</b>；<br>
            · 念 /p/ 时，嘴前 3 厘米的小纸片<b>应该被吹动</b>；<br>
            · 这三个音<b>你根本拖不长</b>。如果能「特——」地拖出声音，就是加了元音。""",
    """            <b>本周的三个自检动作：</b><br>
            · 念 /k/ /t/ /p/ 时手按喉咙<b>不该有震动</b>，念 /d/ /m/ /r/ 时<b>应该有</b>；<br>
            · /k/ /t/ /d/ 这三个音<b>你根本拖不长</b>。能「科——」地拖出声音，就是加了元音；<br>
            · 念 /r/ 时舌尖<b>悬在半空、不碰任何地方</b>——碰到了就成了中文「日」。""",
    "#15 折叠一自检")
sub("""          <p class="lead"><b>六个音的真人示范已内置在每天的课里，点字母积木就能听。</b>先照录音校准自己，再给孩子示范；每个音的动作实验、自检标准和家长提示，都写在当天的课里。开课前把六个音自己过一遍。</p>""",
    """          <div class="pnote pnote--warn"><span class="pnote__ico">${ART.warn}</span><div class="pnote__b">
            <b>本周七个新音还没有真人录音。</b>所以这一周的新字母积木上<b>没有听音按钮</b>——这是有意留白：合成语音会把 /k/ 读成字母名或者多带一个元音，恰好是我们要避免的那个错误。请按每天课里的动作口令亲自示范。<b>第一周那六个音的录音仍然可以点</b>，每天的快闪复习都用得上。
          </div></div>""",
    "#15 折叠一录音说明")

sub("<summary>二 · 固定时间、固定位置、固定顺序</summary>", "<summary>二 · 节奏不要变</summary>",
    "#15 折叠二标题")
sub("""          <p class="lead">你在中文识字上已经验证过这一点：<b>让孩子不需要每天重新下决心</b>。同一个时间、同一张桌子、同样的开场动作，把它变成像刷牙一样的自动行为。</p>
          <p class="lead">建议放在<b>晚饭后、洗澡前</b>这个固定档位。不要放在睡前——孩子累了，效果减半，还会把英语和困倦绑在一起。</p>""",
    """          <p class="lead">第一周已经把习惯建起来了，<b>第二周最大的风险是松动</b>——新鲜感过去了，孩子可能开始讨价还价。这时候既不要加码，也不要放弃，把时间、位置、开场动作原样保持住就行。</p>
          <p class="lead">仍然放在<b>晚饭后、洗澡前</b>那个固定档位。不要挪到睡前——孩子累了效果减半，还会把英语和困倦绑在一起。</p>""",
    "#15 折叠二正文")

sub("<summary>三 · 调整你自己的预期</summary>", "<summary>三 · 这一周会比上一周难</summary>",
    "#15 折叠三标题")
sub("""          <p class="lead">这一周结束时，孩子会的是：六个字母音、二十来个三字母单词、一本六页的小书。<b>看上去比外教课「低级」得多。</b></p>
          <p class="lead">但这两件事有本质区别：外教课上他听懂的部分不可测量、不可积累；而这一周学的每一样都<b>可以当场验证，而且是后面所有内容的地基</b>。就像 100 以内的加减法——看着简单，但没有它，后面什么都建不起来。</p>""",
    """          <p class="lead">第一周那六个音是精挑过的，好发、好拼。从这一周开始难度实打实上一个台阶：<b>c 和 k 同音不同形</b>、<b>a / i / e 三块红积木要靠耳朵分</b>、<b>出现四个音的词</b>。孩子卡住的次数会比上周多，这是正常的，不是退步。</p>
          <p class="lead">判断标准不变：<b>看第七天的周检，不看每天的情绪。</b>某一天特别不顺，不代表这一周没学会；反过来，每天都很顺但周检读不出来，那才是真的要回头。</p>""",
    "#15 折叠三正文")

sub("""          <p class="lead">页面用的是浏览器自带的语音合成，<b>不需要联网下载音频</b>。凡是带喇叭图标的<b>单词和句子</b>，点一下就读，发音准确。</p>""",
    """          <p class="lead">凡是带喇叭图标的<b>单词和句子</b>，点一下就读。本周新词的录音正在补齐，还没补到的会自动用浏览器语音兜底，发音仍然可靠，而且<b>全程不需要联网</b>。</p>""",
    "#15 折叠四正文")
sub("""            <b>单个音素（/s/ /t/ /p/…）不用合成语音</b>——它会读成字母名或者自动加上元音，恰好是我们要避免的错误。六个音内置的是<b>真人教学发音的录音</b>（出处见页脚）：<b>点任何字母积木就能听</b>。你的亲自示范仍然最重要——先用录音校准自己，再带孩子练。""",
    """            <b>单个音素（/k/ /h/ /d/…）永远不用合成语音</b>——它会读成字母名或者自动加上元音，恰好是我们要避免的错误。第一周那六个音内置了<b>真人教学录音</b>（出处见页脚），点字母积木就能听；<b>本周七个新音的录音还没到位，所以这些积木上暂时没有听音按钮</b>，请按当天的动作口令亲自示范。""",
    "#15 折叠四音素说明")

sub("""      <p><strong>为什么第一周是 s a t i p n，而不是 A B C。</strong></p>
      <p>按字母表顺序教，学完 a b c 三个音只能拼出 cab 一个词，孩子要熬很久才有第一次成功。而 s a t i p n 这六个音能组出 sat、sit、pin、pan、nap、tap、tip、snap、spin 二十多个真词——<b>孩子在第二天就能尝到「我自己读出来了」的滋味。</b></p>
      <p>这和你教中文识字时先教「人、口、手」而不是按笔画顺序，是同一个道理：<b>先给他能立刻用起来的东西。</b></p>""",
    """      <p><strong>为什么第二周是 c k e h r m d。</strong></p>
      <p>还是那条原则：按「能立刻组出真词」排，不按字母表排。加上这七个音之后，可拼的词从二十多个跳到六十多个——cat、hat、hen、ten、map、man、red、sand……<b>孩子这一周会第一次感觉到「我能读的东西突然变多了」。</b></p>
      <p>这一周还有两件事是第一次遇到：<b>一个声音有两种写法</b>（c 和 k 都发 /k/），以及<b>四个音的词</b>（rest、sand）。前者让他知道英语的字母和声音不是一一对应；后者把拼读的长度从三个音推到四个音。两件都是往后走绕不开的台阶，早遇到比晚遇到好。</p>""",
    "#15 页脚")

# ═════════════════════════════════════════ 打印小书文案
sub('<div class="pb-zh">我自己读完的第一本英文书</div>',
    '<div class="pb-zh">我自己读完的第二本英文书</div>', "打印封面")
sub("          我读完了人生第一本英文书。<br><br>", "          我读完了第二本英文书。<br><br>", "打印签名页")

# ═════════════════════════════════════════ 周检文案
sub(DY.EXAM_OLD_1, DY.EXAM_NEW_1, "周检导语")
sub(DY.EXAM_OLD_2, DY.EXAM_NEW_2, "周检结论表")
sub(DY.EXAM_OLD_4, DY.EXAM_NEW_4, "周检提示")

DST.write_text(text, encoding="utf-8", newline="")   # newline="" 防止 Windows 把 LF 写成 CRLF（见 .gitattributes）
print(f"已写出 {DST}（{len(text)/1024:.0f} KB）")
print(f"完成 {len(done)} 项替换：")
for i, d in enumerate(done, 1):
    print(f"  {i:2d}. {d}")
