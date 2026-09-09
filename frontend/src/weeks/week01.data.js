const META = {
  "week": 1,
  "storageKey": "soundblocks-w1-v1",
  "rackG4": "ssaattiippnn",
  "rackG5": "ssaattiippnn",
  "wallLetters": "satipn",
  "groupedRack": false,
  "consolidation": false,
  "assessmentMode": "weekly",
  "flashCapacity": {
    "flash_words": 16,
    "flash_sounds": 6
  }
};

const RESERVED = ['nit','sap','tan','pip','pit'];

const SOUNDS = {
  s:{grapheme:'s', ipa:'/s/', type:'c', art:'snake', mem:'蛇在吐信子 sssss',
     cue:'牙齿靠近，像小蛇一样轻轻漏气：<span class="en">ssssss</span>。看看谁坚持得更久。',
     challenge:'喉咙侦探', try:'一只手摸着喉咙，另一只手放在嘴前，再发一次长长的 /s/。',
     pass:'喉咙安静，嘴前有细细的风，而且声音可以一直拖长。',
     how:'上下牙靠近但不要咬紧；舌尖靠近上牙后方，不碰牙齿，让气流从舌头中央持续通过。',
     warn:'如果听见「斯」的尾巴，说明多带了一个元音。先把声音拖成长长的 /s/，再练习干净地停住。',
     demo:[['snake','蛇'],['sun','太阳'],['sock','袜子']]},
  a:{grapheme:'a', ipa:'/æ/', type:'v', art:'ant', mem:'蚂蚁爬上手臂 a-a-a',
     cue:'小蚂蚁爬上手臂啦！嘴巴张大、稍微扁一点，短短地说：<span class="en">a-a-a</span>。',
     challenge:'镜子挑战', try:'对着镜子先说中文「啊」，再把嘴角向两边展开一点，短短地发 /æ/。',
     pass:'嘴比说「啊」更扁，声音短，不滑向「爱」。',
     how:'下巴打开，嘴唇自然或略向两边展开；舌头放低并靠前。保持一个稳定的短元音，不要滑动。',
     warn:'中文里没有完全对应的音。不要用「啊」或「爱」替代；先夸张嘴形，再逐渐缩小动作。',
     demo:[['ant','蚂蚁'],['apple','苹果'],['cat','猫']]},
  t:{grapheme:'t', ipa:'/t/', type:'c', art:'tiger', mem:'小老虎轻轻踏步 t-t-t',
     cue:'舌尖轻点上牙后面，马上弹开。手指敲一下手心：<span class="en">t、t、t</span>。',
     challenge:'短音刹车', try:'每发一次 /t/ 就立刻闭嘴停住，再摸摸喉咙有没有振动。',
     pass:'声音一下就停，喉咙不振动，也听不到「特」的尾巴。',
     how:'舌尖或舌叶贴住上牙后方的小凸起，短暂挡住气流后迅速放开；这是一个清音。',
     warn:'不要加中文「特」里的元音尾巴。孩子只需要听到一次短促、干净的释放。',
     demo:[['ten','十'],['top','陀螺'],['tap','水龙头']]},
  i:{grapheme:'i', ipa:'/ɪ/', type:'v', art:'igloo', mem:'冰屋里冷得发抖 i-i-i',
     cue:'假装冰屋里有点冷，肩膀轻轻抖一下，嘴巴放松：<span class="en">i、i、i</span>。',
     challenge:'松紧对比', try:'先故意说一个紧紧、长长的「衣——」，再把嘴放松，只发一下短短的 /ɪ/。',
     pass:'第二个声音明显更短、更松，嘴角没有一直用力。',
     how:'嘴微微张开，舌头靠前但保持放松。重点不是把嘴拉成笑脸，而是短促、松弛。',
     warn:'不要用中文「衣」替代，也不要拖长。练习时一次只发一个短音。',
     demo:[['igloo','冰屋'],['in','在里面'],['sit','坐']]},
  p:{grapheme:'p', ipa:'/p/', type:'c', art:'popcorn', mem:'爆米花蹦出来 p-p-p',
     cue:'双唇先关紧，再像爆米花一样突然弹开：<span class="en">p、p、p</span>！',
     challenge:'纸片起飞', try:'把一小片轻纸放在嘴前约 3 厘米，每发一次 /p/，看纸片会不会跳一下。',
     pass:'纸片会动，喉咙不振动，而且爆开后没有「泼」的元音尾巴。',
     how:'双唇完全闭合，短暂挡住气流后迅速放开；舌头不用摆特殊位置，喉咙保持安静。',
     warn:'纸片实验只检查有没有爆破气流；是否发得干净，还要听后面有没有多出一个元音。',
     demo:[['pig','猪'],['pen','笔'],['pan','平底锅']]},
  n:{grapheme:'n', ipa:'/n/', type:'c', art:'nose', mem:'声音从鼻子出来 nnnnn',
     cue:'舌尖停在上牙后面，手指轻轻碰鼻梁，拖长：<span class="en">nnnnn</span>。',
     challenge:'鼻子开关', try:'先拖长 /n/，再轻轻捏住鼻子；松开、捏住，来回试两次。',
     pass:'鼻梁能感觉到振动，捏住鼻子后声音会明显改变或停住。',
     how:'舌尖贴住上牙后方，位置和 /t/ 接近；口腔通道被挡住，声音与气流主要从鼻腔通过。',
     warn:'不要念成「呢」。/n/ 可以持续，但停下时不要再补一个元音。',
     demo:[['nose','鼻子'],['net','网'],['nap','小睡']]}
};

const W = {
  at:{zh:'在',art:'at'},  it:{zh:'它',art:null},  an:{zh:'一个',art:'an'},  in:{zh:'在里面',art:'in'},
  sat:{zh:'坐下了',art:'natSit'},   sit:{zh:'坐',art:'natSit'},
  pat:{zh:'轻轻拍',art:'natPat'},      pit:{zh:'坑',art:'pit'},
  pin:{zh:'大头针',art:'pin'},        pan:{zh:'平底锅',art:'pan'},
  nap:{zh:'打个盹',art:'natNap'},   naps:{zh:'在打盹',art:'natNap'},
  tap:{zh:'水龙头',art:'tap'},      tip:{zh:'小费',art:'tip'},
  sip:{zh:'小口喝',art:'sip'},      tin:{zh:'铁罐头',art:'tin'},
  snap:{zh:'打响指',art:'snap'},
  nip:{zh:'轻轻咬一口',art:'nip'},   tan:{zh:'晒黑',art:'tan'},
  sap:{zh:'树汁',art:'sap'},         nit:{zh:'小虫卵',art:null},
  pip:{zh:'果核',art:'pip'},
  ten:{zh:'十',art:'ten'},          sun:{zh:'太阳',art:'sun'},
  sock:{zh:'袜子',art:'sock'},      apple:{zh:'苹果',art:'apple'},
  net:{zh:'网',art:'net'},          nose:{zh:'鼻子',art:'nose'},
  snake:{zh:'蛇',art:'snake'},      ant:{zh:'蚂蚁',art:'ant'},
  igloo:{zh:'冰屋',art:'igloo'},    pig:{zh:'猪',art:null},
  pen:{zh:'笔',art:null},           cat:{zh:'猫',art:'cat'},
  top:{zh:'陀螺',art:'spin'},       dog:{zh:'狗',art:'natStand'},
  /* G1 声音抓抓乐题库补充词（无插画资产，退化为词+中文，规格 §4.1） */
  bag:{zh:'包',art:null},           milk:{zh:'牛奶',art:null},
  fish:{zh:'鱼',art:null},          hat:{zh:'帽子',art:'hat'},
  map:{zh:'地图',art:'map'},        bat:{zh:'蝙蝠',art:'bat'},
  cup:{zh:'杯子',art:null},         book:{zh:'书',art:null},
  tree:{zh:'树',art:null}
};

const WALL_HINT = {
  at:{en:'at the door', zh:'在门边', say:true},
  an:{en:'an egg', zh:'一个鸡蛋', say:true},
  in:{en:'in the box', zh:'在盒子里', say:true}
};

const BOOK = {
  title:'Nat Naps', zh:'《纳特要睡觉》',
  pages:[
    {line:'I see Nat.',      art:'natStand', zh:'我看见纳特。'},
    {line:'"Sit, Nat!"',     art:'natCall',  zh:'“坐下，纳特！”'},
    {line:'Nat sat.',        art:'natSit',   zh:'纳特坐下了。'},
    {line:'I pat Nat.',      art:'natPat',   zh:'我拍拍纳特。'},
    {line:'Nat naps.',       art:'natNap',   zh:'纳特打起盹来。'},
    {line:'Nap, Nat, nap!',  art:'natDream', zh:'睡吧，纳特，睡吧！'}
  ]
};

const FIRST_TEACH_DAY = { s:1, a:1, t:2, i:3, p:4, n:5 };

const G1_ROUNDS = {
  s: { pos:['sun','sock','snake','sit'], neg:['dog','bag','milk','fish'] },
  a: { pos:['cat','hat','map','bat'],   neg:['dog','cup','book','tree'] }
};

const G1_THEME = {
  s: { title:'轮 A · 抓住 /s/', icon:'snake', cmd:'开头听到 sss 就拍气球' },
  a: { title:'轮 B · 抓住 /æ/', icon:'ant', cmd:'听到词的肚子里藏着 æ 就拍气球' }
};

const G3_PAIRS = [['sat','sit'],['pan','pin'],['tap','tip']];

const G4_WORDS = ['at','it','an','in','sat','pin','nap'];

const G5_WHITELIST = ['an','at','in','it','nap','nip','pan','pat','pin','sat','sip','sit','snap','tap','tin','tip'];

const DAYS = [
{
  n:1, wd:'第一天', title:'蛇和蚂蚁', sounds:['s','a'],
  goal:'能单独说出 /s/ 和 /æ/ 两个音，并在纸上写出这两个字母',
  steps:[
    {t:'开场仪式', min:3, blocks:[
      {b:'lead', html:'固定的开场动作比什么都重要。每天一样，孩子的大脑会自动切换到「英语时间」。'},
      {b:'list', items:[
        '和孩子击掌，一起说 <span class="say">English time!</span>',
        '拿出本子和笔，摆在固定位置',
        '告诉他今天的任务：<b>认识两块声音积木</b>'
      ]},
      {b:'note', tone:'ok', html:'第一天不要讲「英语有多重要」。只说：我们来玩一个拼积木的游戏，玩几天你就能自己读书了。'}
    ]},
    {t:'新声音 /s/', min:9, blocks:[
      {b:'sound', s:'s'},
      {b:'lead', html:'<strong>认字形：</strong>s 长得就像一条蛇。让孩子先用手指在空中写 5 遍（书空），再在本子上写 5 个。写的时候嘴里要一直念 sssss。'}
    ]},
    {t:'新声音 /æ/', min:9, blocks:[
      {b:'sound', s:'a'},
      {b:'lead', html:'<strong>认字形：</strong>a 像一个圆圆的肚子后面拖了一根小棍子。空中写 5 遍，本子上写 5 个。'},
      {b:'note', tone:'bulb', html:'<b>红色和青色是有意义的。</b>元音积木是红色，辅音积木是青色。不用给孩子解释这两个词，看多了他自己会发现：<b>每个词里都得有一块红的</b>。这是英语拼读最底层的规律。'}
    ]},
    {t:'声音抓抓乐', min:6, blocks:[
      {b:'lead', html:'今天不拼词，只训练耳朵。电脑会念词，孩子听到规则说的那个音就点气球。两轮主题不同，先跟孩子说清楚口令再开始。'},
      {b:'g1'},
      {b:'note', tone:'warn', html:'孩子拍错很正常，<b>不需要你评判对错</b>——气球晃一下就过去了，游戏自己会记分。你在旁边看着、陪着说说口令就好。'}
    ]},
    {t:'收尾打卡', min:3, blocks:[
      {b:'lead', html:'今天没有拼出单词，但要给孩子一个明确的预告——<b>明天你就能读出第一个英文单词了</b>。这个钩子很重要。'},
      {b:'checks', items:[
        ['看到字母 s，能说出 /s/ 的音','不看图、不提示，直接说出来'],
        ['看到字母 a，能说出 /æ/ 的音','嘴要张大张扁，不是「啊」'],
        ['能在本子上写出 s 和 a','不用好看，能认出来就行']
      ]}
    ]}
  ]
},
{
  n:2, wd:'第二天', title:'第一个单词', sounds:['t'],
  goal:'能独立读出 sat —— 人生第一个自己拼出来的英文单词',
  steps:[
    {t:'快闪复习', min:3, blocks:[
      {b:'lead', html:'每天开头都是快闪。卡片一张张过，孩子看到就说音，<b>不要思考、不要犹豫</b>，追求快。'},
      {b:'flash', items:[{k:'s'},{k:'a'}]}
    ]},
    {t:'新声音 /t/', min:7, blocks:[
      {b:'sound', s:'t'},
      {b:'lead', html:'<strong>认字形：</strong>t 是一根竖棍加一横。空中写 5 遍，本子上写 5 个。'}
    ]},
    {t:'拼读首秀', min:12, blocks:[
      {b:'lead', html:'<strong>今天最重要的 12 分钟。</strong>先拼两个音，再拼三个音。每个词都按同一个流程走：<b>①一个一个念　②越念越快　③合起来</b>。'},
      {b:'blend', words:['at','sat']},
      {b:'note', tone:'bulb', html:'孩子第一次可能拼不出来，卡在「s…a…t…」念了三遍还是三个音。<b>这时候你把三个音念得越来越快</b>：s-a-t、sat、sat。他会突然「啊」一声——那个瞬间就是解码能力诞生的时刻。'},
      {b:'note', tone:'ok', html:'拼出来之后，让孩子对着你大声说一句：<span class="say">I can read “sat”!</span>　仪式感在这个年龄非常管用。'}
    ]},
    {t:'巩固', min:5, blocks:[
      {b:'lead', html:'你在纸上写 <span class="say">at</span> 和 <span class="say">sat</span>，随机指，让孩子读。读对 3 次就够了，不要过量。'},
      {b:'words', items:['at','sat']}
    ]},
    {t:'收尾打卡', min:3, blocks:[
      {b:'note', tone:'star', html:'<b>今天值得录一段视频。</b>让孩子对着镜头读出 sat。一年以后回看，这是他英语路上的第一块里程碑。'},
      {b:'checks', items:[
        ['能独立读出 <span class="en"><b>sat</b></span>','你写在纸上，他不看提示直接读'],
        ['能独立读出 <span class="en"><b>at</b></span>','两个音的也要能拼'],
        ['知道 /t/ 不能拖长','问他：/t/ 能不能像 /s/ 那样拖很久？答「不能」就对了']
      ]}
    ]}
  ]
},
{
  n:3, wd:'第三天', title:'短短的 i', sounds:['i'],
  goal:'能听出并读准 sat 和 sit 的区别 —— 这是英语听力的地基',
  steps:[
    {t:'快闪复习', min:3, blocks:[
      {b:'flash', items:[{k:'s'},{k:'a'},{k:'t'},{k:'w',v:'at'},{k:'w',v:'sat'}]}
    ]},
    {t:'新声音 /ɪ/', min:7, blocks:[
      {b:'sound', s:'i'},
      {b:'lead', html:'<strong>认字形：</strong>i 是一根小竖棍，头上顶一个点。空中写 5 遍，本子上写 5 个。'}
    ]},
    {t:'拼读练习', min:8, blocks:[
      {b:'blend', words:['it','in','sit']},
      {b:'words', items:['it','in','sit']}
    ]},
    {t:'关键训练：听出区别', min:8, blocks:[
      {b:'lead', html:'<strong>今天真正的重点。</strong>sat 和 sit 只差中间一个元音。能听出这一点点差别，孩子的耳朵才算为英语打开了。这个训练要每天做一点，做一整年。'},
      {b:'pair', pairs:[['sat','sit'],['pan','pin'],['tap','tip']], note:'后两组词还没学，先只用耳朵听，不用读'},
      {b:'note', tone:'warn', html:'如果孩子总是分不出来，<b>不是他笨</b>——中文里这两个音不区分意义，他的耳朵从没被要求分辨过。把两个音夸张地拖长对比：s-<b>æææ</b>-t／s-<b>ɪɪɪ</b>-t，做上几十次就出来了。'}
    ]},
    {t:'收尾打卡', min:4, blocks:[
      {b:'checks', items:[
        ['能读出 <span class="en"><b>sit</b></span> 和 <span class="en"><b>it</b></span>',''],
        ['你念 sat 或 sit，他能指对是哪个','10 次里对 7 次就算过'],
        ['看到 i，能说出 /ɪ/ 的音','短、松，不是「衣」']
      ]}
    ]}
  ]
},
{
  n:4, wd:'第四天', title:'爆米花', sounds:['p'],
  goal:'一次拼出 5 个以上新单词，并知道有些词是“不能拼、要直接记”的',
  steps:[
    {t:'快闪复习', min:3, blocks:[
      {b:'flash', items:[{k:'s'},{k:'a'},{k:'t'},{k:'i'},{k:'w',v:'sat'},{k:'w',v:'sit'},{k:'w',v:'at'},{k:'w',v:'it'}]}
    ]},
    {t:'新声音 /p/', min:7, blocks:[
      {b:'sound', s:'p'},
      {b:'lead', html:'<strong>认字形：</strong>p 是一根往下伸的棍子，右上角挂一个圆。注意和 b 的方向不同，现在先不提 b，免得混。'}
    ]},
    {t:'拼读大丰收', min:10, blocks:[
      {b:'lead', html:'今天一口气能拼出很多词。<b>让孩子自己数一数今天读出了几个</b>——数字带来的成就感比夸奖实在。'},
      {b:'blend', words:['pat','sit','sip','tip','tap']},
      {b:'words', items:['pat','sit','sip','tip','tap']}
    ]},
    {t:'认读词：不能拼的词', min:6, blocks:[
      {b:'lead', html:'英语里有一小批高频词不遵守拼读规则，得像认汉字一样直接记住。<strong>这个类比直接告诉孩子他就懂</strong>：「就像『的』字，你不用拆开也认识它。」'},
      {b:'sight', items:[['I','我'],['a','一个'],['see','看见']]},
      {b:'note', tone:'bulb', html:'一周只加 3 个认读词，不要贪多。这三个词加上已经会拼的词，明天就能读句子了。'}
    ]},
    {t:'收尾打卡', min:4, blocks:[
      {b:'checks', items:[
        ['今天读出了 5 个以上新单词','让孩子自己数给你听'],
        ['认识 <span class="en"><b>I</b></span> / <span class="en"><b>a</b></span> / <span class="en"><b>see</b></span> 三个认读词','看到就说出来，不许拼'],
        ['知道 /p/ 是「吹气的音」','纸片测试通过']
      ]}
    ]}
  ]
},
{
  n:5, wd:'第五天', title:'鼻子里的声音', sounds:['n'],
  goal:'尝试在 nap 前加 /s/，读出 snap —— 进阶拼读观察',
  steps:[
    {t:'快闪复习', min:3, blocks:[
      {b:'flash', items:[{k:'s'},{k:'a'},{k:'t'},{k:'i'},{k:'p'},{k:'w',v:'pat'},{k:'w',v:'tip'},{k:'w',v:'tap'},{k:'w',v:'sip'}]}
    ]},
    {t:'新声音 /n/', min:7, blocks:[
      {b:'sound', s:'n'},
      {b:'note', tone:'bulb', html:'<b>一个值得让孩子自己发现的秘密：</b>/t/ 和 /n/ 的舌头位置完全一样，区别只在于 /n/ 从鼻子出声、/t/ 从嘴出气。让他交替念 t-n-t-n，摸着鼻子感受。这种「原来是这样」的时刻，比背十个单词有用。'},
      {b:'lead', html:'<strong>认字形：</strong>n 像一个小拱门。空中写 5 遍，本子上写 5 个。'}
    ]},
    {t:'拼读 + 挑战', min:11, blocks:[
      {b:'lead', html:'先拼三个音的，再挑战四个音的。<b>snap 开头有两个辅音挤在一起</b>，这是今天的难点，也是最有成就感的地方。'},
      {b:'blend', words:['an','nap','pan','pin','tin','nip','snap']},
      {b:'words', items:['an','nap','pan','pin','tin','nip','snap']},
      {b:'note', tone:'warn', html:'拼 <span class="en"><b>snap</b></span> 卡住时，先让他拼 <span class="en">nap</span>，再在前面加一个 s：s+nap → snap。<b>从后往前接</b>比从前往后拼容易得多。'}
    ]},
    {t:'第一次读句子', min:5, blocks:[
      {b:'lead', html:'把学过的词组成句子。你先指读一遍，再让孩子自己读。'},
      {b:'sentences', items:[
        ['I see a pin.','我看见一枚大头针。'],
        ['Nat naps.','纳特在打盹。'],
        ['I pat Nat.','我拍拍纳特。']
      ]},
      {b:'note', tone:'ok', html:'Nat 是一只小狗的名字，明天他会成为孩子第一本书的主角。今天先混个脸熟。'}
    ]},
    {t:'收尾打卡', min:4, blocks:[
      {b:'checks', items:[
        ['尝试在 <span class="en"><b>nap</b></span> 前加 /s/，读出 <span class="en"><b>snap</b></span>','进阶观察：nap 还不顺时先巩固，不强求当天完成'],
        ['能读出 <span class="en"><b>I see a pin.</b></span>','完整一句，磕巴没关系'],
        ['知道 /n/ 的声音从鼻子出来','捏鼻子测试通过']
      ]}
    ]}
  ]
},
{
  n:6, wd:'第六天', title:'第一本书', sounds:['s','a','t','i','p','n'],
  goal:'独立读完人生第一本英文书 —— 这一天要办成一件大事',
  steps:[
    {t:'全部六个音，计时快闪', min:4, blocks:[
      {b:'lead', html:'今天的快闪要<b>计时</b>。六个音过一遍，看多少秒。记下来，明年再看这个数字会很有意思。'},
      {b:'flash', items:[{k:'s'},{k:'a'},{k:'t'},{k:'i'},{k:'p'},{k:'n'}], timed:true, recKey:'flash_sounds'}
    ]},
    {t:'词卡闪读', min:6, blocks:[
      {b:'lead', html:'30 秒挑战：能读出几个？读错不停，跳过继续。'},
      {b:'flash', items:[
        {k:'w',v:'sat'},{k:'w',v:'sit'},{k:'w',v:'pat'},{k:'w',v:'pin'},
        {k:'w',v:'pan'},{k:'w',v:'nap'},{k:'w',v:'tap'},{k:'w',v:'tip'},{k:'w',v:'sip'},
        {k:'w',v:'tin'},{k:'w',v:'an'},{k:'w',v:'at'},{k:'w',v:'it'},{k:'w',v:'in'},
        {k:'w',v:'snap'},{k:'w',v:'nip'}
      ], timed:true, recKey:'flash_words'}
    ]},
    {t:'读《Nat Naps》', min:15, blocks:[
      {b:'lead', html:'<strong>三遍法，一遍都不能少：</strong>'},
      {b:'list', items:[
        '<b>第一遍</b> — 你指着词读，孩子跟着念。速度放慢。',
        '<b>第二遍</b> — 孩子自己指、自己读，卡住的词你只提示第一个音，不要直接说答案。',
        '<b>第三遍</b> — 孩子独立读，你在旁边录像。这一遍不要打断，读错也不纠。'
      ]},
      {b:'note', tone:'bulb', html:'开读前先说一件事：书里句子开头和名字用了<b>大写字母</b>——<span class="en"><b>S</b></span> 和 <span class="en">s</span>、<span class="en"><b>N</b></span> 和 <span class="en">n</span> 是同一块积木，只是穿了大外套，<b>读音完全一样</b>。孩子卡在大写上时，提醒这一句就行。'},
      {b:'book'},
      {b:'note', tone:'bulb', html:'书里每个能拼的词，都只用了这六个音；<span class="en">I / see / a</span> 是昨天记住的认读词。<b>孩子读完会意识到：这本书是我自己读下来的，没有一个字是猜的。</b>'}
    ]},
    {t:'庆祝', min:5, blocks:[
      {b:'note', tone:'star', html:'<b>今天要办成一件大事，不要轻轻放过。</b>'},
      {b:'list', items:[
        '点小书下方的「打印小书」按钮把书打印出来——<b>最后一页是签名页</b>，让孩子填上日期、签上自己的名字。',
        '打视频给爷爷奶奶，读一遍给他们听。',
        '把录的视频存好，标上「第一本书」。'
      ]},
      {b:'checks', items:[
        ['独立读完了整本《Nat Naps》','六页，中途可以提示，但主要靠他自己'],
        ['六个音的快闪能在 15 秒内过完',''],
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
      {b:'note', tone:'ok', html:'<b>休息日是方案的一部分，不是偷懒。</b>连续六天之后大脑需要一天来固化，而且要让孩子知道：这件事有始有终，不是没完没了。'}
    ]},
    {t:'游戏一：听音找开头', min:5, blocks:[
      {b:'lead', html:'点「开始游戏」，听电脑念一个学过的词，再点它开头的字母：<span class="en">s、t、p、n</span>。一轮 8 题，不限时；没听清就点「再听一次」。'},
      {b:'initialpick', words:['sat','sit','tap','tip','pan','pin','nap','nip'], letters:['s','t','p','n']},
      {b:'note', tone:'bulb', html:'答对后才显示单词和图片，可以跟着再读一遍。答错留在原题，重新听、重新选。<b>这是可选的复习游戏，不是周检</b>；玩完一轮就可以停，不用计时或比速度。'}
    ]},
    {t:'游戏二：造词工坊', min:12, blocks:[
      {b:'lead', html:'点积木拼词，摆满自动看看是不是真词——猜的词也要读出来，这叫解码训练，跟拼对一样有价值。<b>拼出真词后长按确认，是他自己读出来的吗？</b>'},
      {b:'g5'},
      {b:'note', tone:'ok', html:'这个游戏要做完今天最后的「周检」才会打开——先看看这一周到底学会了没有，再决定往下走。真词和瞎拼的组合，屏幕提示是一模一样的「读读看」，不直接告诉他对错，让他自己去读、自己判断。'}
    ]},
    {t:'游戏三：读给别人听', min:10, blocks:[
      {b:'lead', html:'把《Nat Naps》读给爷爷奶奶、读给玩具熊、读给镜子里的自己。<b>换一个听众，孩子会重新认真一遍</b>。'}
    ]},
    {t:'游戏四：点单游戏', min:10, blocks:[
      {b:'lead', html:'孩子自己选一张"订单"（或点「随机来一单」），听电脑读词，再从积木架上把这个词拼出来。<b>拼对了长按确认——是他自己指读出来的吗？</b>'},
      {b:'g4'},
      {b:'note', tone:'bulb', html:'摆词是「听音找字」——同一套积木的反向玩法，也是以后<b>自己写单词</b>的地基。摆错也没关系，积木会晃一下让他重摆；同一个词错两次，屏幕会提示第一个字母帮他起个头。第一周能摆对两三个就很好，不用求快求多。'}
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
