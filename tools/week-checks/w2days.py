# -*- coding: utf-8 -*-
"""第二周七天课程（§5.1 #12）。块类型词汇表见规范 §5.2。"""

DAYS = """const DAYS = [
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
      {b:'lead', html:'固定后面两块积木，只换第一块。<b>让孩子自己换、自己读</b>，读出来之后你再告诉他中文意思。'},
      {b:'table', head:['换掉第一块','读出来是'], rows:[
        ['<b class="en">c</b> + <b class="en">at</b>','<b class="en">cat</b>　猫'],
        ['<b class="en">h</b> + <b class="en">at</b>','<b class="en">hat</b>　帽子'],
        ['<b class="en">p</b> + <b class="en">at</b>','<b class="en">pat</b>　轻轻拍'],
        ['<b class="en">s</b> + <b class="en">at</b>','<b class="en">sat</b>　坐下了'],
        ['<b class="en">h</b> + <b class="en">it</b>','<b class="en">hit</b>　敲一下'],
        ['<b class="en">k</b> + <b class="en">it</b>','<b class="en">kit</b>　工具包'],
        ['<b class="en">s</b> + <b class="en">it</b>','<b class="en">sit</b>　坐']
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
      {b:'lead', html:'亲手把第一块积木换成 <span class="en">r</span>，每换一个都要自己读出来。'},
      {b:'table', head:['原来的词','换成 r 之后'], rows:[
        ['<b class="en">hat</b>　帽子','<b class="en">rat</b>　老鼠'],
        ['<b class="en">hip</b>　胯','<b class="en">rip</b>　撕开'],
        ['<b class="en">can</b>　罐头','<b class="en">ran</b>　跑了']
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
];"""

# ---- 周检块文案（§5.1 #15，exam 块内的硬编码正文） ----
EXAM_OLD_1 = ('<b>这是你要的那个「当场能验的尺子」。</b>下面五个词，孩子这一周<b>一个都没练过</b>'
              '——它们只由学过的六个音组成。能不能读出来，完全取决于他有没有真的掌握解码，'
              '而不是记住了什么。')
EXAM_NEW_1 = ('<b>这是你要的那个「当场能验的尺子」。</b>下面五个词，孩子这两周<b>一个都没练过</b>'
              '——它们只由学过的十三个音组成，而且全是三个音的词。能不能读出来，完全取决于他有'
              '没有真的掌握解码，而不是记住了什么。')

EXAM_OLD_2 = '<tr><td><b style="color:var(--ok)">4 – 5 个</b></td><td>解码能力已经建立</td><td>下周正常进入第 2 周新内容</td></tr>'
EXAM_NEW_2 = '<tr><td><b style="color:var(--ok)">4 – 5 个</b></td><td>解码能力稳住了</td><td>下周正常进入第 3 周新内容</td></tr>'

EXAM_OLD_3 = '<td>下周前两天先复习本周，再进新课</td>'
EXAM_NEW_3 = '<td>下周前两天先复习本周，再进新课</td>'

EXAM_OLD_4 = '可以回到第 1–6 天的音素按钮，自己先拼读一遍确认。'
EXAM_NEW_4 = '可以回到第 1–6 天的音素卡片，自己先拼读一遍确认。'
