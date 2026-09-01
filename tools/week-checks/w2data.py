# -*- coding: utf-8 -*-
"""第二周数据层。按 docs/声音积木周课件设计规范 §5.1 的 22 项清单逐项给出。"""

TITLE = "<title>声音积木 第二周 · 更多积木</title>"

HEADER_COMMENT = """<!--
设计假设（第二周 · 沿用第一周定稿引擎）：
- 本文件由 week01-v3.html 换数据层而来。引擎、设计系统、播放层、六个游戏、状态
  schema、打印视图、无障碍实现全部继承，未做结构性改动。
- 换周规则、块类型词汇表、铁律与冒烟清单见 docs/声音积木周课件设计规范_20260831_v1.0.md。
- 周主题背景色换成紫色系（刻意设计：每周换一次底色制造新鲜感）。元音红 / 辅音青 /
  琥珀 accent / 完成绿 四个教学语义色跨周冻结，未跟着换。
- 本周新音 c/k、e、h、r、m、d 的真人孤立音与助记插画尚未到位：听音按钮不渲染
  （不用合成语音顶替，见规范铁律 1、8），助记图走文字降级。第一周六个音的真人音
  原样继承，快闪复习里点旧字母积木仍然发声。
- 词卡与小书插画待生成，提示词见 docs/插画生成提示词_第二周_20260831_v1.0.md。
  素材就位后放进对应常量即可自动点亮，页面无需改代码（illSrc/hasIll 守卫）。
-->"""

# ---- §3.1 周主题色：浅色 ----
TOKENS_LIGHT_OLD = """  --ground:#EEF1EE; --surface:#FFFFFF; --surface-2:#F6F9F5; --sunk:#E4E9E4;
  --ink:#232B28; --ink-2:#5C6B65; --ink-3:#8A968F;
  --line:#DBE2DC; --line-2:#C6D0C8;"""
TOKENS_LIGHT_NEW = """  --ground:#F1EFF7; --surface:#FFFFFF; --surface-2:#F8F6FC; --sunk:#E7E2F1;
  --ink:#292633; --ink-2:#655F71; --ink-3:#8B8497;
  --line:#DED8E9; --line-2:#CBBBE3;"""

SHADOW_LIGHT_OLD = """  --shadow-1:0 1px 2px rgba(35,43,40,.07);
  --shadow-2:0 2px 4px rgba(35,43,40,.06), 0 10px 28px -14px rgba(35,43,40,.28);
  --shadow-3:0 4px 8px rgba(35,43,40,.08), 0 20px 44px -18px rgba(35,43,40,.34);
  --tile-face:#FFFFFF; --tile-edge:#C9D3CB;"""
SHADOW_LIGHT_NEW = """  --shadow-1:0 1px 2px rgba(41,38,51,.07);
  --shadow-2:0 2px 4px rgba(41,38,51,.06), 0 10px 28px -14px rgba(41,38,51,.28);
  --shadow-3:0 4px 8px rgba(41,38,51,.08), 0 20px 44px -18px rgba(41,38,51,.34);
  --tile-face:#FFFFFF; --tile-edge:#CFC7DE;"""

# ---- §3.1 周主题色：深色（两处，缩进不同）----
DARK_OLD_4 = """    --ground:#151A18; --surface:#1E2523; --surface-2:#242C29; --sunk:#121615;
    --ink:#E9EEEB; --ink-2:#A2AEA8; --ink-3:#78847E;
    --line:#313A36; --line-2:#414C47;"""
DARK_NEW_4 = """    --ground:#18161D; --surface:#24212B; --surface-2:#2C2835; --sunk:#121016;
    --ink:#F0EDF5; --ink-2:#B8B1C3; --ink-3:#8F879B;
    --line:#3C3648; --line-2:#4C4459;"""
DARK_OLD_2 = """  --ground:#151A18; --surface:#1E2523; --surface-2:#242C29; --sunk:#121615;
  --ink:#E9EEEB; --ink-2:#A2AEA8; --ink-3:#78847E;
  --line:#313A36; --line-2:#414C47;"""
DARK_NEW_2 = """  --ground:#18161D; --surface:#24212B; --surface-2:#2C2835; --sunk:#121016;
  --ink:#F0EDF5; --ink-2:#B8B1C3; --ink-3:#8F879B;
  --line:#3C3648; --line-2:#4C4459;"""

DARK_TILE_OLD_4 = "    --tile-face:#2A3330; --tile-edge:#3E4944;"
DARK_TILE_NEW_4 = "    --tile-face:#2F2A38; --tile-edge:#453D52;"
DARK_TILE_OLD_2 = "  --tile-face:#2A3330; --tile-edge:#3E4944;"
DARK_TILE_NEW_2 = "  --tile-face:#2F2A38; --tile-edge:#453D52;"

# ---- §5.1 #7 保留词 ----
RESERVED = ("const RESERVED = ['ram','hem','rid','dam','kid'];   "
            "/* 周检五词，全 CVC，本周任何练习/游戏/小书里都不出现 */")

# ---- §5.1 #2 SOUNDS：本周七条（k 与 c 共用一份） ----
SOUNDS_W2 = """  c:{L:'c', ipa:'/k/', type:'c', art:'camera', mem:'咔嚓相机 k-k-k',
     cue:'舌头后面轻轻堵住，再突然放开，像按下快门：<span class="en">k、k、k</span>。',
     challenge:'拖不长的音', try:'一只手摸着喉咙，短短地发三次 /k/，再故意想把它拖长试试。',
     pass:'喉咙不振动，声音一下就停，而且根本拖不长，也听不到「科」的尾巴。',
     how:'舌头后部抬起，顶住上颚靠后那块软的地方，短暂挡住气流后迅速放开。这是清音，声带不参与。',
     warn:'最常见的错是念成中文「科」，多带了一个元音尾巴。孩子拼 cat 时就会变成「科-啊-特」，然后合不起来。发完立刻闭嘴停住。',
     demo:[['cat','猫'],['cap','鸭舌帽'],['kit','工具包']]},
  e:{L:'e', ipa:'/e/', type:'v', art:'huh', mem:'没听清，反问一声 e?',
     cue:'嘴巴自然微张、稍微扁一点，短短地发一次：<span class="en">e、e、e</span>，像没听清时反问「诶？」的前半截。',
     challenge:'三块红积木', try:'对着镜子依次说 /æ/、/ɪ/、/e/，每次只发一个短音，看看嘴形有什么不一样。',
     pass:'三个音的嘴形明显不同：/æ/ 最开最扁，/ɪ/ 最松，/e/ 在中间。每个都短，都不往别的音滑。',
     how:'下巴打开的程度介于 /æ/ 和 /ɪ/ 之间，舌头靠前、中高位置，保持稳定不滑动。',
     warn:'不要发成中文「诶」——「诶」会滑向 /i/，变成两个音。也不要拖长。',
     demo:[['ten','十'],['net','网'],['pen','笔']]},
  h:{L:'h', ipa:'/h/', type:'c', art:'breath', mem:'对手心轻轻哈气 hhh',
     cue:'像要在镜子上哈一层薄雾，气流直接送出去：<span class="en">hhh</span>，然后马上接住后面的元音。',
     challenge:'手心起雾', try:'手掌放在嘴前，先轻轻哈一次气，再立刻接一个 /æ/，连成 h-a。',
     pass:'手心能感觉到一股温热的气，喉咙不振动，而且 /h/ 和后面的元音是连着的，中间不断开。',
     how:'声门微开让气流通过，口腔不做任何阻挡，舌位由后面跟着的元音决定。它其实是一次带着方向的呼气。',
     warn:'不要念成中文「喝」。/h/ 本身几乎没有声音，必须靠后面的元音把它带出来，不能单独用力发。',
     demo:[['hat','帽子'],['hen','母鸡'],['hip','胯']]},
  r:{L:'r', ipa:'/r/', type:'c', art:'racecar', mem:'小赛车启动 rrr',
     cue:'嘴唇稍微撅圆，舌尖抬起来但<b>不要碰到任何地方</b>，像小赛车发动：<span class="en">rrrrr</span>。',
     challenge:'舌尖悬空', try:'先发一个 /d/ 感受舌尖顶住上牙后面，再发 /r/，检查舌尖是不是悬在半空、没碰到。',
     pass:'发 /r/ 时舌尖悬空不接触，声音可以拖长，而且舌头没有弹动。',
     how:'舌尖上翘接近上齿龈后方但不接触，舌根略后缩，双唇略圆。这是英语特有的近音。',
     warn:'两个典型错误：一是发成中文「日」（舌头太平太靠后），二是发成弹舌的大舌音。都靠「舌尖悬空、嘴唇略圆」这两个动作纠正。',
     demo:[['rat','老鼠'],['red','红色'],['rip','撕开']]},
  m:{L:'m', ipa:'/m/', type:'c', art:'yum', mem:'闭嘴尝美味 mmmmm',
     cue:'双唇合拢，声音从鼻子里出来，可以一直拖长：<span class="en">mmmmm</span>，像吃到好吃的。',
     challenge:'鼻子开关', try:'一只手摸双唇，一只手摸鼻翼，拖长 /m/，然后轻轻捏住鼻子。',
     pass:'嘴唇一直闭着，鼻翼有振动；捏住鼻子后声音会闷住或者停掉。',
     how:'双唇闭合把口腔通道挡死，声带振动，气流全部从鼻腔出去。和 /n/ 同理，区别只在挡住的位置。',
     warn:'不要念成中文「木」或「嘛」。/m/ 全程闭着嘴，停下来时也不要补一个元音。',
     demo:[['mat','垫子'],['man','男人'],['map','地图']]},
  d:{L:'d', ipa:'/d/', type:'c', art:'drum', mem:'小鼓轻敲 d-d-d',
     cue:'舌尖轻点上牙后面，马上弹开，喉咙同时振动：<span class="en">d、d、d</span>，像敲小鼓。',
     challenge:'喉咙开关', try:'一只手摸着喉咙，交替发 /t/、/d/、/t/、/d/，比较有没有振动。',
     pass:'发 /d/ 时喉咙振动，发 /t/ 时不振动，而且两个音的舌头位置完全一样。',
     how:'舌尖抵住上齿龈，短暂挡住气流后放开。和 /t/ 唯一的区别是声带振动——这是一对清浊对立。',
     warn:'不要念成中文「德」。孩子分不清 /d/ 和 /t/ 时，让他摸着喉咙来回切换，靠手感而不是靠耳朵。',
     demo:[['dad','爸爸'],['den','兽穴'],['red','红色']]}"""

SOUNDS_ALIAS = """
/* /k/ 一音两形：k 与 c 共用同一份教学数据，只换显示字母。两个键都必须存在——
   tileHTML / G2 积木 / G4 积木架 / G5 积木架 都按"字母即键"去查 SOUNDS。 */
SOUNDS.k = Object.assign({}, SOUNDS.c, { L:'k' });"""

# ---- §5.1 #3 词库 ----
W_BLOCK = """const W = {
  /* ---- 第一周已学词：快闪复习、G3 词对、G5 造词工坊会用到。插画未随第二周
         带过来（第二周不需要它们出图），art 一律 null，走"词 + 中文"降级。 ---- */
  at:{zh:'在',art:null},      it:{zh:'它',art:null},      an:{zh:'一个',art:null},   in:{zh:'在里面',art:null},
  sat:{zh:'坐下了',art:null}, sit:{zh:'坐',art:null},     pat:{zh:'轻轻拍',art:null}, pit:{zh:'坑',art:null},
  pin:{zh:'大头针',art:null}, pan:{zh:'平底锅',art:null}, nap:{zh:'打个盹',art:null}, tap:{zh:'水龙头',art:null},
  tip:{zh:'小费',art:null},   sip:{zh:'小口喝',art:null}, tin:{zh:'铁罐头',art:null}, nip:{zh:'轻轻咬一口',art:null},
  snap:{zh:'打响指',art:null},spin:{zh:'转圈圈',art:null},

  /* ---- 第二周教学词（34）。art 键与 docs/插画生成提示词_第二周 的文件名一一对应；
         插画未就位时 hasIll() 返回 false，自动降级成"词 + 中文"。 ---- */
  cat:{zh:'猫',art:'cat'},    cap:{zh:'鸭舌帽',art:'cap'}, can:{zh:'罐头',art:'can'},  kit:{zh:'工具包',art:'kit'},
  set:{zh:'一套',art:'set'},  ten:{zh:'十',art:'ten'},     net:{zh:'网',art:'net'},    pen:{zh:'笔',art:'pen'},
  pet:{zh:'宠物',art:'pet'},  hat:{zh:'帽子',art:'hat'},   hen:{zh:'母鸡',art:'hen'},  hit:{zh:'敲一下',art:'hit'},
  hip:{zh:'胯',art:'hip'},    rat:{zh:'老鼠',art:'rat'},   ran:{zh:'跑了',art:'ran'},  rip:{zh:'撕开',art:'rip'},
  rim:{zh:'边缘',art:'rim'},  rest:{zh:'休息',art:'rest'}, mat:{zh:'垫子',art:'mat'},  man:{zh:'男人',art:'man'},
  map:{zh:'地图',art:'map'},  met:{zh:'遇见了',art:'met'}, men:{zh:'男人们',art:'men'},ham:{zh:'火腿',art:'ham'},
  him:{zh:'他',art:null},     dad:{zh:'爸爸',art:'dad'},   did:{zh:'做了',art:null},   dip:{zh:'蘸一下',art:'dip'},
  dim:{zh:'昏暗',art:'dim'},  den:{zh:'兽穴',art:'den'},   sad:{zh:'难过',art:'sad'},  mad:{zh:'生气',art:'mad'},
  red:{zh:'红色',art:'red'},  sand:{zh:'沙子',art:'sand'},

  /* ---- 认读词：不能拼、要整体记 ---- */
  the:{zh:'这个 / 那个',art:null},  is:{zh:'是',art:null},

  /* ---- G1 声音抓抓乐干扰词：只听不读，不进词卡墙，无插画 ---- */
  dog:{zh:'狗',art:null},   fish:{zh:'鱼',art:null},  milk:{zh:'牛奶',art:null},
  sun:{zh:'太阳',art:null}, bat:{zh:'蝙蝠',art:null}, book:{zh:'书',art:null},

  /* ---- 周检保留词：本周任何练习、游戏、小书里都不出现，由 Guard.isReserved 兜底 ---- */
  ram:{zh:'公羊',art:null},  hem:{zh:'衣服下摆',art:null}, rid:{zh:'除掉',art:null},
  dam:{zh:'水坝',art:null},  kid:{zh:'小孩',art:null}
};"""

# ---- §5.1 #4 词卡墙连读词组：第二周没有需要连读的功能词 ----
WALL_HINT_BLOCK = """const WALL_HINT = {
  /* 第一周用它给 at / an / in 这类功能词补一个词组读法。第二周 34 个词全是
     可独立成义的实词，不需要词组提示，留空。 */
};"""

# ---- §5.1 #5 小书 ----
BOOK_BLOCK = """const BOOK = {
  title:'Dan and the Cat', zh:'《丹和那只猫》',
  pages:[
    {line:'A cat sat.',        art:'catSit',   zh:'一只猫坐下了。'},
    {line:'Dan sat.',          art:'danSit',   zh:'丹也坐下了。'},
    {line:'Dan pats the cat.', art:'danPat',   zh:'丹拍拍那只猫。'},
    {line:'The cat is sad.',   art:'catSad',   zh:'那只猫有点难过。'},
    {line:'Dan pats it.',      art:'danPatIt', zh:'丹又拍拍它。'},
    {line:'The cat naps.',     art:'catNap',   zh:'那只猫睡着了。'}
  ]
};"""

# ---- §5.1 #6 首教日 ----
FIRST_TEACH_DAY = ("const FIRST_TEACH_DAY = { c:1, k:1, e:2, h:3, r:4, m:5, d:6 };   "
                   "/* c 和 k 同一天教，同一个音两件外套 */")

# ---- §5.1 #8/#9/#10/#11 游戏题库 ----
G1_ROUNDS = """const G1_ROUNDS = {
  c: { pos:['cat','cap','can','kit'], neg:['dog','fish','milk','sun'] },
  e: { pos:['ten','net','pen','hen'], neg:['cat','pin','sun','bat'] }
};"""
G1_THEME = """const G1_THEME = {
  c: { title:'轮 A · 相机和气球', icon:'camera', cmd:'开头听到 k 就拍气球' },
  e: { title:'轮 B · 第三块红积木', icon:'huh', cmd:'听到词的肚子里藏着 /e/ 就拍气球' }
};"""

G3_PAIRS = """/* ==================================================================
   G3 两扇门 —— 第二天三组最小对立词，全部由页面播放录音。三组都是"只差中间
   一块红积木"：pat/pet 与 man/men 是 æ↔e，pin/pen 是 ɪ↔e。man / men 含
   第五天才教的 m，本环节只听不读，不要求拼读（与第一周同口径）。
   ================================================================== */
const G3_PAIRS = [['pat','pet'],['pin','pen'],['man','men']];"""

G4_WORDS = """/* ==================================================================
   G4 点单游戏 —— 八张订单，覆盖本周全部六个新音。每个词都没有重复字母，所以
   积木架每个字母只放一块（第一周放两块是为了 pip 这类叠字母词）。
   ================================================================== */
const G4_WORDS = ['cat','ten','hat','man','rat','red','map','pen'];"""

G5_WHITELIST = """/* ==================================================================
   G5 造词工坊 —— 真词白名单：两周学过的、且不含重复字母（积木架每字母一块）
   的全部真词，共 50 个。保留词绝不在内，另有 Guard.isReserved 前置兜底。
   ================================================================== */
const G5_WHITELIST = [
  'an','at','in','it','nap','nip','pan','pat','pin','pit','sat','sip','sit','snap','spin','tap','tin','tip',
  'cat','cap','can','kit','set','ten','net','pen','pet','hat','hen','hit','hip','rat','ran','rip','rim',
  'rest','mat','man','map','met','men','ham','him','dip','dim','den','sad','mad','red','sand'
];"""

# ---- §5.1 #1 存储键 ----
KEY = "const KEY = 'soundblocks-w2-v1';"

# ---- 闪卡成绩上限：跟着本周计时闪卡的实际条数走 ----
FLASH_CAP = ("const FLASH_CAPACITY_BY_KEY = { flash_words:12 };   "
             "/* 第五天一分钟裸读共 12 张，成绩不可能超过它 */")

# ---- §5.1 #13 积木架（两处，各自独立）----
RACK_G4_OLD = "    const RACK_LETTERS = 'satipn'.split('').flatMap(c=>[c,c]);   // 12 块，每字母 2 块"
RACK_G4_NEW = ("    const RACK_LETTERS = 'atpncehmrd'.split('');   // 10 块，每字母 1 块——"
               "八张订单词都没有重复字母")
RACK_G5_OLD = "    const RACK_LETTERS = 'satipn'.split('').flatMap(c=>[c,c]);   // 12 块，每字母 2 块"
RACK_G5_NEW = ("    const RACK_LETTERS = 'satipnckehrmd'.split('');   // 13 块，两周全部字母，"
               "每字母 1 块——白名单已排除叠字母词")

# ---- 首页积木点亮墙的字母集 ----
WALL_LETTERS_OLD = "        ${'satipn'.split('').map(c=>{"
WALL_LETTERS_NEW = "        ${'ckehrmd'.split('').map(c=>{"
