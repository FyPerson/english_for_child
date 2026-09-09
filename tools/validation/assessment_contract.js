const GLOBAL_POOL = 'shelf shaft chimp chunk quilt quest moist hoist thorn north bleed greed groan float trail snail fried tried plum slug crust trust spoon stool wink honk yelp yank jump jolt shake flake stripe spine globe stove cube mule scarf shark'.split(' ');
const tokens = text => String(text || '').replace(/<[^>]*>/g, ' ').toLowerCase().match(/[a-z]+/g) || [];
const normalize = text => tokens(text).join(' ');

/* 里程碑 2 第 5 步：`assessmentMode` 最小路由（方案 §0.3）。
 * weekly 列的必需/禁止清单——按这份清单计数，不要数规范矩阵表格的行数
 * （PROBE_A/PROBE_B 在表里合并显示成一行，数行会得到 7，实际是 8 项）。 */
const WEEKLY_FORBIDDEN_CONSTANTS = ['RESERVED_RETEST', 'ASSESS_TEXT', 'GLOBAL_RESERVED', 'PROBE_A', 'PROBE_B', 'ANNUAL_DECODING'];
const WEEKLY_FORBIDDEN_BLOCKS = ['retest', 'probe'];

/* 收集"教学内容里出现过的全部原始文本片段"（未归一化，未拆词）。weekly 的泄漏检测只需要
 * 归一化后的词集合，monthly（W4）的整句复用/全文复用检测还需要原始文本做句子级切分，
 * 所以底层先统一收集 textParts，两条路径各自在其上派生自己需要的形态，避免维护两份
 * 几乎相同的 visit() 遍历逻辑。
 *
 * `includeDictionary`（默认 true，monthly 走默认值，逐字保留重构前行为）控制是否把
 * `Object.keys(d.W)` / `Object.values(d.W)` 也算进"可见文本"。monthly（W4）的 RESERVED
 * 系列词按 check_data.js:80 现状对 week>=4 豁免"必须在 W 里有释义"，实测也确实不在 W
 * 里——包含 W 不会造成自我冲突。但 weekly（W1-W3）恰恰相反：`DATA-RESERVED-01` 要求
 * RESERVED 词必须在 W 里有释义（上面 `周检词在 W 里没有释义` 那段校验），若这里仍把
 * W 算进"可见文本"，RESERVED 词会因为自己的词典释义键而判定"泄漏进教学内容"——
 * 那是一个词典查阅入口，不是练习/游戏，`weekly 列` 的"不泄漏进练习/游戏"语义上不包含它。
 * 所以 weekly 分支显式传 `{includeDictionary:false}`，monthly 不传，维持原语义。 */
function collectTextParts(d, teachingBlocks, options) {
  const includeDictionary = !options || options.includeDictionary !== false;
  const textParts = [];
  function visit(v) {
    if (typeof v === 'string') textParts.push(v);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  }
  // Cover all teaching fields, not just a hand-picked set of block properties.
  visit(teachingBlocks); visit(d.BOOK); visit(d.WALL_HINT); visit(d.SOUNDS);
  visit(d.G1_ROUNDS); visit(d.G1_THEME); visit(d.G3_PAIRS); visit(d.G4_WORDS); visit(d.G5_WHITELIST);
  visit(d.DAYS.map(day => [day.title, day.goal, day.wd, ...day.steps.map(s => s.t)]));
  if (includeDictionary) { visit(Object.keys(d.W)); visit(Object.values(d.W)); }
  return textParts;
}

function visibleWordSet(textParts) {
  return new Set(textParts.flatMap(tokens));
}

/* 巩固周专项检查：与 assessmentMode 无关（任何一周都可能是巩固周），独立于路由之外，
 * 每条分支都要跑。四周现有数据里只有 W4 声明 consolidation:true，W1-W3 声明 false，
 * 所以这条检查对 weekly 分支目前是 no-op，接入路由后不会引入新的 fail。 */
function checkConsolidation(d, blocks, fail) {
  if (!d.META.consolidation) return;
  if (Object.keys(d.FIRST_TEACH_DAY).length) fail('巩固周不得声明新字位首教日');
  for (const [label, kinds] of [['拼读', ['blend']], ['阅读', ['book', 'sentences']], ['输出', ['output']], ['打卡', ['checks']]]) {
    if (!blocks.some(b => kinds.includes(b.b))) fail(`巩固周缺少${label}块`);
  }
}

/* weekly 列：规范 §4.3——必需 RESERVED；禁止 6 个常量 + 2 个块类型；RESERVED 自身的
 * 共用校验（5 词、每词三个字位、在 W 里有释义、不泄漏进练习/游戏）照常执行。 */
function validateWeekly(d, ctx) {
  const errors = [], fail = s => errors.push(s);
  const { blocks, teachingBlocks, taught } = ctx;

  if (!Array.isArray(d.RESERVED)) {
    fail('RESERVED 必须是数组');
    checkConsolidation(d, blocks, fail);
    return errors;
  }
  if (d.RESERVED.length !== 5) fail('周检需 5 词');

  WEEKLY_FORBIDDEN_CONSTANTS.forEach(name => {
    if (d[name] !== undefined) fail(`weekly 周不得声明 ${name}`);
  });
  WEEKLY_FORBIDDEN_BLOCKS.forEach(blockType => {
    if (blocks.some(b => b.b === blockType)) fail(`weekly 周不得出现 ${blockType} 块`);
  });

  const owner = new Set();
  d.RESERVED.forEach(word => {
    const w = normalize(word);
    if (!/^[a-z]+$/.test(w)) fail('RESERVED 包含非法词项');
    if (owner.has(w)) fail(`测评词冲突：${w} 在 RESERVED 中重复`);
    owner.add(w);
  });

  d.RESERVED.forEach(word => {
    if (!/^[^aeiou][aeiou][^aeiou]$/.test(normalize(word)) || [...normalize(word)].some(c => !taught.has(c))) {
      fail(`周检词不是已教 CVC：${word}`);
    }
  });

  const { segmentWord } = require('../../frontend/src/shared/graphemes');
  const { withGraphemeFallback } = require('./sounds_grapheme_adapter');
  let adaptedSounds;
  try {
    adaptedSounds = withGraphemeFallback(d.SOUNDS || {});
  } catch (e) {
    adaptedSounds = d.SOUNDS || {};
  }
  d.RESERVED.forEach(word => {
    try {
      const ids = segmentWord(word, adaptedSounds);
      if (ids.length !== 3) fail(`周检词不是三个字位：${word}（实际 ${ids.length} 个）`);
    } catch (e) {
      fail(`周检词分词失败：${word}（${e.message || e}）`);
    }
  });

  const wKeysByLower = new Map();
  Object.keys(d.W || {}).forEach(k => wKeysByLower.set(k.toLowerCase(), k));
  const isValidWEntry = entry => !!entry && typeof entry === 'object' && !Array.isArray(entry)
    && typeof entry.zh === 'string' && entry.zh.length > 0;
  d.RESERVED.forEach(word => {
    const originalKey = wKeysByLower.get(word.toLowerCase());
    const hasOwnKey = originalKey !== undefined && Object.prototype.hasOwnProperty.call(d.W, originalKey);
    const entry = hasOwnKey ? d.W[originalKey] : undefined;
    if (!hasOwnKey || !isValidWEntry(entry)) fail(`周检词在 W 里没有释义：${word}`);
  });

  const visible = visibleWordSet(collectTextParts(d, teachingBlocks, { includeDictionary: false }));
  for (const w of owner) if (visible.has(w)) fail(`测评词泄漏进教学内容：${w}`);

  checkConsolidation(d, blocks, fail);
  return errors;
}

/* monthly 兼容路径：仅 assessmentMode:'monthly' && week===4 可用（方案 §0.3 临时路由表）。
 * 这是把重构前 `if(d.META.week<4) return []` 之后一路往下的旧全量逻辑原样提取出来的函数——
 * 逐项判据与顺序与重构前逐字一致，只是把内联的 textParts/visit 换成共享的 collectTextParts，
 * 产出结果等价（同一套遍历逻辑，只是抽成了函数）。「重构前后错误完全一致」由
 * tests/unit/test_assessment_contract.js 的既有 fixture + 16 条反例锁定（方案 §0.3
 * 「比较语义写死」：逐项比较有序错误数组，不用会去重的集合）。 */
function validateMonthlyW4(d, ctx) {
  const errors = [], fail = s => errors.push(s);
  const { teachingBlocks, taught } = ctx;
  const pools = ['RESERVED', 'RESERVED_RETEST', 'PROBE_A', 'PROBE_B', 'GLOBAL_RESERVED'];
  for (const key of pools) if (!Array.isArray(d[key])) fail(`${key} 必须是数组`);
  if (errors.length) return errors;
  if (d.RESERVED.length !== 5 || d.RESERVED_RETEST.length !== 5) fail('周检与复测各需 5 词');
  const endOfStage = [10, 20, 30, 40].includes(d.META.week);
  for (const key of ['PROBE_A', 'PROBE_B']) if (d[key].length !== (endOfStage ? 5 : 0)) fail(`${key} 数量与段末周不匹配`);
  if (d.META.week <= 40 && [...GLOBAL_POOL].sort().join() !== [...d.GLOBAL_RESERVED].map(normalize).sort().join()) fail('GLOBAL_RESERVED 必须完整保留附录 B 的 40 词');
  const owner = new Map();
  pools.forEach(key => d[key].forEach(word => {
    const w = normalize(word);
    if (!/^[a-z]+$/.test(w)) fail(`${key} 包含非法词项`);
    if (owner.has(w)) fail(`测评词冲突：${w} 同时属于 ${owner.get(w)} 与 ${key}`);
    owner.set(w, key);
  }));
  [...d.RESERVED, ...d.RESERVED_RETEST].forEach(w => {
    if (!/^[^aeiou][aeiou][^aeiou]$/.test(normalize(w)) || [...normalize(w)].some(c => !taught.has(c))) fail(`周检/复测词不是已教 CVC：${w}`);
  });
  const textParts = collectTextParts(d, teachingBlocks);
  const visible = visibleWordSet(textParts);
  for (const w of owner.keys()) if (visible.has(w)) fail(`测评词泄漏进教学内容：${w}`);
  if (d.META.week === 4) {
    if (!d.META.consolidation) fail('W4 必须是巩固周');
    if (new Set(d.META.wallLetters).size !== 19) fail('W4 点亮墙必须保留 19 字位');
    const passage = typeof d.ASSESS_TEXT === 'string' ? d.ASSESS_TEXT : '';
    const words = tokens(passage), sight = new Set((d.TAUGHT_SIGHT || []).map(normalize));
    if ([...sight].sort().join() !== ['a', 'i', 'is', 'see', 'the', 'to'].sort().join()) fail('W4 累计认读词只能沿用前三周的六词');
    if (words.length < 60) fail('ASSESS_TEXT 不足 60 词');
    const vocabulary = new Set(Object.keys(d.W).map(normalize));
    for (const w of new Set(words)) {
      if (owner.has(w)) fail(`测评短文与测评词冲突：${w}`);
      if (!sight.has(w) && vocabulary.has(w)) fail(`测评短文内容词进入教学词表：${w}`);
      if (!sight.has(w) && [...w].some(c => !taught.has(c))) fail(`测评短文包含未教字位：${w}`);
    }
    const teachingSentences = new Set(textParts.flatMap(t => String(t).split(/[.!?。！？]+/)).map(normalize).filter(Boolean));
    for (const s of passage.split(/[.!?]+/).map(normalize).filter(Boolean)) if (teachingSentences.has(s)) fail(`测评短文整句复用：${s}`);
    if (passage && textParts.some(t => normalize(t).includes(normalize(passage)))) fail('测评短文全文复用');
  }
  checkConsolidation(d, ctx.blocks, fail);
  return errors;
}

function validateAssessment(d) {
  const blocks = d.DAYS.flatMap(day => day.steps.flatMap(step => step.blocks));
  const teachingBlocks = blocks.filter(b => !['exam', 'retest', 'probe', 'assessment'].includes(b.b));
  const taught = new Set(Object.keys(d.SOUNDS || {}));
  const ctx = { blocks, teachingBlocks, taught };
  const mode = d.META.assessmentMode;

  if (mode === 'weekly') return validateWeekly(d, ctx);

  if (mode === 'monthly') {
    if (d.META.week === 4) return validateMonthlyW4(d, ctx);
    const errors = ["里程碑 2b 前不支持：monthly 模式仅 assessmentMode:'monthly' && week===4 可用"];
    checkConsolidation(d, blocks, s => errors.push(s));
    return errors;
  }

  if (mode === 'stage' || mode === 'annual') {
    const errors = [`里程碑 2b 前不支持：assessmentMode:'${mode}' 尚未实现`];
    checkConsolidation(d, blocks, s => errors.push(s));
    return errors;
  }

  const errors = [`META.assessmentMode 缺失或非法：${JSON.stringify(mode)}`];
  checkConsolidation(d, blocks, s => errors.push(s));
  return errors;
}

module.exports = { validateAssessment, GLOBAL_POOL, tokens, normalize };
