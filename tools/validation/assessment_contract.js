const GLOBAL_POOL = 'shelf shaft chimp chunk quilt quest moist hoist thorn north bleed greed groan float trail snail fried tried plum slug crust trust spoon stool wink honk yelp yank jump jolt shake flake stripe spine globe stove cube mule scarf shark'.split(' ');
const tokens = text => String(text || '').replace(/<[^>]*>/g, ' ').toLowerCase().match(/[a-z]+/g) || [];
const normalize = text => tokens(text).join(' ');

/* M3（外审 medium，2026-09-09）：泄漏判据的书面边界——`visibleWordSet`/下方
 * "测评词泄漏进教学内容" 检查，判定的是**完整词元（token）精确匹配**，不是子串匹配：
 *
 *   - 判据本身：`tokens()` 用 `/[a-z]+/g` 把可见文本切成连续字母片段（词元），
 *     `visible.has(w)` 只在测评词本身作为**独立的完整词元**出现时才算命中。
 *   - **不识别形态变体**：测评词 `pit` 若以 `pits`（复数）、`pitting`（现在分词）、
 *     `pitted`（过去式）等派生形式出现在教学内容里，这里不会判定为泄漏——`tokens()`
 *     切出来的是 `pits`/`pitting`/`pitted` 这些完整词元，与 `pit` 逐字不等，
 *     `visible.has('pit')` 为 false。这不是遗漏，是**当前明确选择的边界**：判据只管
 *     "这个测评词本身作为一个词出现在教学材料里"，不做词形归一化/词干提取。
 *   - **不识别复合词**：`pit` 作为另一个词的一部分出现（比如假设的 `pitfall`）同样
 *     不会被词元匹配命中，原因相同——`pitfall` 是单个词元，不等于 `pit`。
 *   - **不会把无关的子串重合误判成泄漏**：`spit`、`span` 这类词虽然字面上"包含"了
 *     `pit`/`an` 这样的字母片段，但因为判据是"整词元相等"而不是"子串出现"，
 *     `spit`/`span` 会被切成它们自己的完整词元，不会被误判成 `pit`/`an` 泄漏了。
 *     这一条是这个判据存在的**主要理由**：若改成无界子串匹配，`spit`/`span` 这类
 *     教学材料里完全合法的词会被大量误报，反而需要人工逐条排除误报（成本更高、
 *     更容易让人对这条检查失去信任）。
 *
 * ⚠️ 是否要扩展识别常见形态变体（复数 -s/-es、时态 -ed/-ing 等）或复合词，是一个
 * **教学口径问题**——"pits 算不算 pit 泄漏"取决于孩子会不会看着 pits 联想读出 pit
 * 的读音、进而提前"看见"了周检词，这需要教学判断，不是纯技术判断，本次收口批不擅自
 * 扩大匹配范围（超出实作裁定权），只把现状边界写清楚 + 补正反例测试（见
 * tests/unit/test_assessment_contract.js 的 M3 回归）。若之后要扩展，规则要显式列在
 * 这段注释里，不能悄悄改匹配逻辑却不说明新边界是什么。 */

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
 * `excludeDictionaryKeys`（可选，一个存归一化小写词的 Set；monthly 不传，逐字保留
 * 重构前行为，扫全部 `W`）控制"可见文本"里要不要把 `W` 排除掉。monthly（W4）的
 * RESERVED 系列词按 check_data.js:80 现状对 week>=4 豁免"必须在 W 里有释义"，实测也
 * 确实不在 W 里——包含 W 不会造成自我冲突。但 weekly（W1-W3）恰恰相反：
 * `DATA-RESERVED-01` 要求 RESERVED 词必须在 W 里有释义（上面 `周检词在 W 里没有释义`
 * 那段校验），若这里把这些词自己的释义条目也算进"可见文本"，会被误判"泄漏进教学
 * 内容"——那是一个词典查阅入口，不是练习/游戏，`weekly 列` 的"不泄漏进练习/游戏"
 * 语义上不包含它。
 *
 * M2 修复（里程碑 2 第 5 步预筛）：与 `DATA-RESERVED-01` 真正打架的只有周检词自己
 * 那一条键（连同它的释义值），不是整个 `W`——若某个周检词恰好出现在**别的**词条的
 * zh/art/例句里，那仍然是一次真实泄漏，理应查出。所以这里只按键逐条跳过
 * `excludeDictionaryKeys` 命中的条目，其余词条照常纳入"可见文本"扫描，而不是
 * 像旧版 `includeDictionary:false` 那样把整个 `W` 都排除在外。
 * 所以 weekly 分支显式传 `{excludeDictionaryKeys: owner}`（RESERVED 词集合），
 * monthly 不传，维持原语义。 */
function collectTextParts(d, teachingBlocks, options) {
  const excludeDictionaryKeys = options && options.excludeDictionaryKeys;
  const textParts = [];
  function visit(v) {
    if (typeof v === 'string') textParts.push(v);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  }
  // Cover all teaching fields, not just a hand-picked set of block properties.
  visit(teachingBlocks); visit(d.BOOK); visit(d.WALL_HINT); visit(d.SOUNDS);
  visit(d.G1_ROUNDS); visit(d.G1_THEME); visit(d.G3_PAIRS); visit(d.G4_WORDS); visit(d.G5_WHITELIST);
  // M1 修复（外审 medium，2026-09-09）：这里直接解引用 `d.DAYS`/`day.steps`，与下方
  // validateAssessment 里 ctx() 的 blocks/teachingBlocks 是两条独立路径（ctx() 只把
  // 展平后的 blocks 传进来，不会替这里做形状防御）——`d.DAYS` 不是数组、或某个
  // day.steps 不是数组时，改前 `.map`/`.steps.map` 会直接抛 TypeError。用防御性取值
  // 兜底，形状不对的条目按"当作没有这些标题/目标/步骤标题文本"处理，不崩溃、也不
  // 假装它们存在。
  visit((Array.isArray(d.DAYS) ? d.DAYS : []).map(day => {
    const steps = Array.isArray(day && day.steps) ? day.steps : [];
    return [day && day.title, day && day.goal, day && day.wd, ...steps.map(s => s && s.t)];
  }));
  for (const [key, entry] of Object.entries(d.W || {})) {
    if (excludeDictionaryKeys && excludeDictionaryKeys.has(key.toLowerCase())) continue;
    visit(key); visit(entry);
  }
  return textParts;
}

function visibleWordSet(textParts) {
  return new Set(textParts.flatMap(tokens));
}

/* 巩固周专项检查：与 assessmentMode 无关（任何一周都可能是巩固周），独立于路由之外，
 * 每条分支都要跑。四周现有数据里只有 W4 声明 consolidation:true，W1-W3 声明 false，
 * 所以这条检查对 weekly 分支目前是 no-op，接入路由后不会引入新的 fail。
 *
 * M1 修复（外审 medium，2026-09-09）：`d.FIRST_TEACH_DAY` 缺失/为 null 时，改前的
 * `Object.keys(d.FIRST_TEACH_DAY)` 会直接抛 TypeError（Object.keys 对 null/undefined
 * 不容忍），而不是给出"不支持/非法"这类确定错误。用 `|| {}` 兜底：巩固周没有声明
 * FIRST_TEACH_DAY 时，语义上等价于"没有任何首教日声明"（空对象），不是一种应该报错
 * 的形状问题——真正的 M1 关注点是"不因为字段缺失就崩溃"，不是要求这个字段必须存在。 */
function checkConsolidation(d, blocks, fail) {
  if (!d.META.consolidation) return;
  if (Object.keys(d.FIRST_TEACH_DAY || {}).length) fail('巩固周不得声明新字位首教日');
  for (const [label, kinds] of [['拼读', ['blend']], ['阅读', ['book', 'sentences']], ['输出', ['output']], ['打卡', ['checks']]]) {
    if (!blocks.some(b => kinds.includes(b.b))) fail(`巩固周缺少${label}块`);
  }
}

/* weekly 列：规范 §4.3——必需 RESERVED；禁止 6 个常量 + 2 个块类型；RESERVED 自身的
 * 共用校验（5 词、每词三个字位、在 W 里有释义、不泄漏进练习/游戏）照常执行。 */
function validateWeekly(d, ctx) {
  const errors = [], fail = s => errors.push(s);
  const { blocks, teachingBlocks, taught, shapeErrors } = ctx;
  // M1：DAYS/day.steps/step.blocks 形状不对时不静默吞掉——不报出来的话，teachingBlocks
  // 会悄悄变少，下面"必需块""不得泄漏"这类检查可能因为看不到那部分数据而漏判，
  // 比崩溃更隐蔽。
  (shapeErrors || []).forEach(fail);

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

  const visible = visibleWordSet(collectTextParts(d, teachingBlocks, { excludeDictionaryKeys: owner }));
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
  const { teachingBlocks, taught, shapeErrors } = ctx;
  // M1：同 validateWeekly，DAYS 形状问题先报出来，不静默吞掉（对现有合法 fixture
  // 是 no-op，shapeErrors 恒为空数组，不影响既有的"错误顺序逐字一致"回归断言）。
  (shapeErrors || []).forEach(fail);
  const pools = ['RESERVED', 'RESERVED_RETEST', 'PROBE_A', 'PROBE_B', 'GLOBAL_RESERVED'];
  for (const key of pools) if (!Array.isArray(d[key])) fail(`${key} 必须是数组`);
  if (errors.length) return errors;
  if (d.RESERVED.length !== 5 || d.RESERVED_RETEST.length !== 5) fail('周检与复测各需 5 词');
  /* L3（里程碑 2 第 5 步预筛）：validateMonthlyW4 现在只在 `meta.week === 4` 时被路由
   * 调用（见下方 validateAssessment 的 `if (meta.week === 4) return validateMonthlyW4(...)`），
   * 所以 endOfStage 恒为 false，下一行的 `PROBE_A`/`PROBE_B` 判据恒走「非段末周须为 0」
   * 分支——这条判据本身没删（重构不删代码），只是里程碑 2 阶段不可达。里程碑 2b 给
   * W10/W20/W40 开 stage 路由后，这条会重新可达并需要真实覆盖到「段末周须为 5」分支。 */
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
  checkConsolidation(d, ctx.blocks, fail);
  /* L3：同理，这条 `if` 守卫本身现在也恒为 true——validateMonthlyW4 只在 week===4 时
   * 被调用，这个分支形式上是"守卫"，实际上永远进入。保留它（不改成无条件执行）是
   * 因为里程碑 2b 给 stage/annual 开路由后，`RESERVED`/`RESERVED_RETEST`/`GLOBAL_RESERVED`
   * 等共用判据会被复用到非 W4 的段末周，而这条 `if` 块里的检查（ASSESS_TEXT、点亮墙
   * 19 字位、累计认读词六词等）是 W4 独有、不适用于 W10/W20/W40 的，届时这个守卫会
   * 变回真正在做区分。 */
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
  return errors;
}

/* L2 修复（里程碑 2 第 5 步预筛）：旧版在路由之前就无条件解引用 `d.DAYS` / `d.META`——
 * W5 之前 `week<4` 早退挡住了这条路径，坏数据（`META` 缺失/非法、或 `DAYS` 形状不对）
 * 不会被真正喂到这里；里程碑 2 最小路由把 W1-W3 也接入 weekly 路径后，这类坏数据会先
 * 在拿到「缺失或非法」这条本该给出的错误之前就抛 TypeError 崩溃。修法：先只做
 * `META` 存在性判断与 mode 路由（不解引用其余字段），确认 `META` 存在之后才计算
 * `ctx`（会解引用 `d.DAYS`/`d.SOUNDS`）与调用 `checkConsolidation`（会解引用
 * `d.META.consolidation`）。 */
function validateAssessment(d) {
  // M1 修复（外审 medium，2026-09-09）：META 改前只查 `typeof object`——数组的
  // `typeof` 也是 'object'，会被当成合法 META 放行，之后 `meta.assessmentMode`
  // 读到的是 undefined（数组没有这个键），虽然最终落进"缺失或非法"分支不算错，但
  // "META 本身就不是一个合法的配置对象"这件事被悄悄吞掉了，报出来的错误只字未提
  // META 的形状问题。加 `!Array.isArray(d.META)`：数组一律视为 META 不存在。
  const meta = (d && typeof d.META === 'object' && d.META && !Array.isArray(d.META)) ? d.META : null;
  const mode = meta ? meta.assessmentMode : undefined;

  /* M1 修复（外审 medium，2026-09-09）：改前 `day.steps.flatMap(step => step.blocks)`
   * 直接解引用，`DAYS` 不是数组、某天缺 `steps`、或某个 `step` 缺 `blocks` 时会直接
   * 抛 TypeError——尤其是 stage/annual/不支持的 monthly 这几条"不支持路由"，本该
   * 保证"至少返回一条确定错误、不因为其余字段形状崩溃"，改前却会在拿到那条确定
   * 错误之前就先崩溃退出（连 SystemExit/返回值都没有，是未捕获异常）。这里逐层做
   * 形状防御：哪一层形状不对就跳过那一层（当作它没有 blocks），同时记一条 shapeErrors，
   * 不静默吞掉——形状问题本身也是应该报出来的错误，不是"无声地少统计一些数据"。 */
  function ctx() {
    const shapeErrors = [];
    const days = Array.isArray(d.DAYS) ? d.DAYS : [];
    if (!Array.isArray(d.DAYS)) shapeErrors.push('DAYS 必须是数组');
    const blocks = [];
    days.forEach((day, di) => {
      if (!day || !Array.isArray(day.steps)) { shapeErrors.push(`DAYS[${di}].steps 必须是数组`); return; }
      day.steps.forEach((step, si) => {
        if (!step || !Array.isArray(step.blocks)) { shapeErrors.push(`DAYS[${di}].steps[${si}].blocks 必须是数组`); return; }
        step.blocks.forEach(b => blocks.push(b));
      });
    });
    const teachingBlocks = blocks.filter(b => b && !['exam', 'retest', 'probe', 'assessment'].includes(b.b));
    const taught = new Set(Object.keys(d.SOUNDS || {}));
    return { blocks, teachingBlocks, taught, shapeErrors };
  }

  if (meta && mode === 'weekly') return validateWeekly(d, ctx());

  if (meta && mode === 'monthly') {
    if (meta.week === 4) return validateMonthlyW4(d, ctx());
    const errors = ["里程碑 2b 前不支持：monthly 模式仅 assessmentMode:'monthly' && week===4 可用"];
    const c = ctx();
    errors.push(...c.shapeErrors);
    checkConsolidation(d, c.blocks, s => errors.push(s));
    return errors;
  }

  if (meta && (mode === 'stage' || mode === 'annual')) {
    const errors = [`里程碑 2b 前不支持：assessmentMode:'${mode}' 尚未实现`];
    const c = ctx();
    errors.push(...c.shapeErrors);
    checkConsolidation(d, c.blocks, s => errors.push(s));
    return errors;
  }

  const errors = [`META.assessmentMode 缺失或非法：${JSON.stringify(mode)}`];
  if (meta) {
    const c = ctx();
    errors.push(...c.shapeErrors);
    checkConsolidation(d, c.blocks, s => errors.push(s));
  } // meta 缺失时 checkConsolidation 会解引用 d.META.consolidation 而崩溃，跳过
  return errors;
}

module.exports = { validateAssessment, GLOBAL_POOL, tokens, normalize };
