/* 第 3 周数据层（由 Claude 按 docs/第三周数据层交接_20260901_v1.0.md 契约撰写，2026-09-02）。
   写法照 week02-data.js；教学内容按 docs/声音积木六年课程方案_20260902_v1.3.md §5.3 第 3 周行。
   校验：node tools/week-checks/check_data.js tools/week-checks/week03-data.js
   G5 积木架采用"分组固定位架"（用户 2026-09-02 拍板）：rackG5 字符串按教学顺序累计，
   渲染时按元音 / 辅音分组、位置只追加不挪动（引擎里程碑 0，装配前实现）。 */

/* ==================================================================
   META
   ================================================================== */
const META = {
  week: 3,
  storageKey: 'soundblocks-w3-v1',
  rackG4: 'aouhmdglfb',                 // G4 点单积木架：八张订单词的字母并集，每字母 1 块（10 块），按教学顺序排（分组渲染后位置跨周不挪）
  rackG5: 'satipnckehrmdgoulfb',        // G5 造词积木架：三周全部 19 个字母，每字母 1 块；渲染按元音 / 辅音分组
  wallLetters: 'goulfb',                // 首页积木点亮墙显示本周新字母
  flashCapacity: { flash_words:12, flash_sounds:19 },   // 计时闪卡成绩上限 = 本周计时闪卡实际条数（第五天 12 词、第六天 19 音）
};


/* 周检保留词：本周任何练习、游戏、小书、文案里都不出现；全 CVC，只用已教字母。 */
const RESERVED = ['gut','bud','fin','lob','fib'];


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

  /* ---- 第二周七个音 ---- */
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
     demo:[['dad','爸爸'],['den','兽穴'],['red','红色']]},

  /* ---- 第三周六个新音 ---- */
  g:{L:'g', ipa:'/g/', type:'c', art:'gulp', mem:'咕咚咕咚大口喝水 g-g-g',
     cue:'舌头后面轻轻堵住，喉咙一起振动，再突然放开，像大口喝水时喉咙里的声音：<span class="en">g、g、g</span>。',
     challenge:'喉咙开关', try:'一只手摸着喉咙，交替发 /k/、/g/、/k/、/g/，舌头位置不变，只看喉咙有没有振动。',
     pass:'发 /g/ 时喉咙振动，发 /k/ 时不振动，而且两个音的舌头位置完全一样。',
     how:'舌头后部抬起顶住软腭，短暂挡住气流后放开，同时声带振动。它和 /k/ 是一对清浊双胞胎，就像 /d/ 和 /t/。',
     warn:'不要念成中文「哥」——那多了一个元音尾巴。在词尾（dog、bag）尤其要收干净：舌头放开就停，不要补「哥」。',
     demo:[['goat','山羊'],['gum','口香糖'],['bag','袋子']]},
  o:{L:'o', ipa:'/ɑ/', type:'v', art:'doctor', mem:'看医生张大嘴 o-o-o',
     cue:'像给医生看喉咙那样，嘴巴张得大大的、圆圆的，短短地发：<span class="en">o、o、o</span>。',
     challenge:'四块红积木', try:'对着镜子依次说 /æ/、/e/、/ɪ/、/ɑ/，每次一个短音，看嘴巴哪一次张得最大。',
     pass:'/ɑ/ 是四个里嘴张得最大的，声音短，不往「喔」或「奥」滑。',
     how:'下巴充分打开，舌头放低放后，嘴唇不用圆。这是美式发音里的 /ɑ/，和「啊」接近但更靠后、更短。',
     warn:'不要发成中文「喔」——那是嘴唇圆起来的另一个音。也不要拖长。让孩子摸着下巴感受「张得最大」。',
     demo:[['octopus','章鱼'],['dog','狗'],['hot','热的']]},
  u:{L:'u', ipa:'/ʌ/', type:'v', art:'umbrella', mem:'伞打不开急得直哼 u-u-u',
     cue:'嘴巴放松、微微张开，喉咙轻轻发力，短短地哼一声：<span class="en">u、u、u</span>，像使劲时的「呃」。',
     challenge:'松口试验', try:'先说一个用力的中文「乌」，感受嘴唇收圆；再把嘴唇完全放松、微张，只发一下短短的 /ʌ/。',
     pass:'嘴唇不圆、不用力，声音短，听起来像轻轻的「呃」，不是「乌」。',
     how:'舌头居中偏后，嘴微开，嘴唇完全放松。它是英语里最「懒」的元音，不需要任何嘴形。',
     warn:'最常见的错是发成「乌」（嘴唇圆了）或「啊」（嘴张太大）。让孩子把嘴放松到几乎不动，再发。',
     demo:[['umbrella','雨伞'],['sun','太阳'],['cup','杯子']]},
  l:{L:'l', ipa:'/l/', type:'c', art:'lollipop', mem:'舔棒棒糖 llllll',
     cue:'舌尖轻轻贴在上牙后面，声音从舌头两边流出来，可以拖长：<span class="en">llllll</span>，像在舔棒棒糖。',
     challenge:'舌尖贴住', try:'拖长 /l/ 的时候，让孩子用手指轻轻碰一下自己的舌尖——它应该一直贴在上牙后面。',
     pass:'舌尖贴在上牙后面不动，声音能拖长，喉咙振动。',
     how:'舌尖抵住上齿龈，舌头两侧留出通道让气流和声音通过，声带振动。和 /n/ 的位置一样，区别是气从舌头两边走，不走鼻子。',
     warn:'不要念成中文「了」（多了元音尾巴），也不要和 /r/ 混：/l/ 舌尖<b>贴住</b>，/r/ 舌尖<b>悬空</b>。词尾的 l 让孩子把舌尖真正顶上去再停。',
     demo:[['lollipop','棒棒糖'],['leg','腿'],['lip','嘴唇']]},
  f:{L:'f', ipa:'/f/', type:'c', art:'candle', mem:'轻轻吹蜡烛 fffff',
     cue:'上牙轻轻搭在下嘴唇上，气从缝里漏出来，可以一直拖长：<span class="en">fffff</span>，像轻轻吹蜡烛。',
     challenge:'咬住下唇', try:'让孩子先把上牙搭在下嘴唇上不动，再送气；一只手放在嘴前感受风。',
     pass:'嘴前有持续的风，喉咙不振动，上牙一直搭在下唇上，声音能拖长。',
     how:'上齿轻触下唇，气流从齿唇之间摩擦通过；清音，声带不振动。中文「f」（如「发」）的起始动作是一样的。',
     warn:'中文里有这个音，问题只在收尾：不要变成「夫」。词尾的 f（golf）要把气送完就停，不补元音。',
     demo:[['fan','风扇'],['fish','鱼'],['leaf','叶子']]},
  b:{L:'b', ipa:'/b/', type:'c', art:'ball', mem:'皮球弹起来 b-b-b',
     cue:'双唇先关紧，喉咙一起振动，再突然弹开：<span class="en">b、b、b</span>，像皮球一下一下弹起来。',
     challenge:'喉咙开关', try:'一只手摸着喉咙，交替发 /p/、/b/、/p/、/b/，嘴唇动作一样，只看喉咙有没有振动。',
     pass:'发 /b/ 时喉咙振动，发 /p/ 时不振动，而且两个音的嘴唇动作完全一样。',
     how:'双唇闭合挡住气流后放开，同时声带振动。和 /p/ 是一对清浊双胞胎，就像 /d/ 与 /t/、/g/ 与 /k/。',
     warn:'不要念成中文「波」。字形上 b 和 d 最容易认混：<b>b 的肚子在右边，d 的肚子在左边</b>。今天单独教 b，让孩子用手比一比「b 像朝右挺着的肚子」。',
     demo:[['ball','球'],['bed','床'],['bus','公共汽车']]}
};

SOUNDS.k = Object.assign({}, SOUNDS.c, { L:'k' });


const W = {
  /* ---- 第一、二周已学词：快闪复习、G3 词对、G5 造词工坊、wordforge 会用到。 ---- */
  at:{zh:'在',art:null},      it:{zh:'它',art:null},      an:{zh:'一个',art:null},   in:{zh:'在里面',art:null},
  sat:{zh:'坐下了',art:'natSit'}, sit:{zh:'坐',art:'natSit'}, pat:{zh:'轻轻拍',art:'natPat'}, pit:{zh:'坑',art:null},
  pin:{zh:'大头针',art:null}, pan:{zh:'平底锅',art:null}, nap:{zh:'打个盹',art:null}, tap:{zh:'水龙头',art:null},
  tip:{zh:'小费',art:null},   sip:{zh:'小口喝',art:null}, tin:{zh:'铁罐头',art:null}, nip:{zh:'轻轻咬一口',art:null},
  snap:{zh:'打响指',art:null},spin:{zh:'转圈圈',art:null},
  cat:{zh:'猫',art:'cat'},    cap:{zh:'鸭舌帽',art:'cap'}, can:{zh:'罐头',art:'can'},  kit:{zh:'工具包',art:'kit'},
  set:{zh:'一套',art:'set'},  ten:{zh:'十',art:'ten'},     net:{zh:'网',art:'net'},    pen:{zh:'钢笔',art:'pen'},
  pet:{zh:'宠物',art:'pet'},  hat:{zh:'帽子',art:'hat'},   hen:{zh:'母鸡',art:'hen'},  hit:{zh:'敲一下',art:'hit'},
  hip:{zh:'胯',art:'hip'},    rat:{zh:'老鼠',art:'rat'},   ran:{zh:'跑了',art:'ran'},  rip:{zh:'撕开',art:'rip'},
  rim:{zh:'边缘',art:'rim'},  rest:{zh:'休息',art:'rest'}, mat:{zh:'垫子',art:'mat'},  man:{zh:'男人',art:'man'},
  map:{zh:'地图',art:'map'},  met:{zh:'遇见了',art:'met'}, men:{zh:'男人们',art:'men'},ham:{zh:'火腿',art:'ham'},
  him:{zh:'他',art:null},     dad:{zh:'爸爸',art:'dad'},   did:{zh:'做了',art:null},   dip:{zh:'蘸一下',art:'dip'},
  dim:{zh:'昏暗',art:'dim'},  den:{zh:'兽穴',art:'den'},   sad:{zh:'难过',art:'sad'},  mad:{zh:'生气',art:'mad'},
  red:{zh:'红色',art:'red'},  sand:{zh:'沙子',art:'sand'},

  /* ---- 第三周教学词（37，上词卡墙）。art 键 = 词本身，与插画提示词文件名一一对应；
         抽象词 art 显式为 null，页面按 hasIll 降级成"单词 + 中文"。 ---- */
  get:{zh:'拿到',art:'get'},   gap:{zh:'缺口',art:'gap'},   pig:{zh:'猪',art:'pig'},     dig:{zh:'挖',art:'dig'},     peg:{zh:'衣夹',art:'peg'},
  dog:{zh:'狗',art:'dog'},     hot:{zh:'热的',art:'hot'},   pot:{zh:'锅',art:'pot'},     top:{zh:'陀螺',art:'top'},   mop:{zh:'拖把',art:'mop'},   cot:{zh:'小床',art:'cot'},
  cup:{zh:'杯子',art:'cup'},   sun:{zh:'太阳',art:'sun'},   mud:{zh:'泥巴',art:'mud'},   hug:{zh:'抱一抱',art:'hug'}, run:{zh:'跑',art:'run'},     nut:{zh:'坚果',art:'nut'},
  leg:{zh:'腿',art:'leg'},     lip:{zh:'嘴唇',art:'lip'},   log:{zh:'木头',art:'log'},   lap:{zh:'大腿上',art:'lap'}, let:{zh:'让',art:null},      lid:{zh:'盖子',art:'lid'},
  fan:{zh:'风扇',art:'fan'},   fun:{zh:'好玩',art:'fun'},   fog:{zh:'雾',art:'fog'},     fig:{zh:'无花果',art:'fig'}, fit:{zh:'合身',art:'fit'},   frog:{zh:'青蛙',art:'frog'}, flag:{zh:'旗子',art:'flag'},
  bag:{zh:'袋子',art:'bag'},   bed:{zh:'床',art:'bed'},     bug:{zh:'小虫',art:'bug'},   big:{zh:'大的',art:'big'},   bus:{zh:'公共汽车',art:'bus'}, tub:{zh:'浴缸',art:'tub'}, golf:{zh:'高尔夫',art:'golf'},

  /* ---- 只在换头造词、小书、白名单里出现的词（不上词卡墙） ---- */
  got:{zh:'拿到了',art:null},  dot:{zh:'点',art:null},      not:{zh:'不',art:null},      hut:{zh:'小屋',art:null},    cut:{zh:'切',art:null},
  hog:{zh:'肥猪',art:null},    mug:{zh:'马克杯',art:null},  rug:{zh:'地毯',art:null},    dug:{zh:'挖了',art:null},    rag:{zh:'抹布',art:null},
  tag:{zh:'标签',art:null},    lot:{zh:'很多',art:null},    fed:{zh:'喂了',art:null},    gum:{zh:'口香糖',art:null},  bun:{zh:'小圆面包',art:null},
  bin:{zh:'垃圾桶',art:null},  bit:{zh:'一点点',art:null},  but:{zh:'但是',art:null},    rub:{zh:'揉一揉',art:null},  cab:{zh:'出租车',art:null},
  hugs:{zh:'抱住',art:null},   on:{zh:'在……上',art:null},   up:{zh:'向上',art:null},     us:{zh:'我们',art:null},     and:{zh:'和',art:null},

  /* ---- 认读词：不能拼、要整体记 ---- */
  the:{zh:'这个 / 那个',art:null},  is:{zh:'是',art:null},  to:{zh:'到……去',art:null},

  /* ---- G1 声音抓抓乐干扰词：只听不读，不进词卡墙，无插画 ---- */
  fish:{zh:'鱼',art:null},  milk:{zh:'牛奶',art:null},  bat:{zh:'蝙蝠',art:null},  book:{zh:'书',art:null},

  /* ---- 周检保留词：本周任何练习、游戏、小书里都不出现，由 Guard.isReserved 兜底 ---- */
  gut:{zh:'肚子',art:null},  bud:{zh:'花苞',art:null},  fin:{zh:'鱼鳍',art:null},  lob:{zh:'高高抛起',art:null},  fib:{zh:'小谎话',art:null}
};


const WALL_HINT = {
  /* 第三周 36 个教学词全是可独立成义的实词，不需要词组提示，留空。 */
};


const BOOK = {
  title:'The Big Dog', zh:'《那只大狗》',
  pages:[
    {line:'The dog is big.',          art:'dogBig',  zh:'这只狗很大。'},
    {line:'The dog dug in the mud.',  art:'dogDug',  zh:'狗在泥巴里挖呀挖。'},
    {line:'Dan got a rag.',           art:'danRag',  zh:'丹拿来一块抹布。'},
    {line:'The dog ran to the log.',  art:'dogLog',  zh:'狗跑到木头那儿去了。'},
    {line:'The cat sat on the log.',  art:'catLog',  zh:'猫坐在木头上。'},
    {line:'Dan hugs the big dog.',    art:'danHug',  zh:'丹抱住了那只大狗。'}
  ]
};


const FIRST_TEACH_DAY = { g:1, o:2, u:3, l:4, f:5, b:6 };


const G1_ROUNDS = {
  g: { pos:['got','gum','gap','get'], neg:['sun','fish','cat','top'] },
  u: { pos:['cup','sun','mud','hug'], neg:['cat','dog','pen','sit'] }
};


const G1_THEME = {
  g: { title:'轮 A · 咕咚喝水', icon:'gulp', targetArt:'gap', cmd:'开头听到 g 就拍气球' },
  u: { title:'轮 B · 第五块红积木', icon:'umbrella', targetArt:'cup', cmd:'听到词的肚子里藏着 /ʌ/ 就拍气球' }
};


const G3_PAIRS = [['hot','hut'],['cot','cut'],['not','nut']];


const G4_WORDS = ['dog','log','fog','hug','bug','mug','gum','bag'];


const G5_WHITELIST = [
  /* 第一、二周累计 50 词 */
  'an','at','in','it','nap','nip','pan','pat','pin','pit','sat','sip','sit','snap','spin','tap','tin','tip',
  'cat','cap','can','kit','set','ten','net','pen','pet','hat','hen','hit','hip','rat','ran','rip','rim',
  'rest','mat','man','map','met','men','ham','him','dip','dim','den','sad','mad','red','sand',
  /* 第三周新增 46 词（无叠字母，全在 W 里，不含保留词） */
  'get','gap','pig','dig','peg','rag','tag','got','dot','not','lot',
  'dog','hot','pot','top','mop','cot','on',
  'cup','sun','mud','hug','run','nut','hut','cut','mug','rug','dug','gum','up','us',
  'leg','lip','log','lap','let','lid','hog',
  'fan','fun','fog','fig','fit','fed','frog','flag',
  'bag','bed','bug','big','bus','tub','bun','bin','bit','but','rub','cab','golf','and'
];


const DAYS = [
{
  n:1, wd:'第一天', title:'喉咙里的 g', sounds:['g'],
  goal:'认识 /g/，并且能靠喉咙振动分清 g 和 k',
  steps:[
    {t:'快闪复习', min:3, blocks:[
      {b:'lead', html:'第三周还是从快闪开始。<b>十三个音一张张过</b>，看到就说，不要想。后面三张是上周的词，无图直接读。'},
      {b:'flash', items:[{k:'s'},{k:'a'},{k:'t'},{k:'i'},{k:'p'},{k:'n'},{k:'c'},{k:'k'},{k:'e'},{k:'h'},{k:'r'},{k:'m'},{k:'d'},{k:'w',v:'cat'},{k:'w',v:'red'},{k:'w',v:'him'}]}
    ]},
    {t:'新声音 /g/', min:8, blocks:[
      {b:'sound', s:'g'},
      {b:'note', tone:'bulb', html:'<b>又一对双胞胎。</b>上周 /d/ 和 /t/ 舌头位置一样、只差喉咙振不振动；今天的 /g/ 和 /k/ 也是这样。让孩子摸着喉咙来回念 k-g-k-g，<b>靠手感分，比靠耳朵快</b>。'},
      {b:'lead', html:'<strong>认字形：</strong>g 是一个圆圈，右边一根竖棍往下伸，底下勾一个小尾巴。空中写 5 遍，本子上写 5 个，写的时候嘴里念 g-g-g。'}
    ]},
    {t:'拼读练习', min:9, blocks:[
      {b:'lead', html:'五个词，有的 g 在开头，有的在结尾。<b>还是那三步：①一个一个念　②越念越快　③合起来。</b>结尾的 g 要收干净，不要补「哥」。'},
      {b:'blend', words:['get','gap','pig','dig','peg']},
      {b:'words', items:['get','gap','pig','dig','peg']}
    ]},
    {t:'听音找首字母', min:6, blocks:[
      {b:'lead', html:'你随机说一个词，孩子指出它开头是 <span class="en">g</span> 还是 <span class="en">c</span>。分不清就让他摸着你的喉咙再听一遍——<b>这一步只观察，不纠正</b>。'},
      {b:'table', head:['你说这个词','孩子指哪张卡'], rows:[
        ['<b class="en">gap</b>　缺口','<b class="en">g</b>'],
        ['<b class="en">cap</b>　鸭舌帽','<b class="en">c</b>'],
        ['<b class="en">get</b>　拿到','<b class="en">g</b>'],
        ['<b class="en">cat</b>　猫','<b class="en">c</b>'],
        ['<b class="en">can</b>　罐头','<b class="en">c</b>']
      ]}
    ]},
    {t:'收尾打卡', min:4, blocks:[
      {b:'checks', items:[
        ['无图读出 <span class="en"><b>get</b></span> 和 <span class="en"><b>pig</b></span>','你写在纸上，他不看图片直接读'],
        ['摸着喉咙能说出 g 振动、k 不振动',''],
        ['词尾的 g 收得干净','dig、pig 结尾没有「哥」']
      ]}
    ]}
  ]
},
{
  n:2, wd:'第二天', title:'张大嘴的 o', sounds:['o'],
  goal:'认识短元音 /ɑ/，并第一次用它拼出一串新词',
  steps:[
    {t:'快闪复习', min:3, blocks:[
      {b:'flash', items:[{k:'s'},{k:'a'},{k:'t'},{k:'i'},{k:'p'},{k:'n'},{k:'c'},{k:'e'},{k:'h'},{k:'r'},{k:'m'},{k:'d'},{k:'g'},{k:'w',v:'get'},{k:'w',v:'pig'},{k:'w',v:'gap'}]}
    ]},
    {t:'新声音 /ɑ/', min:7, blocks:[
      {b:'sound', s:'o'},
      {b:'lead', html:'<strong>认字形：</strong>o 就是一个圆圈，最简单的一块积木。空中写 5 遍，本子上写 5 个。'},
      {b:'note', tone:'bulb', html:'<b>红积木现在有四块了。</b>把 <span class="en"><span class="v">a</span></span>、<span class="en"><span class="v">e</span></span>、<span class="en"><span class="v">i</span></span>、<span class="en"><span class="v">o</span></span> 摆在一起，让孩子挨个发一遍，看看哪一个嘴张得最大——是今天这块。'}
    ]},
    {t:'拼读练习', min:9, blocks:[
      {b:'lead', html:'今天一口气能拼六个词，因为一块新的红积木能和所有旧的青积木搭。<b>让孩子自己数今天读出了几个。</b>'},
      {b:'blend', words:['dog','hot','pot','top','mop','cot']},
      {b:'words', items:['dog','hot','pot','top','mop','cot']}
    ]},
    {t:'换头造词', min:7, blocks:[
      {b:'lead', html:'固定后面两块积木 <span class="en">o-t</span>，只换第一块。<b>让孩子点一块头积木，先自己读，再听页面核对</b>。'},
      {b:'wordforge', mode:'family', families:[
        {tail:'ot', heads:['h','p','c','g','d','n']}
      ]},
      {b:'note', tone:'bulb', html:'上周他见过一次「词族」，今天是同一件事：<b>屁股一样，只换头</b>。六个词里有几个他自己就能读出来，不用你教。'}
    ]},
    {t:'收尾打卡', min:4, blocks:[
      {b:'checks', items:[
        ['无图读出 <span class="en"><b>dog</b></span> 和 <span class="en"><b>hot</b></span>','逐个音合起来'],
        ['看到 o 能说出 /ɑ/','嘴张大，短，不滑向「喔」'],
        ['换头造词至少自己读出 4 个','不看页面提示']
      ]}
    ]}
  ]
},
{
  n:3, wd:'第三天', title:'放松的 u', sounds:['u'],
  goal:'认识短元音 /ʌ/，并能在 o 和 u 之间听出区别',
  steps:[
    {t:'快闪复习', min:3, blocks:[
      {b:'flash', items:[{k:'s'},{k:'a'},{k:'t'},{k:'i'},{k:'p'},{k:'n'},{k:'c'},{k:'e'},{k:'h'},{k:'r'},{k:'m'},{k:'d'},{k:'g'},{k:'o'},{k:'w',v:'dog'},{k:'w',v:'hot'},{k:'w',v:'top'}]}
    ]},
    {t:'新声音 /ʌ/', min:7, blocks:[
      {b:'sound', s:'u'},
      {b:'lead', html:'<strong>认字形：</strong>u 像一个小杯子，开口朝上。空中写 5 遍，本子上写 5 个。'},
      {b:'note', tone:'bulb', html:'<b>五块红积木到齐了。</b>a、e、i、o、u——以后每个词里都得有它们中的至少一块。让孩子把五张红卡排成一排，自己念一遍。'}
    ]},
    {t:'拼读练习', min:8, blocks:[
      {b:'blend', words:['cup','sun','mud','hug','run','nut']},
      {b:'words', items:['cup','sun','mud','hug','run','nut']}
    ]},
    {t:'关键训练：听出区别', min:8, blocks:[
      {b:'lead', html:'<strong>今天真正的重点。</strong>昨天的 /ɑ/ 和今天的 /ʌ/ 是中国孩子最容易混的一对——中文里没有一个词靠它们区分意思。三组词都只差中间那块红积木。'},
      {b:'pair', pairs:[['hot','hut'],['cot','cut'],['not','nut']], note:'嘴张最大的是 o，嘴放松几乎不动的是 u'},
      {b:'note', tone:'warn', html:'分不出来<b>不是他笨</b>。把中间的元音夸张地拖长对比：h-<b>ɑɑɑ</b>-t／h-<b>ʌʌʌ</b>-t，让他看你的嘴：一个张大、一个放松。做几十次就出来了，以后每天快闪都会碰到。'}
    ]},
    {t:'收尾打卡', min:4, blocks:[
      {b:'checks', items:[
        ['无图读出 <span class="en"><b>cup</b></span> 和 <span class="en"><b>sun</b></span>','逐个音合起来'],
        ['你念 hot 或 hut，他能指对是哪个','10 次里对 7 次就算过'],
        ['看到 u 能说出 /ʌ/','嘴放松，短，不是「乌」']
      ]}
    ]}
  ]
},
{
  n:4, wd:'第四天', title:'舔棒棒糖的 l', sounds:['l'],
  goal:'认识 /l/，并把它和 /r/ 分开',
  steps:[
    {t:'快闪复习', min:3, blocks:[
      {b:'flash', items:[{k:'s'},{k:'a'},{k:'t'},{k:'i'},{k:'p'},{k:'n'},{k:'c'},{k:'e'},{k:'h'},{k:'r'},{k:'m'},{k:'d'},{k:'g'},{k:'o'},{k:'u'},{k:'w',v:'cup'},{k:'w',v:'mud'},{k:'w',v:'hot'}]}
    ]},
    {t:'新声音 /l/', min:7, blocks:[
      {b:'sound', s:'l'},
      {b:'lead', html:'<strong>认字形：</strong>l 就是一根竖棍，比 i 高、没有点。空中写 5 遍，本子上写 5 个。'},
      {b:'note', tone:'warn', html:'<b>/l/ 和上周的 /r/ 是一对要专门分开的音。</b>口诀：<span class="en">l</span> 舌尖<b>贴住</b>上牙后面，<span class="en">r</span> 舌尖<b>悬空</b>。让孩子交替念 l-r-l-r，每次都说出舌尖在哪。'}
    ]},
    {t:'拼读练习', min:9, blocks:[
      {b:'blend', words:['leg','lip','log','lap','let','lid']},
      {b:'words', items:['leg','lip','log','lap','let','lid']}
    ]},
    {t:'同一家人', min:7, blocks:[
      {b:'lead', html:'两个词族，固定后面两块，只换头。<b>让孩子点一块头积木，先自己读，再听页面核对</b>。'},
      {b:'wordforge', mode:'family', families:[
        {tail:'og', heads:['d','l','h']},
        {tail:'ug', heads:['h','m','r','d']}
      ]},
      {b:'note', tone:'bulb', html:'<span class="en">hog</span>、<span class="en">mug</span>、<span class="en">rug</span> 是今天才第一次见的词，他能自己读出来，就说明拼读这把钥匙已经在手上了。'}
    ]},
    {t:'收尾打卡', min:4, blocks:[
      {b:'checks', items:[
        ['无图读出 <span class="en"><b>leg</b></span> 和 <span class="en"><b>log</b></span>',''],
        ['能说出 l 和 r 舌尖位置的不同','贴住 / 悬空'],
        ['换头造词里自己读出了一个没学过的词','hog、mug、rug 任一个']
      ]}
    ]}
  ]
},
{
  n:5, wd:'第五天', title:'吹蜡烛的 f', sounds:['f'],
  goal:'认识 /f/，并从后往前接出两个四音词',
  steps:[
    {t:'快闪复习', min:3, blocks:[
      {b:'flash', items:[{k:'s'},{k:'a'},{k:'t'},{k:'i'},{k:'p'},{k:'n'},{k:'c'},{k:'e'},{k:'h'},{k:'r'},{k:'m'},{k:'d'},{k:'g'},{k:'o'},{k:'u'},{k:'l'},{k:'w',v:'leg'},{k:'w',v:'sun'},{k:'w',v:'dog'}]}
    ]},
    {t:'新声音 /f/', min:7, blocks:[
      {b:'sound', s:'f'},
      {b:'lead', html:'<strong>认字形：</strong>f 是一根竖棍，头顶弯个钩，腰上加一横。空中写 5 遍，本子上写 5 个。'}
    ]},
    {t:'拼读 + 挑战', min:9, blocks:[
      {b:'lead', html:'先拼五个三音词，最后两个 <span class="en"><b>frog</b></span>、<span class="en"><b>flag</b></span> 是<b>四个音、难点在开头</b>——用第一周 snap 的老办法：先拼后面的 <span class="en">rog</span>、<span class="en">lag</span>，读出来，再在前面加一个 /f/。'},
      {b:'blend', words:['fan','fun','fog','fig','fit','frog','flag']},
      {b:'words', items:['fan','fun','fog','fig','fit','frog','flag']},
      {b:'note', tone:'warn', html:'别和上周 rest、sand 的拆法弄混：<b>难点在开头，从后往前接；难点在结尾，先拼三个再补一个。</b>frog 和 flag 是前者。'}
    ]},
    {t:'一分钟裸读', min:7, blocks:[
      {b:'lead', html:'<strong>裸读就是不看图、不给提示，只有字母。</strong>点「开始计时」，能读几个读几个，读错不停、跳过继续。<b>成绩会存下来，以后还能再挑战。</b>'},
      {b:'flash', items:[{k:'w',v:'dog'},{k:'w',v:'cup'},{k:'w',v:'leg'},{k:'w',v:'fan'},{k:'w',v:'hot'},{k:'w',v:'mud'},{k:'w',v:'pig'},{k:'w',v:'log'},{k:'w',v:'sun'},{k:'w',v:'fig'},{k:'w',v:'get'},{k:'w',v:'run'}], timed:true, recKey:'flash_words'}
    ]},
    {t:'收尾打卡', min:4, blocks:[
      {b:'checks', items:[
        ['一分钟裸读至少读对 6 个','错的跳过就好，不要停下来纠正'],
        ['拼出了 <span class="en"><b>frog</b></span> 或 <span class="en"><b>flag</b></span>','先拼后三个，再加 f'],
        ['发 /f/ 时上牙搭在下唇上、有风','手放嘴前能感觉到']
      ]}
    ]}
  ]
},
{
  n:6, wd:'第六天', title:'第三本书', sounds:['b'],
  goal:'认识 /b/，并用三周学过的十九个音独立读完《The Big Dog》',
  steps:[
    {t:'快闪复习', min:3, blocks:[
      {b:'flash', items:[{k:'s'},{k:'a'},{k:'t'},{k:'i'},{k:'p'},{k:'n'},{k:'c'},{k:'k'},{k:'e'},{k:'h'},{k:'r'},{k:'m'},{k:'d'},{k:'g'},{k:'o'},{k:'u'},{k:'l'},{k:'f'}]}
    ]},
    {t:'新声音 /b/', min:6, blocks:[
      {b:'sound', s:'b'},
      {b:'note', tone:'bulb', html:'<b>第三对双胞胎：/b/ 和 /p/。</b>嘴唇动作一模一样，只差喉咙振不振动。让孩子摸着喉咙念 p-b-p-b。到今天为止三对都齐了：t/d、k/g、p/b——<b>他可以自己总结这个规律</b>。'},
      {b:'lead', html:'<strong>认字形：</strong>b 是一根竖棍，肚子挺在<b>右边</b>；上周的 d 肚子在左边。让孩子伸出左手比一个 b、右手比一个 d，记住「b 朝右」。空中写 5 遍，本子上写 5 个。'}
    ]},
    {t:'拼读练习', min:7, blocks:[
      {b:'blend', words:['bag','bed','bug','big','bus','tub','golf']},
      {b:'words', items:['bag','bed','bug','big','bus','tub','golf']},
      {b:'note', tone:'warn', html:'<span class="en"><b>golf</b></span> 是四个音、难点在结尾：<b>先拼 g-o-l，读出来，再补一个 /f/</b>。和 rest、sand 一路。'}
    ]},
    {t:'十九个音，计时快闪', min:2, blocks:[
      {b:'lead', html:'三周十九个字母音过一遍，<b>计时</b>。记下秒数——只跟自己比。'},
      {b:'flash', items:[{k:'s'},{k:'a'},{k:'t'},{k:'i'},{k:'p'},{k:'n'},{k:'c'},{k:'k'},{k:'e'},{k:'h'},{k:'r'},{k:'m'},{k:'d'},{k:'g'},{k:'o'},{k:'u'},{k:'l'},{k:'f'},{k:'b'}], timed:true, recKey:'flash_sounds'}
    ]},
    {t:'一个认读词', min:3, blocks:[
      {b:'lead', html:'只加一个认读词。<span class="en">to</span> 按规则应该读 /tɑ/，但它偏不——<strong>还是那个类比：</strong>「就像『的』字，你不用拆开也认识它。」'},
      {b:'sight', items:[['to','到……去']]},
      {b:'note', tone:'bulb', html:'加上前两周的 <span class="en">I / a / see / the / is</span>，一共六个认读词。<b>这周的书里 on、in、and 都是能拼的，不算认读词</b>——让他自己拼出来。'}
    ]},
    {t:'读《The Big Dog》', min:7, blocks:[
      {b:'lead', html:'<strong>三遍法，一遍都不能少：</strong>'},
      {b:'list', items:[
        '<b>第一遍</b> — 你指着词读，孩子跟着念。速度放慢。',
        '<b>第二遍</b> — 孩子自己指、自己读，卡住的词你只提示第一个音，不要直接说答案。',
        '<b>第三遍</b> — 孩子独立读，你在旁边录像。这一遍不要打断，读错也不纠。'
      ]},
      {b:'note', tone:'bulb', html:'开读前再提醒一次：句子开头和名字用了<b>大写字母</b>——<span class="en"><b>T</b></span> 和 <span class="en">t</span>、<span class="en"><b>D</b></span> 和 <span class="en">d</span> 是同一块积木穿了大外套，<b>读音完全一样</b>。<span class="en"><b>hugs</b></span> 结尾的 s 读得像 /z/，让他先拼出 hug，再轻轻带上 s。'},
      {b:'book'},
      {b:'note', tone:'bulb', html:'这本书里能拼的词，全部只用三周学过的十九个音；<span class="en">to</span> 是今天刚记住的认读词，<span class="en">the / is / a</span> 是前两周的。<b>第三本没有一个字靠猜的书。</b>'}
    ]},
    {t:'庆祝与打卡', min:2, blocks:[
      {b:'note', tone:'star', html:'<b>第三本书。</b>点小书下方的「打印小书」打出来，签名页让孩子填日期、签名，和前两本放在一起——书架上已经有三本了。'},
      {b:'checks', items:[
        ['独立读完了整本《The Big Dog》','六页，第三遍尽量不中断'],
        ['能说出 b 和 d 字形的不同','b 肚子朝右，d 肚子朝左'],
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
      {b:'note', tone:'ok', html:'<b>休息日是方案的一部分，不是偷懒。</b>连着六天之后大脑需要一天来固化。下面四个游戏任选，不要求全部做完。'}
    ]},
    {t:'游戏一：声音抓抓乐', min:10, blocks:[
      {b:'lead', html:'电脑念词，孩子听到规则说的那个音就拍气球。两轮主题不同，<b>先跟孩子说清楚口令再开始</b>。'},
      {b:'g1'},
      {b:'note', tone:'warn', html:'拍错很正常，<b>不需要你评判对错</b>——气球晃一下就过去了，游戏自己会记分。'}
    ]},
    {t:'游戏二：造词工坊', min:12, blocks:[
      {b:'lead', html:'积木架这周变成了两排：<b>上面一排红的是元音，下面两排青的是辅音</b>，新学的字母排在最后。点积木拼词，摆满自动看看是不是真词——<b>猜的词也要读出来</b>。拼出真词后长按确认：是他自己读出来的吗？'},
      {b:'g5'},
      {b:'note', tone:'ok', html:'这个游戏要做完今天最后的「周检」才会打开。真词和瞎拼的组合，屏幕提示是一模一样的「读读看」，不直接告诉他对错，让他自己去读、自己判断。'}
    ]},
    {t:'游戏三：点单游戏', min:10, blocks:[
      {b:'lead', html:'孩子自己选一张「订单」（或点「随机来一单」），听电脑读词，再从积木架上把这个词拼出来。<b>拼对了长按确认——是他自己指读出来的吗？</b>'},
      {b:'g4'},
      {b:'note', tone:'bulb', html:'这周的订单全是 g 结尾或 g 开头的词，摆的时候注意听结尾那一下——摆错没关系，积木会晃一下让他重摆。'}
    ]},
    {t:'游戏四：声音寻宝', min:10, blocks:[
      {b:'lead', html:'在家里找东西，找到开头是这些音的就大喊出来。限时 10 分钟，看能找到几样。'},
      {b:'table', head:['要找的音','家里可能有的'], rows:[
        ['<b class="en">/g/</b>','glass 玻璃杯 · game 游戏 · glue 胶水 · gift 礼物'],
        ['<b class="en">/ɑ/</b>','box 盒子 · sock 袜子 · clock 钟 · doll 娃娃（肚子里藏着它）'],
        ['<b class="en">/ʌ/</b>','cup 杯子 · bus 公交车 · duck 鸭子 · brush 刷子（肚子里藏着它）'],
        ['<b class="en">/l/</b>','lamp 台灯 · lemon 柠檬 · lid 盖子 · leaf 叶子'],
        ['<b class="en">/f/</b>','fork 叉子 · fan 风扇 · fish 鱼 · foot 脚'],
        ['<b class="en">/b/</b>','ball 球 · book 书 · box 盒子 · bed 床']
      ]},
      {b:'note', tone:'bulb', html:'有个陷阱可能会被找来：<span class="en">phone</span>（听起来是 /f/，写出来却是 ph）。孩子拿来了就说「这个词的 f 穿了别的外套，以后再讲」，不用展开。'}
    ]},
    {t:'周检 · 5 分钟', min:5, blocks:[
      {b:'exam'},
      {b:'checks', items:[
        ['做了周检，记下了读对几个','这一条是给你自己的，不做就没有尺子'],
        ['已经决定下周怎么走','4 到 5 个进新课 / 2 到 3 个复习两天再测 / 0 到 1 个整周重做']
      ]}
    ]}
  ]
}
];
