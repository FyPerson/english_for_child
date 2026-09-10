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
const { ENTRY_KINDS, BLOCK_TYPE_CATALOG, collectWordConsumption, usedWordSet, findConsumptionOf } = require('../../tools/validation/word_consumers');
const { loadData } = require('../../tools/validation/load_data');
const { isExemptConsumptionRecord } = require('../../tools/validation/exemptions');

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

// ---- M1（轮 D 复审第三轮，外审 medium，2026-09-10）：g1-rounds 记录的
// bucket/week 字段存在性直测 ----
// tools/validation/exemptions.js 的 isExemptConsumptionRecord 依赖 g1-rounds
// 记录带 bucket（'pos'/'neg'）与调用方另传的 week 才能正确判定豁免——这里直接
// 断言 collectWordConsumption 产出的 g1-rounds 记录确实带着这些字段，不是"恰好
// 目前豁免判据用不到就没人发现字段丢了"。
{
  const syntheticRecords = collectWordConsumption(syntheticBox());
  const posRec = syntheticRecords.find(r => r.kind === 'g1-rounds' && r.word.toLowerCase() === 'xyzg1pos');
  const negRec = syntheticRecords.find(r => r.kind === 'g1-rounds' && r.word.toLowerCase() === 'xyzg1neg');
  assert(posRec, '合成 box 的 G1 pos 桶词应产出一条 g1-rounds 记录');
  assert(negRec, '合成 box 的 G1 neg 桶词应产出一条 g1-rounds 记录');
  assert.equal(posRec.bucket, 'pos', `pos 桶记录的 bucket 字段应为 'pos'，实际：${JSON.stringify(posRec.bucket)}`);
  assert.equal(negRec.bucket, 'neg', `neg 桶记录的 bucket 字段应为 'neg'，实际：${JSON.stringify(negRec.bucket)}`);
  assert.equal(posRec.week, 99, `pos 桶记录的 week 字段应等于 META.week（99），实际：${JSON.stringify(posRec.week)}`);
  assert.equal(negRec.week, 99, `neg 桶记录的 week 字段应等于 META.week（99），实际：${JSON.stringify(negRec.week)}`);
  console.log('PASS word_consumers（M1）：合成 box 的 G1 pos/neg 桶记录均带正确的 bucket 与 week 字段');
}
{
  // 真实 W1 数据同样核实一遍——不是只有合成 box 才恰好带对，真实生产数据的
  // g1-rounds 记录也必须带 bucket/week，两者都要能对上。
  const fs2 = require('node:fs'), path2 = require('node:path');
  const root2 = path2.resolve(__dirname, '..', '..');
  const week01Raw = fs2.readFileSync(path2.join(root2, 'frontend', 'src', 'weeks', 'week01.data.js'), 'utf8');
  const week01Box = loadData(week01Raw, false);
  const week01Records = collectWordConsumption(week01Box);
  const g1Records = week01Records.filter(r => r.kind === 'g1-rounds');
  assert(g1Records.length > 0, '真实 W1 数据应该有 g1-rounds 记录，检查 week01.data.js 是否已变');
  const posSample = g1Records.find(r => r.bucket === 'pos');
  const negSample = g1Records.find(r => r.bucket === 'neg');
  assert(posSample, '真实 W1 数据应该至少有一条 bucket==="pos" 的 g1-rounds 记录');
  assert(negSample, '真实 W1 数据应该至少有一条 bucket==="neg" 的 g1-rounds 记录');
  assert.equal(posSample.week, 1, `真实 W1 pos 记录的 week 应为 1，实际：${JSON.stringify(posSample.week)}`);
  assert.equal(negSample.week, 1, `真实 W1 neg 记录的 week 应为 1，实际：${JSON.stringify(negSample.week)}`);
  g1Records.forEach(r => assert(r.bucket === 'pos' || r.bucket === 'neg',
    `真实 W1 数据的每条 g1-rounds 记录都应该带合法 bucket（'pos'/'neg'），实际有一条：${JSON.stringify(r)}`));
  console.log(`PASS word_consumers（M1）：真实 W1 数据的 ${g1Records.length} 条 g1-rounds 记录均带合法 bucket（'pos'/'neg'）与 week（1）字段`);
}
{
  // 反例：bucket 缺失/非法时，isExemptConsumptionRecord 必须显式抛结构化错误
  // （code: 'g1-rounds-missing-bucket'），不能因为字段缺失就静默落到"不豁免"——
  // 那样看起来像是"碰巧判定正确"，掩盖了 word_consumers.js 抽取器本身的契约缺陷。
  let caught = null;
  try { isExemptConsumptionRecord({ kind: 'g1-rounds', word: 'xyz' }, { week: 1 }); }
  catch (e) { caught = e; }
  assert(caught, 'bucket 字段缺失时应该抛错，不是碰巧返回某个布尔值');
  assert.equal(caught.code, 'g1-rounds-missing-bucket', `抛错的 code 应为 'g1-rounds-missing-bucket'，实际：${caught.code}`);

  let caught2 = null;
  try { isExemptConsumptionRecord({ kind: 'g1-rounds', word: 'xyz', bucket: 'not-a-real-bucket' }, { week: 1 }); }
  catch (e) { caught2 = e; }
  assert(caught2, 'bucket 字段是非法值（既不是 pos 也不是 neg）时同样应该抛错');
  assert.equal(caught2.code, 'g1-rounds-missing-bucket', `抛错的 code 应为 'g1-rounds-missing-bucket'，实际：${caught2.code}`);
  console.log('PASS word_consumers（M1 反例）：g1-rounds 记录 bucket 缺失/非法值时，isExemptConsumptionRecord 显式抛出结构化错误（g1-rounds-missing-bucket），不是碰巧不豁免');
}

// ---- I-M1（段 3 第九批，外审 medium，2026-09-10）：g1-rounds pos 桶的周次判定
// 改前只信 options.week，完全忽略 rec.week；改后优先信 rec.week，两者都给时必须
// 一致，两者都没给要抛错。三组缺失/非法/不一致反例 + 两组正例（只给一边）。 ----
{
  // 正例①：只给 rec.week（options 没有 week），应正常按 rec.week=1 判豁免。
  assert.equal(
    isExemptConsumptionRecord({ kind: 'g1-rounds', bucket: 'pos', word: 'cat', week: 1 }, {}),
    true,
    'I-M1 正例①：只提供 rec.week=1 时，pos 桶应按它豁免'
  );
  assert.equal(
    isExemptConsumptionRecord({ kind: 'g1-rounds', bucket: 'pos', word: 'cat', week: 2 }, {}),
    false,
    'I-M1 正例①：只提供 rec.week=2（非第一周）时，pos 桶不应豁免'
  );
  // 正例②：只给 options.week（rec 没有 week 字段），应正常按 options.week 判豁免
  // ——与改前行为一致，不能因为这次修复而破坏"只传 options.week"这条既有调用习惯
  // （test_grapheme_semantics.js 的合成 TABLE 用例正是这种调用形态）。
  assert.equal(
    isExemptConsumptionRecord({ kind: 'g1-rounds', bucket: 'pos', word: 'cat' }, { week: 1 }),
    true,
    'I-M1 正例②：只提供 options.week=1 时，pos 桶应按它豁免'
  );

  // 反例①：rec.week 与 options.week 都给，但不一致——必须抛错，不能悄悄择一采信。
  {
    let caught = null;
    try {
      isExemptConsumptionRecord({ kind: 'g1-rounds', bucket: 'pos', word: 'cat', week: 1 }, { week: 2 });
    } catch (e) { caught = e; }
    assert(caught, 'I-M1 反例①：rec.week（1）与 options.week（2）不一致时应该抛错');
    assert.equal(caught.code, 'g1-rounds-week-mismatch', `I-M1 反例①：抛错的 code 应为 'g1-rounds-week-mismatch'，实际：${caught.code}`);
  }

  // 反例②：rec.week 与 options.week 均缺失——pos 桶豁免判据无法判定，必须抛错，
  // 不能悄悄当成"不是第一周"处理成 false（那看起来像是"碰巧判对"）。
  {
    let caught = null;
    try {
      isExemptConsumptionRecord({ kind: 'g1-rounds', bucket: 'pos', word: 'cat' }, {});
    } catch (e) { caught = e; }
    assert(caught, 'I-M1 反例②：rec.week 与 options.week 均未提供时应该抛错');
    assert.equal(caught.code, 'g1-rounds-week-missing', `I-M1 反例②：抛错的 code 应为 'g1-rounds-week-missing'，实际：${caught.code}`);
  }

  // 反例③：rec.week 是非法值（非正整数）——即使 options.week 合法，也应该抛错，
  // 不能悄悄忽略 rec.week 转而只信 options.week（那样又回到了改前的旧行为）。
  {
    let caught = null;
    try {
      isExemptConsumptionRecord({ kind: 'g1-rounds', bucket: 'pos', word: 'cat', week: 0 }, { week: 1 });
    } catch (e) { caught = e; }
    assert(caught, 'I-M1 反例③：rec.week=0（非法正整数）时应该抛错');
    assert.equal(caught.code, 'g1-rounds-invalid-rec-week', `I-M1 反例③：抛错的 code 应为 'g1-rounds-invalid-rec-week'，实际：${caught.code}`);
  }

  console.log('PASS word_consumers（I-M1）：g1-rounds pos 桶周次判定优先信 rec.week，两者都给必须一致，均缺失/rec.week 非法时显式抛错（不悄悄只信 options.week）');
}

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

// ============================================================================
// ④（codex high③）：BLOCK_TYPE_CATALOG 必须覆盖规范 v2.0 §3「DAYS 结构与块类型」表
// 的全部 24 种块类型（第 233-254 行，逐字照抄，未自己重列），其中恰好 8 种是词消费块
// （与 ENTRY_KINDS 里 DAYS 块级那 8 个一一对应：blend/initialpick/words/pair/sight/
// flash/sentences/wordforge），其余 16 种非词消费块各有排除理由；catalog 之外的块类型
// 必须显式报错，不能被静默跳过。
// ============================================================================
const SPEC_BLOCK_TYPES_24 = [
  'lead', 'list', 'note', 'sound', 'blend', 'words', 'sight', 'sentences', 'pair',
  'initialpick', 'flash', 'book', 'table', 'checks', 'g1', 'g4', 'g5', 'output',
  'exam', 'assessment', 'baseline', 'retest', 'probe', 'wordforge'
]; // 逐字抄自《周课件数据层交接规范 v2.0》§3 第 233-254 行的块类型表，与
   // frontend/src/shared/render-blocks.js 的全部 case 已逐一对齐（规范原文自述"24 种"）

assert.equal(SPEC_BLOCK_TYPES_24.length, 24, '规范 §3 块类型表应为 24 种（表自述数字）');
assert.equal(Object.keys(BLOCK_TYPE_CATALOG).length, 24, 'BLOCK_TYPE_CATALOG 应覆盖全部 24 种块类型，一种不多一种不少');
SPEC_BLOCK_TYPES_24.forEach(type => assert(type in BLOCK_TYPE_CATALOG, `BLOCK_TYPE_CATALOG 缺少规范点名的块类型 "${type}"`));
Object.keys(BLOCK_TYPE_CATALOG).forEach(type => assert(SPEC_BLOCK_TYPES_24.includes(type), `BLOCK_TYPE_CATALOG 里的 "${type}" 不在规范 §3 的 24 种块类型表里，是不是拼错了`));

const consumingTypes = Object.entries(BLOCK_TYPE_CATALOG).filter(([, v]) => v.consumesWords).map(([k]) => k).sort();
assert.equal(consumingTypes.length, 8, `24 种块类型里应恰好 8 种是词消费块，实际 ${consumingTypes.length}`);
assert.deepEqual(consumingTypes, ['blend', 'flash', 'initialpick', 'pair', 'sentences', 'sight', 'wordforge', 'words'].sort(),
  '词消费块的集合应恰好是 blend/flash/initialpick/pair/sentences/sight/wordforge/words');
// 非词消费的 16 种各自都要有一句排除理由，不能留空
Object.entries(BLOCK_TYPE_CATALOG).filter(([, v]) => !v.consumesWords).forEach(([type, v]) => {
  assert(typeof v.reason === 'string' && v.reason.length > 0, `非词消费块 "${type}" 必须有排除理由（reason）`);
});
console.log(`PASS word_consumers（codex high③）：BLOCK_TYPE_CATALOG 逐字覆盖规范 §3 全部 24 种块类型（照抄第 233-254 行），其中 8 种是词消费块，其余 16 种各有排除理由`);

// catalog 之外的块类型必须显式失败，不能被静默跳过
const unknownBlockBox = {
  META: { week: 1 }, DAYS: [{ n: 1, steps: [{ t: '', min: 30, blocks: [{ b: 'not-a-real-block-type' }] }] }],
  BOOK: null, G1_ROUNDS: {}, G3_PAIRS: [], G4_WORDS: [], G5_WHITELIST: [], WALL_HINT: {}
};
assert.throws(() => collectWordConsumption(unknownBlockBox),
  e => e.code === 'unknown-block-type' && e.blockType === 'not-a-real-block-type',
  'collectWordConsumption 遇到 catalog 之外的块类型（如未来新增而没登记的块）必须显式报错，不能被 switch 的 default 静默跳过');
console.log('PASS word_consumers（codex high③）：未登记的块类型触发显式报错（code=unknown-block-type），不再是静默 default:break');
