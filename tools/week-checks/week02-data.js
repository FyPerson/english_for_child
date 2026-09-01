/* 第 2 周数据层（由 tools/extract_data_layer.py 从 week02.html 抽出）。
   契约与写法见 docs/第三周数据层交接_20260901_v1.0.md。
   校验：node tools/week-checks/check_data.js week02-data.js */

/* ==================================================================
   META —— 这些值在周课件 HTML 里散落在函数体和模板字符串里（积木架在 initG4 /
   initG5 内部、点亮墙字母集在 renderHome 的模板串里），独立数据文件必须显式声明，
   否则校验器无从得知。装配回 HTML 时要与这里一致。
   ================================================================== */
const META = {
  week: 2,
  storageKey: 'soundblocks-w2-v1',
  rackG4: 'atpncehmrd',              // G4 点单积木架，每字母 1 块
  rackG5: 'satipnckehrmd',   // G5 造词积木架，每字母 1 块
  wallLetters: 'ckehrmd',           // 首页积木点亮墙显示哪些字母
  flashCapacity: { flash_words:12 },        // 计时闪卡成绩上限 = 本周计时闪卡实际条数
};


const RESERVED = ['ram','hem','rid','dam','kid'];


const SOUNDS = {
  s:{L:'s', ipa:'/s/', type:'c', art:'snake', mem:'蛇在吐信子 sssss',
     cue:'牙齿靠近，像小蛇一样轻轻漏气：<span class="en">ssssss</span>。看看谁坚持得更久。',
     challenge:'喉咙侦探', try:'一只手摸着喉咙，另一只手放在嘴前，再发一次长长的 /s/。',
     pass:'喉咙安静，嘴前有细细的风，而且声音可以一直拖长。',
     how:'上下牙靠近但不要咬紧；舌尖靠近上牙后方，不碰牙齿，让气流从舌头中央持续通过。',
     warn:'如果听见「斯」的尾巴，说明多带了一个元音。先把声音拖成长长的 /s/，再练习干净地停住。',
     demo:[['snake','蛇'],['sun','太阳'],['sock','袜子']]},
  a:{L:'a', ipa:'/æ/', type:'v', art:'ant', mem:'蚂蚁爬上手臂 a-a-a',
     cue:'小蚂蚁爬上手臂啦！嘴巴张大、稍微扁一点，短短地说：<span class="en">a-a-a</span>。',
     challenge:'镜子挑战', try:'对着镜子先说中文「啊」，再把嘴角向两边展开一点，短短地发 /æ/。',
     pass:'嘴比说「啊」更扁，声音短，不滑向「爱」。',
     how:'下巴打开，嘴唇自然或略向两边展开；舌头放低并靠前。保持一个稳定的短元音，不要滑动。',
     warn:'中文里没有完全对应的音。不要用「啊」或「爱」替代；先夸张嘴形，再逐渐缩小动作。',
     demo:[['ant','蚂蚁'],['apple','苹果'],['cat','猫']]},
  t:{L:'t', ipa:'/t/', type:'c', art:'tiger', mem:'小老虎轻轻踏步 t-t-t',
     cue:'舌尖轻点上牙后面，马上弹开。手指敲一下手心：<span class="en">t、t、t</span>。',
     challenge:'短音刹车', try:'每发一次 /t/ 就立刻闭嘴停住，再摸摸喉咙有没有振动。',
     pass:'声音一下就停，喉咙不振动，也听不到「特」的尾巴。',
     how:'舌尖或舌叶贴住上牙后方的小凸起，短暂挡住气流后迅速放开；这是一个清音。',
     warn:'不要加中文「特」里的元音尾巴。孩子只需要听到一次短促、干净的释放。',
     demo:[['ten','十'],['top','陀螺'],['tap','水龙头']]},
  i:{L:'i', ipa:'/ɪ/', type:'v', art:'igloo', mem:'冰屋里冷得发抖 i-i-i',
     cue:'假装冰屋里有点冷，肩膀轻轻抖一下，嘴巴放松：<span class="en">i、i、i</span>。',
     challenge:'松紧对比', try:'先故意说一个紧紧、长长的「衣——」，再把嘴放松，只发一下短短的 /ɪ/。',
     pass:'第二个声音明显更短、更松，嘴角没有一直用力。',
     how:'嘴微微张开，舌头靠前但保持放松。重点不是把嘴拉成笑脸，而是短促、松弛。',
     warn:'不要用中文「衣」替代，也不要拖长。练习时一次只发一个短音。',
     demo:[['igloo','冰屋'],['in','在里面'],['sit','坐']]},
  p:{L:'p', ipa:'/p/', type:'c', art:'popcorn', mem:'爆米花蹦出来 p-p-p',
     cue:'双唇先关紧，再像爆米花一样突然弹开：<span class="en">p、p、p</span>！',
     challenge:'纸片起飞', try:'把一小片轻纸放在嘴前约 3 厘米，每发一次 /p/，看纸片会不会跳一下。',
     pass:'纸片会动，喉咙不振动，而且爆开后没有「泼」的元音尾巴。',
     how:'双唇完全闭合，短暂挡住气流后迅速放开；舌头不用摆特殊位置，喉咙保持安静。',
     warn:'纸片实验只检查有没有爆破气流；是否发得干净，还要听后面有没有多出一个元音。',
     demo:[['pig','猪'],['pen','笔'],['pan','平底锅']]},
  n:{L:'n', ipa:'/n/', type:'c', art:'nose', mem:'声音从鼻子出来 nnnnn',
     cue:'舌尖停在上牙后面，手指轻轻碰鼻梁，拖长：<span class="en">nnnnn</span>。',
     challenge:'鼻子开关', try:'先拖长 /n/，再轻轻捏住鼻子；松开、捏住，来回试两次。',
     pass:'鼻梁能感觉到振动，捏住鼻子后声音会明显改变或停住。',
     how:'舌尖贴住上牙后方，位置和 /t/ 接近；口腔通道被挡住，声音与气流主要从鼻腔通过。',
     warn:'不要念成「呢」。/n/ 可以持续，但停下时不要再补一个元音。',
     demo:[['nose','鼻子'],['net','网'],['nap','小睡']]},

  /* ---- 第二周七个新音 ---- */
  c:{L:'c', ipa:'/k/', type:'c', art:'camera', mem:'咔嚓相机 k-k-k', audioKey:'c',
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
     demo:[['dad','爸爸'],['den','兽穴'],['red','红色']]}
};

SOUNDS.k = Object.assign({}, SOUNDS.c, { L:'k' });


const W = {
  /* ---- 第一周已学词：快闪复习、G3 词对、G5 造词工坊会用到。第三天会复用
         第一周的 natSit / natPat PNG 原图，其余旧词仍走“词 + 中文”降级。 ---- */
  at:{zh:'在',art:null},      it:{zh:'它',art:null},      an:{zh:'一个',art:null},   in:{zh:'在里面',art:null},
  sat:{zh:'坐下了',art:'natSit'}, sit:{zh:'坐',art:'natSit'}, pat:{zh:'轻轻拍',art:'natPat'}, pit:{zh:'坑',art:null},
  pin:{zh:'大头针',art:null}, pan:{zh:'平底锅',art:null}, nap:{zh:'打个盹',art:null}, tap:{zh:'水龙头',art:null},
  tip:{zh:'小费',art:null},   sip:{zh:'小口喝',art:null}, tin:{zh:'铁罐头',art:null}, nip:{zh:'轻轻咬一口',art:null},
  snap:{zh:'打响指',art:null},spin:{zh:'转圈圈',art:null},

  /* ---- 第二周教学词（34）。art 键与 docs/插画生成提示词_第二周 的文件名一一对应；
         插画未就位时 hasIll() 返回 false；日课与词卡墙都参考第一周 it，用放大单词占图位。 ---- */
  cat:{zh:'猫',art:'cat'},    cap:{zh:'鸭舌帽',art:'cap'}, can:{zh:'罐头',art:'can'},  kit:{zh:'工具包',art:'kit'},
  set:{zh:'一套',art:'set'},  ten:{zh:'十',art:'ten'},     net:{zh:'网',art:'net'},    pen:{zh:'钢笔',art:'pen'},
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
};


const WALL_HINT = {
  /* 第一周用它给 at / an / in 这类功能词补一个词组读法。第二周 34 个词全是
     可独立成义的实词，不需要词组提示，留空。 */
};


const BOOK = {
  title:'Dan and the Cat', zh:'《丹和那只猫》',
  pages:[
    {line:'A cat sat.',        art:'catSit',   zh:'一只猫坐下了。'},
    {line:'Dan sat.',          art:'danSit',   zh:'丹也坐下了。'},
    {line:'Dan pats the cat.', art:'danPat',   zh:'丹拍拍那只猫。'},
    {line:'The cat is sad.',   art:'catSad',   zh:'那只猫有点难过。'},
    {line:'Dan pats it.',      art:'danPatIt', zh:'丹又拍拍它。'},
    {line:'The cat naps.',     art:'catNap',   zh:'那只猫睡着了。'}
  ]
};


const FIRST_TEACH_DAY = { c:1, k:1, e:2, h:3, r:4, m:5, d:6 };


const G1_ROUNDS = {
  c: { pos:['cat','cap','can','kit'], neg:['dog','fish','milk','sun'] },
  e: { pos:['ten','net','pen','hen'], neg:['cat','pin','sun','bat'] }
};


const G1_THEME = {
  c: { title:'轮 A · 相机和气球', icon:'camera', targetArt:'cat', cmd:'开头听到 k 就拍气球' },
  e: { title:'轮 B · 第三块红积木', icon:'huh', targetArt:'ten', cmd:'听到词的肚子里藏着 /e/ 就拍气球' }
};


const G3_PAIRS = [['pat','pet'],['pin','pen'],['man','men']];


const G4_WORDS = ['cat','ten','hat','man','rat','red','map','pen'];


const G5_WHITELIST = [
  'an','at','in','it','nap','nip','pan','pat','pin','pit','sat','sip','sit','snap','spin','tap','tin','tip',
  'cat','cap','can','kit','set','ten','net','pen','pet','hat','hen','hit','hip','rat','ran','rip','rim',
  'rest','mat','man','map','met','men','ham','him','dip','dim','den','sad','mad','red','sand'
];


const DAYS = [
{
  n:1, wd:'第一天', title:'一个声音，两件外套', sounds:['c','k'],
  goal:'认识 /k/，并且知道 c 和 k 在本周的词里发同一个音',
  steps:[
    {t:'快闪复习', min:4, blocks:[
      {b:'lead', html:'第二周每天都从快闪开始。<b>先把第一周的六个音过一遍</b>——卡片一张张过，看到就说音，不要思考、不要犹豫，追求快。后面四张是旧词，无图直接读。'},
      {b:'flash', items:[{k:'s'},{k:'a'},{k:'t'},{k:'i'},{k:'p'},{k:'n'},{k:'w',v:'sat'},{k:'w',v:'sit'},{k:'w',v:'pin'},{k:'w',v:'nap'}]}
    ]},
    {t:'新声音 /k/', min:8, blocks:[
      {b:'sound', s:'c'},
      {b:'note', tone:'bulb', html:'<b>今天只记一件事：</b><span class="en">c</span> 和 <span class="en">k</span> 是两张不同的字母卡，但在今天这些词里发的是<b>同一个 /k/ 音</b>。就像同一个人穿了两件不同的外套。什么时候穿哪一件，以后自然会遇到，今天不讲规则。'},
      {b:'lead', html:'<strong>认字形：</strong>c 是一个没合上的圆圈，k 是一根竖棍加两条斜线。两个都空中写 5 遍，本子上各写 5 个，写的时候嘴里一直念 k-k-k。'}
    ]},
    {t:'拼读练习', min:10, blocks:[
      {b:'lead', html:'四个词，全都用今天这块新积木开头。<b>还是那三步：①一个一个念　②越念越快　③合起来。</b>'},
      {b:'blend', words:['cat','cap','can','kit']},
      {b:'words', items:['cat','cap','can','kit']}
    ]},
    {t:'听音找首字母', min:5, blocks:[
      {b:'lead', html:'你随机说一个词，孩子指出它开头是 <span class="en">c</span> 还是 <span class="en">k</span>。<b>这一步只观察，不纠正</b>——今天不要求他知道什么时候该用哪个字母。'},
      {b:'table', head:['你说这个词','孩子指哪张卡'], rows:[
        ['<b class="en">cat</b>　猫','<b class="en">c</b>'],
        ['<b class="en">kit</b>　工具包','<b class="en">k</b>'],
        ['<b class="en">cap</b>　鸭舌帽','<b class="en">c</b>'],
        ['<b class="en">can</b>　罐头','<b class="en">c</b>']
      ]},
      {b:'note', tone:'bulb', html:'孩子会发现 <span class="en">c</span> 出现得多得多。<b>这个观察本身就很有价值</b>，让他自己注意到就行，不用你替他总结。'}
    ]},
    {t:'收尾打卡', min:3, blocks:[
      {b:'checks', items:[
        ['无图读出 <span class="en"><b>cat</b></span> 和 <span class="en"><b>can</b></span>','你写在纸上，他不看图片直接读'],
        ['看到 c 或 k 都能说出 /k/','短促，没有「科」的尾巴'],
        ['知道一个声音可以有两种写法','让他自己说出是哪两个字母']
      ]}
    ]}
  ]
},
{
  n:2, wd:'第二天', title:'第三块红积木', sounds:['e'],
  goal:'认识短元音 /e/，并能在 a、i、e 三个音里听出区别',
  steps:[
    {t:'快闪复习', min:3, blocks:[
      {b:'flash', items:[{k:'s'},{k:'a'},{k:'t'},{k:'i'},{k:'p'},{k:'n'},{k:'c'},{k:'w',v:'cat'},{k:'w',v:'cap'},{k:'w',v:'kit'}]}
    ]},
    {t:'新声音 /e/', min:7, blocks:[
      {b:'sound', s:'e'},
      {b:'lead', html:'<strong>认字形：</strong>e 是一个圆圈中间划一横。空中写 5 遍，本子上写 5 个。'},
      {b:'note', tone:'bulb', html:'<b>红积木现在有三块了。</b>把 <span class="en"><span class="v">a</span></span>、<span class="en"><span class="v">i</span></span>、<span class="en"><span class="v">e</span></span> 三张卡摆在一起让孩子看看——它们都是红的，因为<b>每个词里都得有一块红的</b>。这条规律他已经见过很多次，今天可以问问他发现没有。'}
    ]},
    {t:'拼读练习', min:8, blocks:[
      {b:'blend', words:['set','ten','net','pen','pet']},
      {b:'words', items:['set','ten','net','pen','pet']}
    ]},
    {t:'关键训练：听出区别', min:8, blocks:[
      {b:'lead', html:'<strong>今天真正的重点。</strong>第一周练的是 sat / sit 两个，今天加进第三个。三组词都只差中间那一块红积木——<b>听不出来，就永远拼不对</b>。'},
      {b:'pair', pairs:[['pat','pet'],['pin','pen'],['man','men']], note:'man / men 里的 m 第五天才教，今天只用耳朵听，不用读'},
      {b:'note', tone:'warn', html:'分不出来<b>不是他笨</b>——中文里 /æ/、/ɪ/、/e/ 不区分意义，他的耳朵从来没被要求分辨过。把中间的元音夸张地拖长对比：p-<b>æææ</b>-t／p-<b>eee</b>-t，做上几十次就出来了。这个训练要每天做一点，做一整年。'}
    ]},
    {t:'收尾打卡', min:4, blocks:[
      {b:'checks', items:[
        ['无图读出 <span class="en"><b>set</b></span> 和 <span class="en"><b>ten</b></span>','逐个音合起来'],
        ['你念 pat 或 pet，他能指对是哪个','10 次里对 7 次就算过'],
        ['看到 e 能说出 /e/','短，不滑向「诶」']
      ]}
    ]}
  ]
},
{
  n:3, wd:'第三天', title:'哈气的 h', sounds:['h'],
  goal:'认识 /h/，并且发现换掉第一块积木就能造出一串新词',
  steps:[
    {t:'快闪复习', min:3, blocks:[
      {b:'flash', items:[{k:'s'},{k:'a'},{k:'t'},{k:'i'},{k:'p'},{k:'n'},{k:'c'},{k:'e'},{k:'w',v:'sat'},{k:'w',v:'sit'},{k:'w',v:'set'}]}
    ]},
    {t:'新声音 /h/', min:7, blocks:[
      {b:'sound', s:'h'},
      {b:'lead', html:'<strong>认字形：</strong>h 是一根高竖棍，右边挂一个小拱门。空中写 5 遍，本子上写 5 个。'}
    ]},
    {t:'拼读练习', min:9, blocks:[
      {b:'blend', words:['hat','hen','hit','hip']},
      {b:'words', items:['hat','hen','hit','hip']}
    ]},
    {t:'同一家人', min:7, blocks:[
      {b:'lead', html:'固定后面两块积木，只换第一块。<b>让孩子点一块头积木，先自己读，再听页面核对</b>。'},
      {b:'wordforge', mode:'family', families:[
        {tail:'at', heads:['c','h','p','s']},
        {tail:'it', heads:['h','k','s']}
      ]},
      {b:'note', tone:'bulb', html:'这是孩子第一次看见<b>「词族」</b>：屁股一样，只换头。发现这一点之后他读新词会快很多——因为不再是一个一个音硬拼，而是认出了熟悉的半截。'}
    ]},
    {t:'收尾打卡', min:4, blocks:[
      {b:'checks', items:[
        ['独立读出 3 个 h 开头的词',''],
        ['/h/ 后面没有多余的元音尾巴','对手心哈气检查'],
        ['能换掉第一块积木重新读出来','hat → cat → pat']
      ]}
    ]}
  ]
},
{
  n:4, wd:'第四天', title:'会拐弯的 r', sounds:['r'],
  goal:'认识英语的 /r/，并第一次拼出四个音的词',
  steps:[
    {t:'快闪复习', min:3, blocks:[
      {b:'flash', items:[{k:'s'},{k:'a'},{k:'t'},{k:'i'},{k:'p'},{k:'n'},{k:'c'},{k:'e'},{k:'h'},{k:'w',v:'hat'},{k:'w',v:'hen'},{k:'w',v:'ten'},{k:'w',v:'cap'},{k:'w',v:'hip'}]}
    ]},
    {t:'新声音 /r/', min:7, blocks:[
      {b:'sound', s:'r'},
      {b:'lead', html:'<strong>认字形：</strong>r 是一根竖棍，肩膀上伸出一个小钩。空中写 5 遍，本子上写 5 个。'}
    ]},
    {t:'拼读 + 挑战', min:9, blocks:[
      {b:'lead', html:'先拼三个音的，最后一个 <span class="en"><b>rest</b></span> 是<b>四个音</b>——本周第一个，也是今天最有成就感的地方。'},
      {b:'blend', words:['rat','ran','rip','rest']},
      {b:'words', items:['rat','ran','rip','rest']},
      {b:'note', tone:'warn', html:'拼 <span class="en"><b>rest</b></span> 卡住时，<b>先拼前面三个音 r-e-s，读出来，再在后面补一个 /t/</b>。四个音的词都这样拆：先拼三个，再补一个。这和第一周 snap 的「从后往前接」正好相反——因为这次的难点在结尾，不在开头。'}
    ]},
    {t:'换头造词', min:7, blocks:[
      {b:'lead', html:'每组固定后面两块积木，前面放两个不同的“头”。<b>让孩子轮流点两个头，听一听只换第一个音时，单词怎么变</b>。'},
      {b:'wordforge', mode:'swap', pairs:[
        ['hat','rat'],['hip','rip'],['can','ran']
      ]},
      {b:'note', tone:'ok', html:'读的时候注意看：换成 /r/ 之后，孩子的舌尖有没有碰到上牙后面？碰到了就是发成 /d/ 或者中文「日」了，提醒他<b>舌尖悬空</b>就好。'}
    ]},
    {t:'收尾打卡', min:4, blocks:[
      {b:'checks', items:[
        ['完成并读出 3 组换头词',''],
        ['拼出了四个音的 <span class="en"><b>rest</b></span>','先三个，再补一个'],
        ['发 /r/ 时舌尖没有碰到任何地方','不是弹舌，也不是「日」']
      ]}
    ]}
  ]
},
{
  n:5, wd:'第五天', title:'闭嘴哼鸣 m', sounds:['m'],
  goal:'认识 /m/，并在同样的辅音里快速切换三块红积木',
  steps:[
    {t:'快闪复习', min:3, blocks:[
      {b:'flash', items:[{k:'s'},{k:'a'},{k:'t'},{k:'i'},{k:'p'},{k:'n'},{k:'c'},{k:'e'},{k:'h'},{k:'r'},{k:'w',v:'rat'},{k:'w',v:'rip'},{k:'w',v:'hen'},{k:'w',v:'set'},{k:'w',v:'can'},{k:'w',v:'hit'}]}
    ]},
    {t:'新声音 /m/', min:7, blocks:[
      {b:'sound', s:'m'},
      {b:'note', tone:'bulb', html:'<b>又一个值得让孩子自己发现的秘密：</b>/m/ 和 /n/ 都是从鼻子出声的，区别只在于 /m/ 的嘴唇闭着、/n/ 的嘴唇张开。让他捏着鼻子交替念 m-n-m-n 感受一下。第一周他发现过 /t/ 和 /n/ 的关系，这是第二次——<b>这种「原来是这样」的时刻，比背十个单词有用</b>。'},
      {b:'lead', html:'<strong>认字形：</strong>m 是两个连着的小拱门，比 n 多一个。空中写 5 遍，本子上写 5 个。'}
    ]},
    {t:'拼读丰收', min:9, blocks:[
      {b:'lead', html:'今天一口气能拼很多词。<b>让孩子自己数数今天读出了几个</b>——数字带来的成就感比夸奖实在。'},
      {b:'blend', words:['mat','man','map','met','men','ham','him','rim']},
      {b:'words', items:['mat','man','map','met','men','ham','him','rim']},
      {b:'note', tone:'warn', html:'<span class="en"><b>man</b></span> 和 <span class="en"><b>men</b></span> 只差中间一块红积木，正好接上第二天的听辨训练。让他连着读三遍 man-men-man，自己听差别。'}
    ]},
    {t:'一分钟裸读', min:7, blocks:[
      {b:'lead', html:'<strong>裸读就是不看图、不给提示，只有字母。</strong>点「开始计时」，能读几个读几个，读错不停、跳过继续。<b>成绩会存下来，以后还能再挑战。</b>'},
      {b:'flash', items:[{k:'w',v:'cat'},{k:'w',v:'set'},{k:'w',v:'hat'},{k:'w',v:'rat'},{k:'w',v:'mat'},{k:'w',v:'men'},{k:'w',v:'him'},{k:'w',v:'rip'},{k:'w',v:'ten'},{k:'w',v:'map'},{k:'w',v:'hen'},{k:'w',v:'can'}], timed:true, recKey:'flash_words'}
    ]},
    {t:'收尾打卡', min:4, blocks:[
      {b:'checks', items:[
        ['一分钟裸读至少读对 5 个','错的跳过就好，不要停下来纠正'],
        ['能听出并读出 <span class="en"><b>man</b></span> 和 <span class="en"><b>men</b></span>','中间的红积木不一样'],
        ['发 /m/ 时双唇闭合、鼻翼振动','捏鼻子测试通过']
      ]}
    ]}
  ]
},
{
  n:6, wd:'第六天', title:'第二本书', sounds:['d'],
  goal:'认识 /d/，并用两周学过的声音独立读完《Dan and the Cat》',
  steps:[
    {t:'快闪复习', min:3, blocks:[
      {b:'flash', items:[{k:'s'},{k:'a'},{k:'t'},{k:'i'},{k:'p'},{k:'n'},{k:'c'},{k:'k'},{k:'e'},{k:'h'},{k:'r'},{k:'m'}]}
    ]},
    {t:'新声音 /d/', min:6, blocks:[
      {b:'sound', s:'d'},
      {b:'note', tone:'bulb', html:'<b>/d/ 和 /t/ 是一对双胞胎。</b>舌头位置一模一样，唯一的区别是发 /d/ 时喉咙振动、发 /t/ 时不振动。让孩子摸着喉咙来回切换 t-d-t-d——<b>靠手感分辨，比靠耳朵容易得多</b>。'},
      {b:'lead', html:'<strong>认字形：</strong>d 是一个圆圈右边加一根竖棍。先不提 b，免得混。空中写 5 遍，本子上写 5 个。'}
    ]},
    {t:'拼读练习', min:7, blocks:[
      {b:'blend', words:['dad','did','dip','dim','den','sad','mad','red','sand']},
      {b:'words', items:['dad','did','dip','dim','den','sad','mad','red','sand']},
      {b:'note', tone:'warn', html:'<span class="en"><b>sand</b></span> 又是一个四个音的词，而且难点还在结尾。用第四天 rest 的老办法：<b>先拼 s-a-n，读出来，再补一个 /d/</b>。'}
    ]},
    {t:'十三个音，计时快闪', min:2, blocks:[
      {b:'lead', html:'两周十三个字母音过一遍，<b>计时</b>。记下秒数——只跟自己比，不跟别人比。'},
      {b:'flash', items:[{k:'s'},{k:'a'},{k:'t'},{k:'i'},{k:'p'},{k:'n'},{k:'c'},{k:'k'},{k:'e'},{k:'h'},{k:'r'},{k:'m'},{k:'d'}], timed:true, recKey:'flash_sounds'}
    ]},
    {t:'两个认读词', min:3, blocks:[
      {b:'lead', html:'又来两个不遵守拼读规则的词，得像认汉字一样直接记住。<strong>还是那个类比：</strong>「就像『的』字，你不用拆开也认识它。」'},
      {b:'sight', items:[['the','这个 / 那个'],['is','是']]},
      {b:'note', tone:'bulb', html:'加上第一周的 <span class="en">I / a / see</span>，现在一共五个认读词。<b>一周只加两三个，不要贪多。</b>有了这两个，今天的小书就能读完整了。'}
    ]},
    {t:'读《Dan and the Cat》', min:7, blocks:[
      {b:'lead', html:'<strong>三遍法，一遍都不能少：</strong>'},
      {b:'list', items:[
        '<b>第一遍</b> — 你指着词读，孩子跟着念。速度放慢。',
        '<b>第二遍</b> — 孩子自己指、自己读，卡住的词你只提示第一个音，不要直接说答案。',
        '<b>第三遍</b> — 孩子独立读，你在旁边录像。这一遍不要打断，读错也不纠。'
      ]},
      {b:'note', tone:'bulb', html:'开读前再提醒一次：句子开头和名字用了<b>大写字母</b>——<span class="en"><b>D</b></span> 和 <span class="en">d</span>、<span class="en"><b>T</b></span> 和 <span class="en">t</span>、<span class="en"><b>A</b></span> 和 <span class="en">a</span> 是同一块积木，只是穿了大外套，<b>读音完全一样</b>。'},
      {b:'book'},
      {b:'note', tone:'bulb', html:'这本书里能拼的词，全部只用两周学过的十三个音；<span class="en">the / is</span> 是刚记住的认读词，<span class="en">A</span> 是第一周的。<b>又是一本没有一个字靠猜的书。</b>'}
    ]},
    {t:'庆祝与打卡', min:2, blocks:[
      {b:'note', tone:'star', html:'<b>第二本书，同样要办成一件事。</b>点小书下方的「打印小书」按钮打出来，最后一页是签名页，让孩子填日期、签名，和第一本放在一起。'},
      {b:'checks', items:[
        ['独立读完了整本《Dan and the Cat》','六页，第三遍尽量不中断'],
        ['能说出 /d/ 和 /t/ 的不同','摸着喉咙，一个振动一个不振动'],
        ['庆祝仪式做了','这一条不许跳过']
      ]}
    ]}
  ]
},
{
  n:7, wd:'第七天', title:'玩一天 + 周检', sounds:[], rest:true,
  goal:'今天不上课。四个游戏任选，外加一次 5 分钟的周检',
  steps:[
    {t:'今天不上课', min:0, blocks:[
      {b:'note', tone:'ok', html:'<b>休息日是方案的一部分，不是偷懒。</b>连着六天之后大脑需要一天来固化，而且要让孩子知道：这件事有始有终，不是没完没了。下面四个游戏任选，不要求全部做完。'}
    ]},
    {t:'游戏一：声音抓抓乐', min:10, blocks:[
      {b:'lead', html:'电脑念词，孩子听到规则说的那个音就拍气球。两轮主题不同，<b>先跟孩子说清楚口令再开始</b>。'},
      {b:'g1'},
      {b:'note', tone:'warn', html:'拍错很正常，<b>不需要你评判对错</b>——气球晃一下就过去了，游戏自己会记分。你在旁边陪着说说口令就好。'}
    ]},
    {t:'游戏二：造词工坊', min:12, blocks:[
      {b:'lead', html:'点积木拼词，摆满自动看看是不是真词——<b>猜的词也要读出来</b>，这叫解码训练，跟拼对一样有价值。拼出真词后长按确认：是他自己读出来的吗？'},
      {b:'g5'},
      {b:'note', tone:'ok', html:'这个游戏要做完今天最后的「周检」才会打开——先看看这一周到底学会了没有，再决定往下走。真词和瞎拼的组合，屏幕提示是一模一样的「读读看」，不直接告诉他对错，让他自己去读、自己判断。'}
    ]},
    {t:'游戏三：点单游戏', min:10, blocks:[
      {b:'lead', html:'孩子自己选一张「订单」（或点「随机来一单」），听电脑读词，再从积木架上把这个词拼出来。<b>拼对了长按确认——是他自己指读出来的吗？</b>'},
      {b:'g4'},
      {b:'note', tone:'bulb', html:'摆词是「听音找字」——同一套积木的反向玩法，也是以后<b>自己写单词</b>的地基。摆错没关系，积木会晃一下让他重摆；同一个词错两次，屏幕会提示第一个字母帮他起个头。'}
    ]},
    {t:'游戏四：声音寻宝', min:10, blocks:[
      {b:'lead', html:'在家里找东西，找到开头是这些音的就大喊出来。限时 10 分钟，看能找到几样。'},
      {b:'table', head:['要找的音','家里可能有的'], rows:[
        ['<b class="en">/k/</b>','cup 杯子 · car 汽车 · key 钥匙 · comb 梳子'],
        ['<b class="en">/h/</b>','hand 手 · hair 头发 · house 房子 · honey 蜂蜜'],
        ['<b class="en">/r/</b>','rice 米饭 · ruler 尺子 · ring 戒指 · rug 地毯'],
        ['<b class="en">/m/</b>','milk 牛奶 · mirror 镜子 · mop 拖把 · money 钱'],
        ['<b class="en">/d/</b>','door 门 · desk 书桌 · dish 盘子 · doll 娃娃']
      ]},
      {b:'note', tone:'bulb', html:'有两个陷阱可能会被找来：<span class="en">chair</span>（ch 一起发另一个音，不是 /k/）和 <span class="en">city</span>（c 在 i 前面会发 /s/）。孩子拿来了就说「这个字母今天在偷懒，我们以后再讲」，不用展开。'}
    ]},
    {t:'周检 · 5 分钟', min:5, blocks:[
      {b:'exam'},
      {b:'checks', items:[
        ['做了周检，记下了读对几个','这一条是给你自己的，不做就没有尺子'],
        ['已经决定下周怎么走','进新课 / 先复习两天 / 整周重做']
      ]}
    ]}
  ]
}
];
