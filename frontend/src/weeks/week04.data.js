const META = {
  "week": 4,
  "storageKey": "soundblocks-w4-v1",
  "consolidation": true,
  "groupedRack": true,
  "wallLetters": "satipnckehrmdgoulfb",
  "rackG4": "satipnckehrmdgoulfb",
  "rackG5": "satipnckehrmdgoulfb",
  "flashCapacity": {
    "flash_words": 12,
    "flash_sounds": 19
  }
};

const RESERVED = [
  "dab",
  "nag",
  "nod",
  "sob",
  "rot"
];

const RESERVED_RETEST = [
  "gab",
  "gal",
  "hub",
  "rib",
  "sod"
];

const PROBE_A = [];

const PROBE_B = [];

const GLOBAL_RESERVED = [
  "shelf",
  "shaft",
  "chimp",
  "chunk",
  "quilt",
  "quest",
  "moist",
  "hoist",
  "thorn",
  "north",
  "bleed",
  "greed",
  "groan",
  "float",
  "trail",
  "snail",
  "fried",
  "tried",
  "plum",
  "slug",
  "crust",
  "trust",
  "spoon",
  "stool",
  "wink",
  "honk",
  "yelp",
  "yank",
  "jump",
  "jolt",
  "shake",
  "flake",
  "stripe",
  "spine",
  "globe",
  "stove",
  "cube",
  "mule",
  "scarf",
  "shark"
];

const TAUGHT_SIGHT = [
  "i",
  "a",
  "see",
  "the",
  "is",
  "to"
];

const ASSESS_TEXT = "I see a pup. I see a cub. The pup is at a rug. The cub is at the rug. I tug the rug. The rug is up. The pup is up. The cub is up. I rub the rug. I rub, rub, rub. I see the pup at the rug. I see the cub at the rug. I see the rug.";

const ASSESSMENT_WORDS = {
  "dab": {
    "zh": "轻点"
  },
  "nag": {
    "zh": "唠叨"
  },
  "nod": {
    "zh": "点头"
  },
  "sob": {
    "zh": "抽泣"
  },
  "rot": {
    "zh": "腐烂"
  },
  "gab": {
    "zh": "闲聊"
  },
  "gal": {
    "zh": "女孩（口语）"
  },
  "hub": {
    "zh": "中心"
  },
  "rib": {
    "zh": "肋骨"
  },
  "sod": {
    "zh": "草皮"
  }
};

const SOUNDS = {
  "s": {
    "L": "s",
    "ipa": "/s/",
    "type": "c",
    "art": "snake",
    "mem": "蛇在吐信子 sssss",
    "cue": "牙齿靠近，像小蛇一样轻轻漏气：<span class=\"en\">ssssss</span>。看看谁坚持得更久。",
    "challenge": "喉咙侦探",
    "try": "一只手摸着喉咙，另一只手放在嘴前，再发一次长长的 /s/。",
    "pass": "喉咙安静，嘴前有细细的风，而且声音可以一直拖长。",
    "how": "上下牙靠近但不要咬紧；舌尖靠近上牙后方，不碰牙齿，让气流从舌头中央持续通过。",
    "warn": "如果听见「斯」的尾巴，说明多带了一个元音。先把声音拖成长长的 /s/，再练习干净地停住。",
    "demo": [
      [
        "snake",
        "蛇"
      ],
      [
        "sun",
        "太阳"
      ],
      [
        "sock",
        "袜子"
      ]
    ]
  },
  "a": {
    "L": "a",
    "ipa": "/æ/",
    "type": "v",
    "art": "ant",
    "mem": "蚂蚁爬上手臂 a-a-a",
    "cue": "小蚂蚁爬上手臂啦！嘴巴张大、稍微扁一点，短短地说：<span class=\"en\">a-a-a</span>。",
    "challenge": "镜子挑战",
    "try": "对着镜子先说中文「啊」，再把嘴角向两边展开一点，短短地发 /æ/。",
    "pass": "嘴比说「啊」更扁，声音短，不滑向「爱」。",
    "how": "下巴打开，嘴唇自然或略向两边展开；舌头放低并靠前。保持一个稳定的短元音，不要滑动。",
    "warn": "中文里没有完全对应的音。不要用「啊」或「爱」替代；先夸张嘴形，再逐渐缩小动作。",
    "demo": [
      [
        "ant",
        "蚂蚁"
      ],
      [
        "apple",
        "苹果"
      ],
      [
        "cat",
        "猫"
      ]
    ]
  },
  "t": {
    "L": "t",
    "ipa": "/t/",
    "type": "c",
    "art": "tiger",
    "mem": "小老虎轻轻踏步 t-t-t",
    "cue": "舌尖轻点上牙后面，马上弹开。手指敲一下手心：<span class=\"en\">t、t、t</span>。",
    "challenge": "短音刹车",
    "try": "每发一次 /t/ 就立刻闭嘴停住，再摸摸喉咙有没有振动。",
    "pass": "声音一下就停，喉咙不振动，也听不到「特」的尾巴。",
    "how": "舌尖或舌叶贴住上牙后方的小凸起，短暂挡住气流后迅速放开；这是一个清音。",
    "warn": "不要加中文「特」里的元音尾巴。孩子只需要听到一次短促、干净的释放。",
    "demo": [
      [
        "ten",
        "十"
      ],
      [
        "top",
        "陀螺"
      ],
      [
        "tap",
        "水龙头"
      ]
    ]
  },
  "i": {
    "L": "i",
    "ipa": "/ɪ/",
    "type": "v",
    "art": "igloo",
    "mem": "冰屋里冷得发抖 i-i-i",
    "cue": "假装冰屋里有点冷，肩膀轻轻抖一下，嘴巴放松：<span class=\"en\">i、i、i</span>。",
    "challenge": "松紧对比",
    "try": "先故意说一个紧紧、长长的「衣——」，再把嘴放松，只发一下短短的 /ɪ/。",
    "pass": "第二个声音明显更短、更松，嘴角没有一直用力。",
    "how": "嘴微微张开，舌头靠前但保持放松。重点不是把嘴拉成笑脸，而是短促、松弛。",
    "warn": "不要用中文「衣」替代，也不要拖长。练习时一次只发一个短音。",
    "demo": [
      [
        "igloo",
        "冰屋"
      ],
      [
        "in",
        "在里面"
      ],
      [
        "sit",
        "坐"
      ]
    ]
  },
  "p": {
    "L": "p",
    "ipa": "/p/",
    "type": "c",
    "art": "popcorn",
    "mem": "爆米花蹦出来 p-p-p",
    "cue": "双唇先关紧，再像爆米花一样突然弹开：<span class=\"en\">p、p、p</span>！",
    "challenge": "纸片起飞",
    "try": "把一小片轻纸放在嘴前约 3 厘米，每发一次 /p/，看纸片会不会跳一下。",
    "pass": "纸片会动，喉咙不振动，而且爆开后没有「泼」的元音尾巴。",
    "how": "双唇完全闭合，短暂挡住气流后迅速放开；舌头不用摆特殊位置，喉咙保持安静。",
    "warn": "纸片实验只检查有没有爆破气流；是否发得干净，还要听后面有没有多出一个元音。",
    "demo": [
      [
        "pig",
        "猪"
      ],
      [
        "pen",
        "笔"
      ],
      [
        "pan",
        "平底锅"
      ]
    ]
  },
  "n": {
    "L": "n",
    "ipa": "/n/",
    "type": "c",
    "art": "nose",
    "mem": "声音从鼻子出来 nnnnn",
    "cue": "舌尖停在上牙后面，手指轻轻碰鼻梁，拖长：<span class=\"en\">nnnnn</span>。",
    "challenge": "鼻子开关",
    "try": "先拖长 /n/，再轻轻捏住鼻子；松开、捏住，来回试两次。",
    "pass": "鼻梁能感觉到振动，捏住鼻子后声音会明显改变或停住。",
    "how": "舌尖贴住上牙后方，位置和 /t/ 接近；口腔通道被挡住，声音与气流主要从鼻腔通过。",
    "warn": "不要念成「呢」。/n/ 可以持续，但停下时不要再补一个元音。",
    "demo": [
      [
        "nose",
        "鼻子"
      ],
      [
        "net",
        "网"
      ],
      [
        "nap",
        "小睡"
      ]
    ]
  },
  "c": {
    "L": "c",
    "ipa": "/k/",
    "type": "c",
    "art": "camera",
    "mem": "咔嚓相机 k-k-k",
    "audioKey": "c",
    "cue": "舌头后面轻轻堵住，再突然放开，像按下快门：<span class=\"en\">k、k、k</span>。",
    "challenge": "拖不长的音",
    "try": "一只手摸着喉咙，短短地发三次 /k/，再故意想把它拖长试试。",
    "pass": "喉咙不振动，声音一下就停，而且根本拖不长，也听不到「科」的尾巴。",
    "how": "舌头后部抬起，顶住上颚靠后那块软的地方，短暂挡住气流后迅速放开。这是清音，声带不参与。",
    "warn": "最常见的错是念成中文「科」，多带了一个元音尾巴。孩子拼 cat 时就会变成「科-啊-特」，然后合不起来。发完立刻闭嘴停住。",
    "demo": [
      [
        "cat",
        "猫"
      ],
      [
        "cap",
        "鸭舌帽"
      ],
      [
        "kit",
        "工具包"
      ]
    ]
  },
  "e": {
    "L": "e",
    "ipa": "/e/",
    "type": "v",
    "art": "huh",
    "mem": "没听清，反问一声 e?",
    "cue": "嘴巴自然微张、稍微扁一点，短短地发一次：<span class=\"en\">e、e、e</span>，像没听清时反问「诶？」的前半截。",
    "challenge": "三块红积木",
    "try": "对着镜子依次说 /æ/、/ɪ/、/e/，每次只发一个短音，看看嘴形有什么不一样。",
    "pass": "三个音的嘴形明显不同：/æ/ 最开最扁，/ɪ/ 最松，/e/ 在中间。每个都短，都不往别的音滑。",
    "how": "下巴打开的程度介于 /æ/ 和 /ɪ/ 之间，舌头靠前、中高位置，保持稳定不滑动。",
    "warn": "不要发成中文「诶」——「诶」会滑向 /i/，变成两个音。也不要拖长。",
    "demo": [
      [
        "ten",
        "十"
      ],
      [
        "net",
        "网"
      ],
      [
        "pen",
        "笔"
      ]
    ]
  },
  "h": {
    "L": "h",
    "ipa": "/h/",
    "type": "c",
    "art": "breath",
    "mem": "对手心轻轻哈气 hhh",
    "cue": "像要在镜子上哈一层薄雾，气流直接送出去：<span class=\"en\">hhh</span>，然后马上接住后面的元音。",
    "challenge": "手心起雾",
    "try": "手掌放在嘴前，先轻轻哈一次气，再立刻接一个 /æ/，连成 h-a。",
    "pass": "手心能感觉到一股温热的气，喉咙不振动，而且 /h/ 和后面的元音是连着的，中间不断开。",
    "how": "声门微开让气流通过，口腔不做任何阻挡，舌位由后面跟着的元音决定。它其实是一次带着方向的呼气。",
    "warn": "不要念成中文「喝」。/h/ 本身几乎没有声音，必须靠后面的元音把它带出来，不能单独用力发。",
    "demo": [
      [
        "hat",
        "帽子"
      ],
      [
        "hen",
        "母鸡"
      ],
      [
        "hip",
        "胯"
      ]
    ]
  },
  "r": {
    "L": "r",
    "ipa": "/r/",
    "type": "c",
    "art": "racecar",
    "mem": "小赛车启动 rrr",
    "cue": "嘴唇稍微撅圆，舌尖抬起来但<b>不要碰到任何地方</b>，像小赛车发动：<span class=\"en\">rrrrr</span>。",
    "challenge": "舌尖悬空",
    "try": "先发一个 /d/ 感受舌尖顶住上牙后面，再发 /r/，检查舌尖是不是悬在半空、没碰到。",
    "pass": "发 /r/ 时舌尖悬空不接触，声音可以拖长，而且舌头没有弹动。",
    "how": "舌尖上翘接近上齿龈后方但不接触，舌根略后缩，双唇略圆。这是英语特有的近音。",
    "warn": "两个典型错误：一是发成中文「日」（舌头太平太靠后），二是发成弹舌的大舌音。都靠「舌尖悬空、嘴唇略圆」这两个动作纠正。",
    "demo": [
      [
        "rat",
        "老鼠"
      ],
      [
        "red",
        "红色"
      ],
      [
        "rip",
        "撕开"
      ]
    ]
  },
  "m": {
    "L": "m",
    "ipa": "/m/",
    "type": "c",
    "art": "yum",
    "mem": "闭嘴尝美味 mmmmm",
    "cue": "双唇合拢，声音从鼻子里出来，可以一直拖长：<span class=\"en\">mmmmm</span>，像吃到好吃的。",
    "challenge": "鼻子开关",
    "try": "一只手摸双唇，一只手摸鼻翼，拖长 /m/，然后轻轻捏住鼻子。",
    "pass": "嘴唇一直闭着，鼻翼有振动；捏住鼻子后声音会闷住或者停掉。",
    "how": "双唇闭合把口腔通道挡死，声带振动，气流全部从鼻腔出去。和 /n/ 同理，区别只在挡住的位置。",
    "warn": "不要念成中文「木」或「嘛」。/m/ 全程闭着嘴，停下来时也不要补一个元音。",
    "demo": [
      [
        "mat",
        "垫子"
      ],
      [
        "man",
        "男人"
      ],
      [
        "map",
        "地图"
      ]
    ]
  },
  "d": {
    "L": "d",
    "ipa": "/d/",
    "type": "c",
    "art": "drum",
    "mem": "小鼓轻敲 d-d-d",
    "cue": "舌尖轻点上牙后面，马上弹开，喉咙同时振动：<span class=\"en\">d、d、d</span>，像敲小鼓。",
    "challenge": "喉咙开关",
    "try": "一只手摸着喉咙，交替发 /t/、/d/、/t/、/d/，比较有没有振动。",
    "pass": "发 /d/ 时喉咙振动，发 /t/ 时不振动，而且两个音的舌头位置完全一样。",
    "how": "舌尖抵住上齿龈，短暂挡住气流后放开。和 /t/ 唯一的区别是声带振动——这是一对清浊对立。",
    "warn": "不要念成中文「德」。孩子分不清 /d/ 和 /t/ 时，让他摸着喉咙来回切换，靠手感而不是靠耳朵。",
    "demo": [
      [
        "dad",
        "爸爸"
      ],
      [
        "den",
        "兽穴"
      ],
      [
        "red",
        "红色"
      ]
    ]
  },
  "g": {
    "L": "g",
    "ipa": "/g/",
    "type": "c",
    "art": "gulp",
    "mem": "咕咚咕咚大口喝水 g-g-g",
    "cue": "舌头后面轻轻堵住，喉咙一起振动，再突然放开，像大口喝水时喉咙里的声音：<span class=\"en\">g、g、g</span>。",
    "challenge": "喉咙开关",
    "try": "一只手摸着喉咙，交替发 /k/、/g/、/k/、/g/，舌头位置不变，只看喉咙有没有振动。",
    "pass": "发 /g/ 时喉咙振动，发 /k/ 时不振动，而且两个音的舌头位置完全一样。",
    "how": "舌头后部抬起顶住软腭，短暂挡住气流后放开，同时声带振动。它和 /k/ 是一对清浊双胞胎，就像 /d/ 和 /t/。",
    "warn": "不要念成中文「哥」——那多了一个元音尾巴。在词尾（dog、bag）尤其要收干净：舌头放开就停，不要补「哥」。",
    "demo": [
      [
        "goat",
        "山羊"
      ],
      [
        "gum",
        "口香糖"
      ],
      [
        "bag",
        "袋子"
      ]
    ]
  },
  "o": {
    "L": "o",
    "ipa": "/ɑ/",
    "type": "v",
    "art": "doctor",
    "mem": "看医生张大嘴 o-o-o",
    "cue": "像给医生看喉咙那样，嘴巴上下张大、嘴唇放松不收圆，短短地发：<span class=\"en\">o、o、o</span>。",
    "challenge": "四块红积木",
    "try": "对着镜子依次说 /æ/、/e/、/ɪ/、/ɑ/，每次一个短音，看嘴巴哪一次张得最大。",
    "pass": "/ɑ/ 是四个里嘴张得最大的，声音短，不往「喔」或「奥」滑。",
    "how": "下巴充分打开，舌头放低放后，嘴唇不用圆。这是美式发音里的 /ɑ/，和「啊」接近但更靠后、更短。",
    "warn": "不要发成中文「喔」——那是嘴唇圆起来的另一个音。也不要拖长。让孩子摸着下巴感受「张得最大」。",
    "demo": [
      [
        "octopus",
        "章鱼"
      ],
      [
        "dog",
        "狗"
      ],
      [
        "hot",
        "热的"
      ]
    ]
  },
  "u": {
    "L": "u",
    "ipa": "/ʌ/",
    "type": "v",
    "art": "umbrella",
    "mem": "伞打不开急得直哼 u-u-u",
    "cue": "嘴巴放松、微微张开，喉咙轻轻发力，短短地哼一声：<span class=\"en\">u、u、u</span>，像使劲时的「呃」。",
    "challenge": "松口试验",
    "try": "先说一个用力的中文「乌」，感受嘴唇收圆；再把嘴唇完全放松、微张，只发一下短短的 /ʌ/。",
    "pass": "嘴唇不圆、不用力，声音短，听起来像轻轻的「呃」，不是「乌」。",
    "how": "舌头居中偏后，嘴微开，嘴唇完全放松。它是英语里最「懒」的元音，不需要任何嘴形。",
    "warn": "最常见的错是发成「乌」（嘴唇圆了）或「啊」（嘴张太大）。让孩子把嘴放松到几乎不动，再发。",
    "demo": [
      [
        "umbrella",
        "雨伞"
      ],
      [
        "sun",
        "太阳"
      ],
      [
        "cup",
        "杯子"
      ]
    ]
  },
  "l": {
    "L": "l",
    "ipa": "/l/",
    "type": "c",
    "art": "lollipop",
    "mem": "舔棒棒糖 llllll",
    "cue": "舌尖轻轻贴在上牙后面，声音从舌头两边流出来，可以拖长：<span class=\"en\">llllll</span>，像在舔棒棒糖。",
    "challenge": "舌尖贴住",
    "try": "让孩子拖长 /l/，中途试着把舌尖挪开——声音立刻变样，说明刚才是贴住的。你听声音能不能拖长、摸喉咙有没有振动来判断。",
    "pass": "舌尖贴在上牙后面不动，声音能拖长，喉咙振动。",
    "how": "舌尖抵住上齿龈，舌头两侧留出通道让气流和声音通过，声带振动。和 /n/ 的位置一样，区别是气从舌头两边走，不走鼻子。",
    "warn": "不要念成中文「了」（多了元音尾巴），也不要和 /r/ 混：/l/ 舌尖<b>贴住</b>，/r/ 舌尖<b>悬空</b>。词尾的 l 让孩子把舌尖真正顶上去再停。",
    "demo": [
      [
        "lollipop",
        "棒棒糖"
      ],
      [
        "leg",
        "腿"
      ],
      [
        "lip",
        "嘴唇"
      ]
    ]
  },
  "f": {
    "L": "f",
    "ipa": "/f/",
    "type": "c",
    "art": "candle",
    "mem": "轻轻吹蜡烛 fffff",
    "cue": "上牙轻轻搭在下嘴唇上，气从缝里漏出来，可以一直拖长：<span class=\"en\">fffff</span>，像轻轻吹蜡烛。",
    "challenge": "咬住下唇",
    "try": "让孩子先把上牙搭在下嘴唇上不动，再送气；一只手放在嘴前感受风。",
    "pass": "嘴前有持续的风，喉咙不振动，上牙一直搭在下唇上，声音能拖长。",
    "how": "上齿轻触下唇，气流从齿唇之间摩擦通过；清音，声带不振动。中文「f」（如「发」）的起始动作是一样的。",
    "warn": "中文里有这个音，问题只在收尾：不要变成「夫」。词尾的 f（golf）要把气送完就停，不补元音。",
    "demo": [
      [
        "fan",
        "风扇"
      ],
      [
        "fish",
        "鱼"
      ],
      [
        "leaf",
        "叶子"
      ]
    ]
  },
  "b": {
    "L": "b",
    "ipa": "/b/",
    "type": "c",
    "art": "ball",
    "mem": "皮球弹起来 b-b-b",
    "cue": "双唇先关紧，喉咙一起振动，再突然弹开：<span class=\"en\">b、b、b</span>，像皮球一下一下弹起来。",
    "challenge": "喉咙开关",
    "try": "一只手摸着喉咙，交替发 /p/、/b/、/p/、/b/，嘴唇动作一样，只看喉咙有没有振动。",
    "pass": "发 /b/ 时喉咙振动，发 /p/ 时不振动，而且两个音的嘴唇动作完全一样。",
    "how": "双唇闭合挡住气流后放开，同时声带振动。和 /p/ 是一对清浊双胞胎，就像 /d/ 与 /t/、/g/ 与 /k/。",
    "warn": "不要念成中文「波」。字形上 b 和 d 最容易认混：<b>b 的肚子在右边，d 的肚子在左边</b>。今天单独教 b，让孩子用手比一比「b 像朝右挺着的肚子」。",
    "demo": [
      [
        "ball",
        "球"
      ],
      [
        "bed",
        "床"
      ],
      [
        "bus",
        "公共汽车"
      ]
    ]
  },
  "k": {
    "L": "k",
    "ipa": "/k/",
    "type": "c",
    "art": "camera",
    "mem": "咔嚓相机 k-k-k",
    "audioKey": "c",
    "cue": "舌头后面轻轻堵住，再突然放开，像按下快门：<span class=\"en\">k、k、k</span>。",
    "challenge": "拖不长的音",
    "try": "一只手摸着喉咙，短短地发三次 /k/，再故意想把它拖长试试。",
    "pass": "喉咙不振动，声音一下就停，而且根本拖不长，也听不到「科」的尾巴。",
    "how": "舌头后部抬起，顶住上颚靠后那块软的地方，短暂挡住气流后迅速放开。这是清音，声带不参与。",
    "warn": "最常见的错是念成中文「科」，多带了一个元音尾巴。孩子拼 cat 时就会变成「科-啊-特」，然后合不起来。发完立刻闭嘴停住。",
    "demo": [
      [
        "cat",
        "猫"
      ],
      [
        "cap",
        "鸭舌帽"
      ],
      [
        "kit",
        "工具包"
      ]
    ]
  }
};

const FIRST_TEACH_DAY = {};

const WALL_HINT = {};

const BOOK = {
  "title": "Three Little Books",
  "zh": "前三本小书复习",
  "pages": [
    {
      "line": "I see Nat.",
      "art": "natStand",
      "zh": "我看见纳特。"
    },
    {
      "line": "\"Sit, Nat!\"",
      "art": "natCall",
      "zh": "“坐下，纳特！”"
    },
    {
      "line": "Nat sat.",
      "art": "natSit",
      "zh": "纳特坐下了。"
    },
    {
      "line": "I pat Nat.",
      "art": "natPat",
      "zh": "我拍拍纳特。"
    },
    {
      "line": "Nat naps.",
      "art": "natNap",
      "zh": "纳特打起盹来。"
    },
    {
      "line": "Nap, Nat, nap!",
      "art": "natDream",
      "zh": "睡吧，纳特，睡吧！"
    },
    {
      "line": "A cat sat.",
      "art": "catSit",
      "zh": "一只猫坐下了。"
    },
    {
      "line": "Dan sat.",
      "art": "danSit",
      "zh": "丹也坐下了。"
    },
    {
      "line": "Dan pats the cat.",
      "art": "danPat",
      "zh": "丹拍拍那只猫。"
    },
    {
      "line": "The cat is sad.",
      "art": "catSad",
      "zh": "那只猫有点难过。"
    },
    {
      "line": "Dan pats it.",
      "art": "danPatIt",
      "zh": "丹又拍拍它。"
    },
    {
      "line": "The cat naps.",
      "art": "catNap",
      "zh": "那只猫睡着了。"
    },
    {
      "line": "The dog is big.",
      "art": "dogBig",
      "zh": "这只狗很大。"
    },
    {
      "line": "The dog dug in the mud.",
      "art": "dogDug",
      "zh": "狗在泥巴里挖呀挖。"
    },
    {
      "line": "Dan got a rag.",
      "art": "danRag",
      "zh": "丹拿来一块抹布。"
    },
    {
      "line": "The dog ran to the log.",
      "art": "dogLog",
      "zh": "狗跑到木头那儿去了。"
    },
    {
      "line": "The cat sat on the log.",
      "art": "catLog",
      "zh": "猫坐在木头上。"
    },
    {
      "line": "Dan can hug the big dog.",
      "art": "danHug",
      "zh": "丹可以抱一抱那只大狗。"
    }
  ]
};

const G1_ROUNDS = {
  "s": {
    "pos": [
      "sat",
      "sit",
      "sip",
      "sun"
    ],
    "neg": [
      "cat",
      "dog",
      "mug",
      "bed"
    ]
  },
  "u": {
    "pos": [
      "sun",
      "cup",
      "mud",
      "nut"
    ],
    "neg": [
      "cat",
      "dog",
      "pig",
      "bed"
    ]
  }
};

const G1_THEME = {
  "s": {
    "title": "听到开头 /s/ 就拍",
    "cmd": "听到开头 /s/ 就拍，其他声音先等一等。",
    "icon": "sun"
  },
  "u": {
    "title": "听到中间 /ʌ/ 就拍",
    "cmd": "听到肚子里的 /ʌ/ 就拍。",
    "icon": "cup"
  }
};

const G3_PAIRS = [
  [
    "sat",
    "sit"
  ],
  [
    "hot",
    "hut"
  ],
  [
    "cot",
    "cut"
  ],
  [
    "not",
    "nut"
  ]
];

const G4_WORDS = [
  "cat",
  "dog",
  "pig",
  "bed",
  "cup",
  "bag"
];

const G5_WHITELIST = [
  "sat",
  "sit",
  "pin",
  "pan",
  "tip",
  "tap",
  "cat",
  "cap",
  "can",
  "kit",
  "pen",
  "pet",
  "hot",
  "hut",
  "cot",
  "cut",
  "not",
  "nut",
  "dog",
  "dig",
  "bag",
  "big",
  "bed",
  "pig",
  "log",
  "mud",
  "hug",
  "sun",
  "cup",
  "fan",
  "leg"
];

const DAYS = [
  {
    "n": 1,
    "wd": "第1天",
    "title": "老朋友，重新拼一遍",
    "goal": "六个老字母重新合体；先读再看图。",
    "sounds": [
      "s",
      "a",
      "t",
      "i",
      "p",
      "n"
    ],
    "steps": [
      {
        "t": "声音热身",
        "min": 4,
        "blocks": [
          {
            "b": "lead",
            "html": "先让孩子看字位说音，再点录音核对。不会的先记下来，今天结束前再试一次。"
          },
          {
            "b": "flash",
            "items": [
              {
                "k": "s"
              },
              {
                "k": "a"
              },
              {
                "k": "t"
              },
              {
                "k": "i"
              },
              {
                "k": "p"
              },
              {
                "k": "n"
              }
            ]
          }
        ]
      },
      {
        "t": "逐音合体，再核对词义",
        "min": 7,
        "blocks": [
          {
            "b": "blend",
            "words": [
              "sat",
              "sit",
              "pin"
            ]
          },
          {
            "b": "words",
            "items": [
              "sat",
              "sit",
              "pin",
              "pan",
              "tip",
              "tap"
            ]
          }
        ]
      },
      {
        "t": "听辨与复习",
        "min": 5,
        "blocks": [
          {
            "b": "pair",
            "pairs": [
              [
                "sat",
                "sit"
              ]
            ]
          }
        ]
      },
      {
        "t": "小书复读",
        "min": 9,
        "blocks": [
          {
            "b": "lead",
            "html": "先让孩子自己读，读完后再点句子核对。不要为了赶页数替孩子念；九分钟到时记住停在哪一页，下次接着读。"
          },
          {
            "b": "book",
            "startPage": 0,
            "endPage": 6
          }
        ]
      },
      {
        "t": "说一句自己的话",
        "min": 3,
        "blocks": [
          {
            "b": "output",
            "html": "请孩子挑书里的一件事，用已经会的句子说出来。可以指着角色说；家长先听完整句，再示范一个需要修正的地方。"
          }
        ]
      },
      {
        "t": "今天的记录",
        "min": 2,
        "blocks": [
          {
            "b": "checks",
            "items": [
              [
                "自己读了今天的词",
                "核对在后，不看图猜词"
              ],
              [
                "独立读了一段小书",
                "需要帮助的地方留给明天"
              ],
              [
                "说出了一句完整的话",
                "让孩子自己说完"
              ]
            ]
          }
        ]
      }
    ]
  },
  {
    "n": 2,
    "wd": "第2天",
    "title": "一音两形，稳住短元音",
    "goal": "认出 c/k 两种字形，复习第二周积木。",
    "sounds": [
      "c",
      "k",
      "e",
      "h",
      "r",
      "m",
      "d"
    ],
    "steps": [
      {
        "t": "声音热身",
        "min": 4,
        "blocks": [
          {
            "b": "lead",
            "html": "先让孩子看字位说音，再点录音核对。不会的先记下来，今天结束前再试一次。"
          },
          {
            "b": "flash",
            "items": [
              {
                "k": "c"
              },
              {
                "k": "k"
              },
              {
                "k": "e"
              },
              {
                "k": "h"
              },
              {
                "k": "r"
              },
              {
                "k": "m"
              },
              {
                "k": "d"
              }
            ]
          }
        ]
      },
      {
        "t": "逐音合体，再核对词义",
        "min": 7,
        "blocks": [
          {
            "b": "blend",
            "words": [
              "cat",
              "cap",
              "can"
            ]
          },
          {
            "b": "words",
            "items": [
              "cat",
              "cap",
              "can",
              "kit",
              "pen",
              "pet"
            ]
          }
        ]
      },
      {
        "t": "听辨与复习",
        "min": 5,
        "blocks": [
          {
            "b": "g1",
            "only": "s"
          }
        ]
      },
      {
        "t": "小书复读",
        "min": 9,
        "blocks": [
          {
            "b": "lead",
            "html": "先让孩子自己读，读完后再点句子核对。不要为了赶页数替孩子念；九分钟到时记住停在哪一页，下次接着读。"
          },
          {
            "b": "book",
            "startPage": 6,
            "endPage": 12
          }
        ]
      },
      {
        "t": "说一句自己的话",
        "min": 3,
        "blocks": [
          {
            "b": "output",
            "html": "请孩子挑书里的一件事，用已经会的句子说出来。可以指着角色说；家长先听完整句，再示范一个需要修正的地方。"
          }
        ]
      },
      {
        "t": "今天的记录",
        "min": 2,
        "blocks": [
          {
            "b": "checks",
            "items": [
              [
                "自己读了今天的词",
                "核对在后，不看图猜词"
              ],
              [
                "独立读了一段小书",
                "需要帮助的地方留给明天"
              ],
              [
                "说出了一句完整的话",
                "让孩子自己说完"
              ]
            ]
          }
        ]
      }
    ]
  },
  {
    "n": 3,
    "wd": "第3天",
    "title": "把 o 和 u 听清楚",
    "goal": "把三个最小对立词组听清、读清。",
    "sounds": [
      "o",
      "u"
    ],
    "steps": [
      {
        "t": "声音热身",
        "min": 4,
        "blocks": [
          {
            "b": "lead",
            "html": "先让孩子看字位说音，再点录音核对。不会的先记下来，今天结束前再试一次。"
          },
          {
            "b": "flash",
            "items": [
              {
                "k": "o"
              },
              {
                "k": "u"
              }
            ]
          }
        ]
      },
      {
        "t": "逐音合体，再核对词义",
        "min": 7,
        "blocks": [
          {
            "b": "blend",
            "words": [
              "hot",
              "hut",
              "cot"
            ]
          },
          {
            "b": "words",
            "items": [
              "hot",
              "hut",
              "cot",
              "cut",
              "not",
              "nut"
            ]
          }
        ]
      },
      {
        "t": "听辨与复习",
        "min": 5,
        "blocks": [
          {
            "b": "pair",
            "pairs": [
              [
                "hot",
                "hut"
              ],
              [
                "cot",
                "cut"
              ],
              [
                "not",
                "nut"
              ]
            ]
          }
        ]
      },
      {
        "t": "小书复读",
        "min": 9,
        "blocks": [
          {
            "b": "lead",
            "html": "先让孩子自己读，读完后再点句子核对。不要为了赶页数替孩子念；九分钟到时记住停在哪一页，下次接着读。"
          },
          {
            "b": "book",
            "startPage": 6,
            "endPage": 12
          }
        ]
      },
      {
        "t": "说一句自己的话",
        "min": 3,
        "blocks": [
          {
            "b": "output",
            "html": "请孩子挑书里的一件事，用已经会的句子说出来。可以指着角色说；家长先听完整句，再示范一个需要修正的地方。"
          }
        ]
      },
      {
        "t": "今天的记录",
        "min": 2,
        "blocks": [
          {
            "b": "checks",
            "items": [
              [
                "自己读了今天的词",
                "核对在后，不看图猜词"
              ],
              [
                "独立读了一段小书",
                "需要帮助的地方留给明天"
              ],
              [
                "说出了一句完整的话",
                "让孩子自己说完"
              ]
            ]
          }
        ]
      }
    ]
  },
  {
    "n": 4,
    "wd": "第4天",
    "title": "读准开头，也读准结尾",
    "goal": "区分清浊辅音，完整读出词尾。",
    "sounds": [
      "b",
      "d",
      "g",
      "c",
      "p",
      "t"
    ],
    "steps": [
      {
        "t": "声音热身",
        "min": 4,
        "blocks": [
          {
            "b": "lead",
            "html": "先让孩子看字位说音，再点录音核对。不会的先记下来，今天结束前再试一次。"
          },
          {
            "b": "flash",
            "items": [
              {
                "k": "b"
              },
              {
                "k": "d"
              },
              {
                "k": "g"
              },
              {
                "k": "c"
              },
              {
                "k": "p"
              },
              {
                "k": "t"
              }
            ]
          }
        ]
      },
      {
        "t": "逐音合体，再核对词义",
        "min": 7,
        "blocks": [
          {
            "b": "blend",
            "words": [
              "dog",
              "dig",
              "bag"
            ]
          },
          {
            "b": "words",
            "items": [
              "dog",
              "dig",
              "bag",
              "big",
              "bed",
              "pig"
            ]
          }
        ]
      },
      {
        "t": "听辨与复习",
        "min": 5,
        "blocks": [
          {
            "b": "g1",
            "only": "u"
          }
        ]
      },
      {
        "t": "小书复读",
        "min": 9,
        "blocks": [
          {
            "b": "lead",
            "html": "先让孩子自己读，读完后再点句子核对。不要为了赶页数替孩子念；九分钟到时记住停在哪一页，下次接着读。"
          },
          {
            "b": "book",
            "startPage": 12,
            "endPage": 18
          }
        ]
      },
      {
        "t": "说一句自己的话",
        "min": 3,
        "blocks": [
          {
            "b": "output",
            "html": "请孩子挑书里的一件事，用已经会的句子说出来。可以指着角色说；家长先听完整句，再示范一个需要修正的地方。"
          }
        ]
      },
      {
        "t": "今天的记录",
        "min": 2,
        "blocks": [
          {
            "b": "checks",
            "items": [
              [
                "自己读了今天的词",
                "核对在后，不看图猜词"
              ],
              [
                "独立读了一段小书",
                "需要帮助的地方留给明天"
              ],
              [
                "说出了一句完整的话",
                "让孩子自己说完"
              ]
            ]
          }
        ]
      }
    ]
  },
  {
    "n": 5,
    "wd": "第5天",
    "title": "不看图，先自己读",
    "goal": "复习已学的四音词，完成一轮裸读。",
    "sounds": [
      "l",
      "f"
    ],
    "steps": [
      {
        "t": "声音热身",
        "min": 4,
        "blocks": [
          {
            "b": "lead",
            "html": "先让孩子看字位说音，再点录音核对。不会的先记下来，今天结束前再试一次。"
          },
          {
            "b": "flash",
            "items": [
              {
                "k": "l"
              },
              {
                "k": "f"
              }
            ]
          }
        ]
      },
      {
        "t": "逐音合体，再核对词义",
        "min": 7,
        "blocks": [
          {
            "b": "blend",
            "words": [
              "frog",
              "flag",
              "golf"
            ]
          },
          {
            "b": "words",
            "items": [
              "frog",
              "flag",
              "golf",
              "log",
              "mud",
              "hug"
            ]
          }
        ]
      },
      {
        "t": "三十秒裸读",
        "min": 5,
        "blocks": [
          {
            "b": "flash",
            "items": [
              {
                "k": "w",
                "v": "sat"
              },
              {
                "k": "w",
                "v": "sit"
              },
              {
                "k": "w",
                "v": "cat"
              },
              {
                "k": "w",
                "v": "cap"
              },
              {
                "k": "w",
                "v": "pen"
              },
              {
                "k": "w",
                "v": "pet"
              },
              {
                "k": "w",
                "v": "hot"
              },
              {
                "k": "w",
                "v": "hut"
              },
              {
                "k": "w",
                "v": "dog"
              },
              {
                "k": "w",
                "v": "dig"
              },
              {
                "k": "w",
                "v": "cup"
              },
              {
                "k": "w",
                "v": "mud"
              }
            ],
            "timed": true,
            "recKey": "flash_words"
          },
          {
            "b": "note",
            "html": "只记录这一轮读到的张数，不设晋级速度线。读完或三十秒到时结算；中途停下不记成绩。"
          }
        ]
      },
      {
        "t": "小书复读",
        "min": 9,
        "blocks": [
          {
            "b": "lead",
            "html": "先让孩子自己读，读完后再点句子核对。不要为了赶页数替孩子念；九分钟到时记住停在哪一页，下次接着读。"
          },
          {
            "b": "book",
            "startPage": 12,
            "endPage": 18
          }
        ]
      },
      {
        "t": "说一句自己的话",
        "min": 3,
        "blocks": [
          {
            "b": "output",
            "html": "请孩子挑书里的一件事，用已经会的句子说出来。可以指着角色说；家长先听完整句，再示范一个需要修正的地方。"
          }
        ]
      },
      {
        "t": "今天的记录",
        "min": 2,
        "blocks": [
          {
            "b": "checks",
            "items": [
              [
                "自己读了今天的词",
                "核对在后，不看图猜词"
              ],
              [
                "独立读了一段小书",
                "需要帮助的地方留给明天"
              ],
              [
                "说出了一句完整的话",
                "让孩子自己说完"
              ]
            ]
          }
        ]
      }
    ]
  },
  {
    "n": 6,
    "wd": "第6天",
    "title": "三本小书，再读一次",
    "goal": "记录十九块积木的用时，独立复读三本小书。",
    "sounds": [
      "s",
      "a",
      "t",
      "i",
      "p",
      "n",
      "c",
      "k",
      "e",
      "h",
      "r",
      "m",
      "d",
      "g",
      "o",
      "u",
      "l",
      "f",
      "b"
    ],
    "steps": [
      {
        "t": "十九块积木计时（只记录）",
        "min": 4,
        "blocks": [
          {
            "b": "lead",
            "html": "先让孩子看字位说音，再点录音核对。不会的先记下来，今天结束前再试一次。"
          },
          {
            "b": "flash",
            "items": [
              {
                "k": "s"
              },
              {
                "k": "a"
              },
              {
                "k": "t"
              },
              {
                "k": "i"
              },
              {
                "k": "p"
              },
              {
                "k": "n"
              },
              {
                "k": "c"
              },
              {
                "k": "k"
              },
              {
                "k": "e"
              },
              {
                "k": "h"
              },
              {
                "k": "r"
              },
              {
                "k": "m"
              },
              {
                "k": "d"
              },
              {
                "k": "g"
              },
              {
                "k": "o"
              },
              {
                "k": "u"
              },
              {
                "k": "l"
              },
              {
                "k": "f"
              },
              {
                "k": "b"
              }
            ],
            "timed": true,
            "recKey": "flash_sounds"
          }
        ]
      },
      {
        "t": "逐音合体，再核对词义",
        "min": 7,
        "blocks": [
          {
            "b": "blend",
            "words": [
              "cat",
              "dog",
              "sun"
            ]
          },
          {
            "b": "words",
            "items": [
              "cat",
              "dog",
              "sun",
              "cup",
              "fan",
              "leg"
            ]
          }
        ]
      },
      {
        "t": "听辨与复习",
        "min": 5,
        "blocks": [
          {
            "b": "g1",
            "only": "u"
          }
        ]
      },
      {
        "t": "复读三本小书",
        "min": 9,
        "blocks": [
          {
            "b": "lead",
            "html": "先让孩子自己读，读完后再点句子核对。不要为了赶页数替孩子念；九分钟到时记住停在哪一页，下次接着读。"
          },
          {
            "b": "book",
            "startPage": 0,
            "endPage": 18
          }
        ]
      },
      {
        "t": "说一句自己的话",
        "min": 3,
        "blocks": [
          {
            "b": "output",
            "html": "请孩子挑书里的一件事，用已经会的句子说出来。可以指着角色说；家长先听完整句，再示范一个需要修正的地方。"
          }
        ]
      },
      {
        "t": "今天的记录",
        "min": 2,
        "blocks": [
          {
            "b": "checks",
            "items": [
              [
                "自己读了今天的词",
                "核对在后，不看图猜词"
              ],
              [
                "独立读了一段小书",
                "需要帮助的地方留给明天"
              ],
              [
                "说出了一句完整的话",
                "让孩子自己说完"
              ]
            ]
          }
        ]
      }
    ]
  },
  {
    "n": 7,
    "wd": "第七天",
    "title": "轻松玩，留下第一份基线",
    "goal": "两组共十词；另记月测阅读。累了可以分两次做。",
    "sounds": [],
    "rest": true,
    "steps": [
      {
        "t": "声音游戏（可选）",
        "min": 5,
        "blocks": [
          {
            "b": "g1"
          }
        ]
      },
      {
        "t": "点单游戏（可选）",
        "min": 5,
        "blocks": [
          {
            "b": "g4"
          }
        ]
      },
      {
        "t": "造词工坊（测后可选）",
        "min": 5,
        "blocks": [
          {
            "b": "g5"
          }
        ]
      },
      {
        "t": "第一组：周检",
        "min": 5,
        "blocks": [
          {
            "b": "exam"
          },
          {
            "b": "checks",
            "items": [
              [
                "完成第一组，记录读对几个",
                "先独立读，不提示"
              ],
              [
                "已经决定下一周怎么走",
                "第二组完成后看十词基线建议"
              ]
            ]
          }
        ]
      },
      {
        "t": "第二组：备用词基线",
        "min": 5,
        "blocks": [
          {
            "b": "note",
            "html": "第四周需要两组都做，用于十词基线；这与普通周只有需要时才复测不同。准备好再打开，别提前展示。"
          },
          {
            "b": "retest"
          },
          {
            "b": "baseline"
          }
        ]
      },
      {
        "t": "月测阅读（可分开做）",
        "min": 12,
        "blocks": [
          {
            "b": "note",
            "html": "这段短文不练习、不点读、不配图。请孩子独立读；家长计错，读完问一件主要事件。疲劳时另找一个安静时间完成。"
          },
          {
            "b": "assessment"
          }
        ]
      }
    ]
  }
];

const W = {
  "a": {
    "zh": "一个",
    "art": null
  },
  "bag": {
    "zh": "袋子",
    "art": "bag"
  },
  "bed": {
    "zh": "床",
    "art": "bed"
  },
  "big": {
    "zh": "大的",
    "art": "big"
  },
  "can": {
    "zh": "罐头",
    "art": "can"
  },
  "cap": {
    "zh": "鸭舌帽",
    "art": "cap"
  },
  "cat": {
    "zh": "猫",
    "art": "cat"
  },
  "cot": {
    "zh": "小床",
    "art": "cot"
  },
  "cup": {
    "zh": "杯子",
    "art": "cup"
  },
  "cut": {
    "zh": "切",
    "art": "cut"
  },
  "dan": {
    "zh": "丹",
    "art": "dan"
  },
  "dig": {
    "zh": "挖",
    "art": "dig"
  },
  "dog": {
    "zh": "狗",
    "art": "dog"
  },
  "dug": {
    "zh": "挖了",
    "art": "dug"
  },
  "fan": {
    "zh": "风扇",
    "art": "fan"
  },
  "flag": {
    "zh": "旗子",
    "art": "flag"
  },
  "frog": {
    "zh": "青蛙",
    "art": "frog"
  },
  "golf": {
    "zh": "高尔夫",
    "art": "golf"
  },
  "got": {
    "zh": "拿到了",
    "art": "got"
  },
  "hot": {
    "zh": "热的",
    "art": "hot"
  },
  "hug": {
    "zh": "抱一抱",
    "art": "hug"
  },
  "hut": {
    "zh": "小屋",
    "art": "hut"
  },
  "i": {
    "zh": "我",
    "art": null
  },
  "in": {
    "zh": "在里面",
    "art": null
  },
  "is": {
    "zh": "是",
    "art": null
  },
  "it": {
    "zh": "它",
    "art": null
  },
  "kit": {
    "zh": "工具包",
    "art": "kit"
  },
  "leg": {
    "zh": "腿",
    "art": "leg"
  },
  "log": {
    "zh": "木头",
    "art": "log"
  },
  "mud": {
    "zh": "泥巴",
    "art": "mud"
  },
  "mug": {
    "zh": "马克杯",
    "art": "mug"
  },
  "nap": {
    "zh": "打个盹",
    "art": "nap"
  },
  "naps": {
    "zh": "在打盹",
    "art": "natNap"
  },
  "nat": {
    "zh": "纳特",
    "art": "nat"
  },
  "not": {
    "zh": "不",
    "art": "not"
  },
  "nut": {
    "zh": "坚果",
    "art": "nut"
  },
  "on": {
    "zh": "在……上",
    "art": null
  },
  "pan": {
    "zh": "平底锅",
    "art": "pan"
  },
  "pat": {
    "zh": "轻轻拍",
    "art": "natPat"
  },
  "pats": {
    "zh": "轻拍",
    "art": "pats"
  },
  "pen": {
    "zh": "钢笔",
    "art": "pen"
  },
  "pet": {
    "zh": "宠物",
    "art": "pet"
  },
  "pig": {
    "zh": "猪",
    "art": "pig"
  },
  "pin": {
    "zh": "大头针",
    "art": "pin"
  },
  "rag": {
    "zh": "抹布",
    "art": "rag"
  },
  "ran": {
    "zh": "跑了",
    "art": "ran"
  },
  "sad": {
    "zh": "难过",
    "art": "sad"
  },
  "sat": {
    "zh": "坐下了",
    "art": "natSit"
  },
  "see": {
    "zh": "看见",
    "art": null
  },
  "sip": {
    "zh": "小口喝",
    "art": null
  },
  "sit": {
    "zh": "坐",
    "art": "natSit"
  },
  "sun": {
    "zh": "太阳",
    "art": "sun"
  },
  "tap": {
    "zh": "水龙头",
    "art": "tap"
  },
  "the": {
    "zh": "这个 / 那个",
    "art": null
  },
  "tip": {
    "zh": "小费",
    "art": "tip"
  },
  "to": {
    "zh": "到……去",
    "art": null
  }
};
