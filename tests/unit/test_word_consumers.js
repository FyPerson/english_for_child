/* 里程碑 2 第 3 步：tools/validation/word_consumers.js 的覆盖率与排除面单测。
 * 覆盖清单对应 docs/里程碑2实施方案_20260908_v1.7.md §4 分步实施表第 3 步验收：
 * "语料来源必须是共享的词消费抽取器……测试要断言各生产入口均被覆盖"。
 *
 * 两组断言：
 *   ① 正例——一个覆盖全部已知入口的合成 box，逐个入口断言抽取器真的收到了那个词；
 *   ② 反例——RESERVED / SOUNDS.demo / G1_THEME 三类"看着像词、但按规范不该被当作
 *      消费入口"的位置，断言抽取器确实没有收进来（防止将来有人图省事按"递归抓全部
 *      字符串"实现，把测评池、纯听力示范词也吞进去）。
 *   ③ 对真实 week02 数据做回归：直接证明 wordforge 与 BOOK.pages 这两个
 *      check_data.js:57-71 漏掉的入口，现在确实被收了进来。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ENTRY_KINDS, collectWordConsumption, usedWordSet, findConsumptionOf } = require('../../tools/validation/word_consumers');
const { loadData } = require('../../tools/validation/load_data');

// ---- ① 正例：合成 box，覆盖 ENTRY_KINDS 列出的全部入口 ----
function syntheticBox() {
  return {
    META: { week: 99 },
    RESERVED: ['xyzreserved'],          // 反例素材，见下
    SOUNDS: {
      a: { grapheme: 'a', type: 'v', demo: [['xyzdemo', '示范']] }
    },
    W: {},
    WALL_HINT: { xyzwallhint: { en: 'xyz wall hint', zh: '', say: true } },
    BOOK: { title: 't', zh: 'z', pages: [{ line: 'Xyzbookpage is here.', art: 'a', zh: 'z' }] },
    FIRST_TEACH_DAY: {},
    G1_ROUNDS: { a: { pos: ['xyzg1pos'], neg: ['xyzg1neg'] } },
    G1_THEME: { a: { title: 'xyzg1theme should not leak', icon: 'a', cmd: 'xyzg1themecmd' } },
    G3_PAIRS: [['xyzg3a', 'xyzg3b']],
    G4_WORDS: ['xyzg4word'],
    G5_WHITELIST: ['xyzg5word'],
    DAYS: [
      {
        n: 1, wd: '', title: '', goal: '',
        steps: [{
          t: '', min: 30,
          blocks: [
            { b: 'blend', words: ['xyzblend'] },
            { b: 'initialpick', words: ['xyzinitialpick'], letters: ['x'] },
            { b: 'words', items: ['xyzwordsblock'] },
            { b: 'pair', pairs: [['xyzdaypaira', 'xyzdaypairb']] },
            { b: 'sight', items: [['xyzsight', '中文']] },
            { b: 'flash', items: [{ k: 'w', v: 'xyzflashword' }, { k: 'a' }] },
            { b: 'sentences', items: [['Xyzsentenceword is here.', '中文']] },
            { b: 'wordforge', mode: 'family', families: [{ tail: 'amily', heads: ['xyzf'] }] },
            { b: 'wordforge', mode: 'swap', pairs: [['xyzswapfrom', 'xyzswapword']] }
          ]
        }]
      }
    ]
  };
}

const records = collectWordConsumption(syntheticBox());
const words = new Set(records.map(r => r.word.toLowerCase()));
const kinds = new Set(records.map(r => r.kind));

// 每个 ENTRY_KINDS 声明的入口都真的产出过至少一条记录——防止"声明了但代码没实现"。
ENTRY_KINDS.forEach(kind => assert(kinds.has(kind), `ENTRY_KINDS 声明的入口 "${kind}" 没有任何记录产出，抽取器与声明脱节`));
assert.equal(kinds.size, ENTRY_KINDS.length, '抽取器产出的 kind 集合与 ENTRY_KINDS 声明不完全一致（多了或少了）');

const expectWord = w => assert(words.has(w.toLowerCase()), `期望被收录的词 "${w}" 没有出现在抽取结果里`);
expectWord('xyzblend');
expectWord('xyzinitialpick');
expectWord('xyzwordsblock');
expectWord('xyzdaypaira'); expectWord('xyzdaypairb');
expectWord('xyzsight');
expectWord('xyzflashword');
expectWord('xyzsentenceword');            // 来自整句分词
expectWord('xyzfamily');                   // wordforge family: head('xyzf') + tail('amily')
expectWord('xyzswapfrom'); expectWord('xyzswapword');   // wordforge swap
expectWord('xyzbookpage');                 // BOOK.pages —— 已知缺口之一
expectWord('xyzg1pos'); expectWord('xyzg1neg');
expectWord('xyzg3a'); expectWord('xyzg3b');
expectWord('xyzg4word');
expectWord('xyzg5word');
expectWord('xyzwallhint');
console.log('PASS word_consumers: 全部 15 类已知生产入口（含 wordforge 两种模式与 BOOK.pages）均被收录');

// ---- ② 反例：三类明确不该被收录的位置 ----
assert(!words.has('xyzreserved'), 'RESERVED 词不该被当作消费入口收录（会让"泄漏检测"自证自明）');
assert(!words.has('xyzdemo'), 'SOUNDS[id].demo 的示范词不该被收录（允许含未教字位的纯听力展示，非解码内容）');
assert(!words.has('xyzg1theme') && !words.has('xyzg1themecmd'), 'G1_THEME 的展示文案不该被当作词条收录');
console.log('PASS word_consumers: RESERVED / SOUNDS.demo / G1_THEME 三类正确排除，不进入消费集合');

// ---- usedWordSet / findConsumptionOf 基础行为 ----
const box2 = syntheticBox();
assert(usedWordSet(box2).has('xyzblend'), 'usedWordSet 应包含 collectWordConsumption 收到的词（小写归一）');
assert.equal(findConsumptionOf(box2, 'XYZBLEND').length, 1, 'findConsumptionOf 应大小写不敏感地定位到消费记录');
assert.equal(findConsumptionOf(box2, 'xyzreserved').length, 0, 'RESERVED 词理应查无消费记录');
console.log('PASS word_consumers: usedWordSet / findConsumptionOf 基础行为');

// ---- ③ 真实数据回归：week02 的 wordforge 与 BOOK.pages 内容确实被收录 ----
const week02Path = path.resolve(__dirname, '..', '..', 'frontend/src/weeks/week02.data.js');
const raw = fs.readFileSync(week02Path, 'utf8');
const box = loadData(raw, false);
const realWords = usedWordSet(box);
// week02.data.js:262 wordforge family {tail:'at', heads:['c','h','p','s']} -> cat/hat/pat/sat
['cat', 'hat', 'pat', 'sat'].forEach(w => assert(realWords.has(w), `真实 week02 wordforge family 应产出 "${w}"（check_data.js 现状漏掉这条入口）`));
// week02.data.js:296 wordforge swap pairs 含 ['hat','rat'] 等，两侧都应收录
['hat', 'rat', 'hip', 'rip', 'can', 'ran'].forEach(w => assert(realWords.has(w), `真实 week02 wordforge swap 应产出 "${w}"`));
// week02 BOOK.pages 里的正文词（任取一个高置信度会出现的词：书名/正文用到的 hen 系列词）
const week02Box = loadData(raw, false);
assert(Array.isArray(week02Box.BOOK.pages) && week02Box.BOOK.pages.length > 0, 'week02 BOOK.pages 应非空，用于下面断言');
const bookText = week02Box.BOOK.pages.map(p => p.line).join(' ').toLowerCase();
const bookFirstWord = (bookText.match(/[a-z]+/) || [])[0];
assert(bookFirstWord, 'week02 BOOK.pages 应至少含一个可分词的英文词');
assert(realWords.has(bookFirstWord), `真实 week02 BOOK.pages 首个词 "${bookFirstWord}" 应出现在抽取结果里（check_data.js 现状漏掉这条入口）`);
console.log('PASS word_consumers: 真实 week02 数据的 wordforge / BOOK.pages 回归（原 usedWords 已知缺口）');
