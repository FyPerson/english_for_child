const assert = require('node:assert/strict');
const {validateAssessment, GLOBAL_POOL} = require('../../tools/validation/assessment_contract');

// ============================================================================
// monthly（W4）回归——里程碑 2 第 5 步之前就存在的 16 条反例，逐字保留（方案 §0.3
// 「先把现有 W4 路径原样提取为独立函数，用「重构前后错误完全一致」的特征测试锁定」）。
// 唯一的改动是 fixture 补上 assessmentMode:'monthly'——重构后 validateAssessment 按
// assessmentMode 路由，不再靠 week>=4 粗切，缺这个字段现在会被判「缺失或非法」。
// ============================================================================
function fixture(){
  return {
    META:{week:4, assessmentMode:'monthly', consolidation:true, wallLetters:'satipnckehrmdgoulfb'.split('')},
    SOUNDS:Object.fromEntries('satipnckehrmdgoulfb'.split('').map(c=>[c,{}])),
    RESERVED:['hem','ram','rid','dam','kid'], RESERVED_RETEST:['hum','hemx','rag','rim','rot'],
    PROBE_A:[],PROBE_B:[],GLOBAL_RESERVED:GLOBAL_POOL,
    ASSESS_TEXT:Array(16).fill('A pup is up.').join(' '),TAUGHT_SIGHT:['a','i','is','see','the','to'],
    W:{cat:{zh:'猫'}},FIRST_TEACH_DAY:{},BOOK:{pages:[]},WALL_HINT:{},
    G1_ROUNDS:{},G1_THEME:{},G3_PAIRS:[],G4_WORDS:[],G5_WHITELIST:[],
    DAYS:[{title:'复习',goal:'复习',wd:'',steps:[{t:'练习',blocks:[{b:'blend',words:['cat']},{b:'book'},{b:'output',html:'说一句话'},{b:'checks',items:[]}]}]}]
  };
}
const base=fixture(); base.RESERVED_RETEST[1]='nod';
assert.deepEqual(validateAssessment(base), []);
const reject = (name,mutate,fragment)=>{
  const d=structuredClone(base);mutate(d);
  assert(validateAssessment(d).some(e=>e.includes(fragment)),name+': expected '+fragment);
};
reject('normalized overlap',d=>d.RESERVED_RETEST[0]='HEM!', '冲突');
reject('duplicate in one pool',d=>d.RESERVED[1]='hem','冲突');
reject('missing global pool',d=>d.GLOBAL_RESERVED.pop(),'40 词');
reject('word dictionary leak',d=>d.W.hem={zh:'衣边'},'泄漏');
reject('nested block leak',d=>d.DAYS[0].steps[0].blocks.push({b:'wordforge',families:[{heads:['hem']}]}),'泄漏');
reject('sentence leak',d=>d.BOOK.pages.push({line:'HEM!'}),'泄漏');
reject('short passage',d=>d.ASSESS_TEXT='A pup.','60 词');
reject('passage dictionary overlap',d=>d.W.pup={zh:'小狗'},'内容词');
reject('passage pool overlap',d=>d.ASSESS_TEXT+=' Hem.','测评词冲突');
reject('passage sentence reuse',d=>d.BOOK.pages.push({line:'a PUP is up!'}),'整句复用');
reject('untaught passage',d=>d.ASSESS_TEXT+=' Zebra.','未教');
reject('missing output',d=>d.DAYS[0].steps[0].blocks=d.DAYS[0].steps[0].blocks.filter(b=>b.b!=='output'),'输出');
reject('not consolidation',d=>d.META.consolidation=false,'巩固周');
reject('new letter declaration',d=>d.FIRST_TEACH_DAY.z=1,'新字位');
reject('new sight-word escape',d=>d.TAUGHT_SIGHT.push('zebra'),'六词');
console.log('PASS assessment contract: valid fixture and 15 negative cases (monthly, W4)');

// ---- M1 回归：方案 §0.3「原样提取」要求逐字保留重构前的判据顺序，重构后
//      `checkConsolidation` 一度被挪到了 `week===4` 块之后（重构前在之前）。
//      之前保留的 16 条反例全是 `errors.some(子串)`，同时触发两类失败时
//      捕捉不到顺序变化——这里改用 deepEqual 逐项比较有序数组，同时触发
//      「巩固周不得声明新字位首教日」（checkConsolidation）与
//      「W4 点亮墙必须保留 19 字位」（week===4 块）两条失败，断言前者先出现。 ----
{
  const d = structuredClone(base);
  d.FIRST_TEACH_DAY.z = 1;                          // 触发 checkConsolidation
  d.META.wallLetters = d.META.wallLetters.slice(0, -1); // 触发 week===4 块（18 字位）
  const errors = validateAssessment(d);
  assert.deepEqual(errors, ['巩固周不得声明新字位首教日', 'W4 点亮墙必须保留 19 字位'],
    'checkConsolidation 必须仍在 week===4 块之前跑（有序数组逐项比较），实际：' + JSON.stringify(errors));
  console.log('PASS M1 回归：consolidation 检查顺序仍在 week===4 块之前（有序数组比较）');
}

/* 原「missing end-stage probes」用例（`d.META.week=10` 触发 PROBE_A 数量校验）已移除：
   里程碑 2 最小路由把 monthly 严格限定为 `assessmentMode:'monthly' && week===4`，
   `week=10` 现在会先被路由挡在 validateMonthlyW4 之外、返回「里程碑 2b 前不支持」
   （见下面 assessmentMode 路由测试），不再进入 endOfStage 分支——那条判据本身在
   validateMonthlyW4 里原样保留（重构未删代码），只是里程碑 2 阶段确实不可达，等
   里程碑 2b 给 stage 开路由、补 W10/W20/W40 fixture 时再测。 */

// ============================================================================
// 里程碑 2 第 5 步：assessmentMode 最小路由（方案 §0.3 + 规范 v2.0 §4.3）。
// ============================================================================

// ---- monthly 分支：week!==4 一律「里程碑 2b 前不支持」，不回落旧周号逻辑 ----
{
  const d = structuredClone(base);
  d.META.week = 10; // 段末周，若误回落旧逻辑会走 PROBE_A/PROBE_B 分支而不是直接拒绝
  d.META.assessmentMode = 'monthly';
  const errors = validateAssessment(d);
  assert(errors.some(e => e.includes('里程碑 2b 前不支持')), 'monthly && week!==4 应返回「里程碑 2b 前不支持」，实际：' + JSON.stringify(errors));
  console.log('PASS assessmentMode 路由：monthly && week!==4 一律「里程碑 2b 前不支持」，不回落旧周号逻辑');
}

// ---- stage / annual：固定「里程碑 2b 前不支持」错误 ----
for (const mode of ['stage', 'annual']) {
  const d = structuredClone(base);
  d.META.assessmentMode = mode;
  const errors = validateAssessment(d);
  assert(errors.some(e => e.includes('里程碑 2b 前不支持')), `assessmentMode:'${mode}' 应返回「里程碑 2b 前不支持」，实际：` + JSON.stringify(errors));
}
console.log('PASS assessmentMode 路由：stage / annual 均返回固定「里程碑 2b 前不支持」错误');

// ---- 缺失 / 非法值：一律失败，不放行也不假装通过 ----
// L6（里程碑 2 第 5 步预筛）：原先「assessmentMode 缺失」与「assessmentMode 非法值」
// 是两条分别 assert 的用例，但两者落进 validateAssessment 里同一个兜底分支、断言同一
// 个错误片段「缺失或非法」，对分支覆盖没有增量——合并成一个循环，两个输入仍都测到。
{
  const d = structuredClone(base);
  for (const [label, mutate] of [
    ['缺失', dd => { delete dd.META.assessmentMode; }],
    ['非法值', dd => { dd.META.assessmentMode = 'weeklyish'; }]
  ]) {
    mutate(d);
    assert(validateAssessment(d).some(e => e.includes('缺失或非法')), `assessmentMode ${label}应失败`);
  }
  console.log('PASS assessmentMode 路由：缺失 / 非法值一律失败');
}

// ---- L2 回归：META 本身缺失（不只是 assessmentMode 缺失）不该在拿到「缺失或非法」
//      这条错误之前就先因解引用 d.DAYS / d.META.consolidation 抛 TypeError 崩溃 ----
{
  const d = {}; // 完全没有 META，也没有 DAYS/SOUNDS 等其余字段
  const errors = validateAssessment(d);
  assert(errors.some(e => e.includes('META.assessmentMode 缺失或非法')),
    'META 整体缺失时应给出「缺失或非法」错误而不是抛异常，实际：' + JSON.stringify(errors));
  console.log('PASS L2 回归：META 整体缺失（连 DAYS 都没有）时不崩溃，正确报「缺失或非法」');
}
{
  const d = {META: {assessmentMode: 'bogus'}}; // META 存在但没有 DAYS/SOUNDS
  const errors = validateAssessment(d);
  assert(errors.some(e => e.includes('META.assessmentMode 缺失或非法')),
    'META 存在但 assessmentMode 非法、且无 DAYS 时应给出「缺失或非法」错误而不是抛异常，实际：' + JSON.stringify(errors));
  console.log('PASS L2 回归：META 存在但 assessmentMode 非法、DAYS 缺失时不崩溃（走到「缺失或非法」分支不需要碰 DAYS）');
}

// ============================================================================
// weekly 列（规范 §4.3）：必需 RESERVED；禁止 6 个常量 + 2 个块类型；RESERVED 自身
// 共用校验（5 词、每词三个字位、在 W 里有释义、不泄漏进练习/游戏）照常执行。
// ============================================================================

// ---- W5 合成 fixture（规范点名，真实 W5 数据尚不存在，允许用合成 fixture）：
//      teachingMode:'phoneme', consolidation:false, bookMode:'new', assessmentMode:'weekly'，
//      只带 RESERVED，不带任何禁止常量，无 retest/probe 块。 ----
function weeklyFixture(week) {
  return {
    META: {
      week, assessmentMode: 'weekly', teachingMode: 'phoneme', consolidation: false,
      bookMode: 'new', externalReading: false, wallLetters: 'satipnckehrmdgoulfb'.split('')
    },
    SOUNDS: Object.fromEntries('satipnckehrmdgoulfb'.split('').map(c => [c, {grapheme: c}])),
    RESERVED: ['hem', 'ram', 'rid', 'dam', 'kid'],
    W: {hem: {zh: '边'}, ram: {zh: '公羊'}, rid: {zh: '摆脱'}, dam: {zh: '水坝'}, kid: {zh: '小孩'}},
    FIRST_TEACH_DAY: {}, BOOK: {pages: []}, WALL_HINT: {},
    G1_ROUNDS: {}, G1_THEME: {}, G3_PAIRS: [], G4_WORDS: [], G5_WHITELIST: [],
    DAYS: [{title: '', goal: '', wd: '', steps: [{t: '', blocks: []}]}]
  };
}
const w5 = weeklyFixture(5);
assert.deepEqual(validateAssessment(w5), [], 'W5 合成正例应全部通过，实际：' + JSON.stringify(validateAssessment(w5)));
console.log('PASS weekly 正例：W5 合成 fixture（只带 RESERVED，无禁止常量/禁止块）通过');

// ---- weekly 漏掉 RESERVED 的失败 fixture（规范点名） ----
{
  const d = structuredClone(w5);
  delete d.RESERVED;
  assert(validateAssessment(d).some(e => e.includes('RESERVED 必须是数组')), 'weekly 缺 RESERVED 应失败');
  console.log('PASS weekly 失败例：漏掉 RESERVED');
}

// ---- 失败例：RESERVED 词数不足 ----
{
  const d = structuredClone(w5);
  d.RESERVED.pop();
  assert(validateAssessment(d).some(e => e.includes('周检需 5 词')), 'weekly RESERVED 少于 5 词应失败');
  console.log('PASS weekly 失败例：RESERVED 词数不足');
}

// ---- 精确检查集合直接取自规范 §4.3 矩阵的 weekly 列：6 个禁止常量 + 2 个禁止块类型，
//      每一项各配一条参数化失败用例，不许只测其中几个。 ----
const WEEKLY_FORBIDDEN_CONSTANTS = ['RESERVED_RETEST', 'ASSESS_TEXT', 'GLOBAL_RESERVED', 'PROBE_A', 'PROBE_B', 'ANNUAL_DECODING'];
for (const name of WEEKLY_FORBIDDEN_CONSTANTS) {
  const d = structuredClone(w5);
  d[name] = [];
  const errors = validateAssessment(d);
  assert(errors.some(e => e.includes(`weekly 周不得声明 ${name}`)), `weekly 携带 ${name} 应失败，实际：` + JSON.stringify(errors));
}
console.log(`PASS weekly 失败例：6 个禁止常量（${WEEKLY_FORBIDDEN_CONSTANTS.join('、')}）各触发一条失败`);

// ---- H1 回归：ANNUAL_DECODING 一度不在 load_data.js 的 NAMES 白名单里，导致真实
//      源码里追加这个常量后 loadData 读不出来，上面的参数化用例又是直接往裸对象
//      `d[name]=[]` 赋值、绕过了 loadData，两头都测不出「检查形同虚设」。这里改用
//      真实 W1 源码文本（走 loadData，不用裸对象）来证明该常量确实能被读出并触发禁止项。 ----
{
  const fs = require('node:fs'), path = require('node:path');
  const {loadData} = require('../../tools/validation/load_data');
  const root = path.resolve(__dirname, '../..');
  const file = path.join(root, 'frontend', 'src', 'weeks', 'week01.data.js');
  const raw = fs.readFileSync(file, 'utf8') + "\nconst ANNUAL_DECODING = ['zzz'];\n";
  const d = loadData(raw, false);
  assert(Array.isArray(d.ANNUAL_DECODING), 'loadData 应能从真实源码文本里读出 ANNUAL_DECODING（NAMES 白名单缺失时读不出）');
  const errors = validateAssessment(d);
  assert(errors.some(e => e.includes('weekly 周不得声明 ANNUAL_DECODING')), 'weekly 真实源码携带 ANNUAL_DECODING 应失败，实际：' + JSON.stringify(errors));
  console.log('PASS H1 回归：真实 W1 源码文本追加 ANNUAL_DECODING，走 loadData 后仍被 weekly 禁止清单查出');
}

const WEEKLY_FORBIDDEN_BLOCKS = ['retest', 'probe'];
for (const blockType of WEEKLY_FORBIDDEN_BLOCKS) {
  const d = structuredClone(w5);
  d.DAYS[0].steps[0].blocks.push({b: blockType});
  const errors = validateAssessment(d);
  assert(errors.some(e => e.includes(`weekly 周不得出现 ${blockType} 块`)), `weekly 携带 ${blockType} 块应失败，实际：` + JSON.stringify(errors));
}
console.log(`PASS weekly 失败例：2 个禁止块类型（${WEEKLY_FORBIDDEN_BLOCKS.join('、')}）各触发一条失败`);

// ---- RESERVED 自身共用校验：每词三个字位、在 W 里有释义、不泄漏进练习/游戏 ----
{
  const d = structuredClone(w5);
  d.RESERVED[0] = 'spit'; // 四个字位（s/p/i/t），不是三个
  const errors = validateAssessment(d);
  assert(errors.some(e => e.includes('周检词不是三个字位')), 'weekly RESERVED 四字位词应失败，实际：' + JSON.stringify(errors));
  console.log('PASS weekly 共用校验：RESERVED 词不是三个字位应失败');
}
{
  const d = structuredClone(w5);
  delete d.W.hem;
  const errors = validateAssessment(d);
  assert(errors.some(e => e.includes('周检词在 W 里没有释义')), 'weekly RESERVED 缺释义应失败，实际：' + JSON.stringify(errors));
  console.log('PASS weekly 共用校验：RESERVED 词在 W 里没有释义应失败');
}
{
  const d = structuredClone(w5);
  d.DAYS[0].steps[0].blocks.push({b: 'words', items: ['hem']});
  const errors = validateAssessment(d);
  assert(errors.some(e => e.includes('测评词泄漏进教学内容：hem')), 'weekly RESERVED 泄漏进练习应失败，实际：' + JSON.stringify(errors));
  console.log('PASS weekly 共用校验：RESERVED 词泄漏进练习/游戏应失败');
}
{
  // RESERVED 词本身在 W 里的释义（DATA-RESERVED-01 强制要求）不应被误判成"泄漏"——
  // 这是词典查阅入口，不是练习/游戏；见 assessment_contract.js collectTextParts 的
  // excludeDictionaryKeys 说明。
  const d = structuredClone(w5);
  assert.deepEqual(validateAssessment(d), [], 'RESERVED 词自己在 W 里的释义不应被判定为泄漏');
  console.log('PASS weekly 共用校验：RESERVED 词自身的 W 释义不算泄漏（回归防止 W 词典入口被误判）');
}
{
  // M2 回归（里程碑 2 第 5 步预筛）：旧版 `includeDictionary:false` 一次性砍掉整个
  // `W`，与 `DATA-RESERVED-01` 真正打架的只是周检词自己那一条键——若周检词出现在
  // 【别的】词条的 zh/art/lemma 等字段里，那仍是一次真实泄漏，不该被连坐放过。
  // 这里造一个真实可能出现的场景：另一个词条 hems 的 lemma 恰好是周检词 hem。
  const d = structuredClone(w5);
  d.W.hems = {zh: '边儿们', lemma: 'hem'};
  const errors = validateAssessment(d);
  assert(errors.some(e => e.includes('测评词泄漏进教学内容：hem')),
    'weekly RESERVED 词出现在别的词条里（非自身释义键）应查出泄漏，实际：' + JSON.stringify(errors));
  console.log('PASS M2 回归：周检词出现在别的词条（非自身释义）里仍被查出泄漏');
}

// ============================================================================
// M3 回归（外审 medium，2026-09-09）：泄漏判据的书面边界——见 assessment_contract.js
// 文件头 tokens/normalize 附近的 M3 注释。这里用正反例把边界钉死成可执行断言：
// ①精确词元命中确实会被查出（已有 M2 用例覆盖，这里只是同一维度的直接版本）；
// ②形态变体（复数）不会被词元匹配命中——这是当前明确选择的边界，不是判据坏了；
// ③无关的子串重合（spit 包含 pit 的字母）不会被误判成泄漏——这条正是"不能直接改成
// 无界子串匹配"的证据，改成子串匹配这条用例会先转红。
// ============================================================================
{
  // ①精确词元命中：教学内容里直接出现测评词本身，应查出。
  const d = structuredClone(w5);
  d.DAYS[0].steps[0].blocks.push({b: 'lead', html: '今天要学 hem 这个词。'});
  const errors = validateAssessment(d);
  assert(errors.some(e => e.includes('测评词泄漏进教学内容：hem')),
    'M3：测评词本身作为完整词元出现在教学内容里，应查出泄漏，实际：' + JSON.stringify(errors));
  console.log('PASS M3 边界①：测评词作为完整词元出现时被查出泄漏');
}
{
  // ②形态变体不命中：hem 的复数 hems 出现在教学内容里（不是通过 W 词典入口，是直接
  // 出现在某个教学块的正文里），不应被判定为泄漏——当前判据是词元精确匹配，不做
  // 词形归一化，这是书面记录过的边界，不是遗漏。
  const d = structuredClone(w5);
  d.DAYS[0].steps[0].blocks.push({b: 'lead', html: '这周学的都是 hems 这样的词。'});
  const errors = validateAssessment(d);
  assert(!errors.some(e => e.includes('测评词泄漏进教学内容：hem')),
    'M3：hem 的复数形式 hems 按当前"词元精确匹配"边界不应被判定为 hem 泄漏（若未来要扩展这条边界，' +
    '需要先在 assessment_contract.js 头部注释里显式写清楚新规则，这条断言也要跟着改），实际：' + JSON.stringify(errors));
  console.log('PASS M3 边界②：hem 的复数 hems 不被词元匹配误判为 hem 泄漏（当前边界，非 bug）');
}
{
  // ③子串重合不误报：spit 包含 pit 的字母，但两者是不同的词元，不应该因为字面包含
  // 关系就被判定为"pit 泄漏"——这条用例证明当前"词元精确匹配"没有子串误报问题，
  // 也是"不能直接改成无界子串匹配"这条修法禁令的反面证据（若误改成子串匹配，
  // 这条断言会先转红）。
  const d = structuredClone(w5);
  d.RESERVED[0] = 'pit';
  d.W.pit = {zh: '坑'};
  d.DAYS[0].steps[0].blocks.push({b: 'lead', html: '示范一个无关的词：spit。'});
  const errors = validateAssessment(d);
  assert(!errors.some(e => e.includes('测评词泄漏进教学内容：pit')),
    'M3：spit 与测评词 pit 只是字母子串重合，不是同一个词元，不应被误判为 pit 泄漏，实际：' + JSON.stringify(errors));
  console.log('PASS M3 边界③：spit 与测评词 pit 的子串重合不被误判为泄漏（词元匹配没有子串误报问题）');
}

// ---- 逐周回归：W1、W2、W3、W5 各一个 weekly 正例。W1-W3 此前被 week<4 早退完全跳过，
//      补 assessmentMode 后是首次进入 weekly 路径，历史数据可能不满足新检查，必须逐周
//      验而不是只验 W5。不得以新增正例 fixture 代替真实四周数据回归——W1/W2/W3 直接
//      加载真实的 frontend/src/weeks/week0N.data.js。 ----
{
  const fs = require('node:fs'), path = require('node:path');
  const {loadData} = require('../../tools/validation/load_data');
  const root = path.resolve(__dirname, '../..');
  for (const week of [1, 2, 3]) {
    const file = path.join(root, 'frontend', 'src', 'weeks', `week0${week}.data.js`);
    const raw = fs.readFileSync(file, 'utf8');
    const d = loadData(raw, false);
    const errors = validateAssessment(d);
    assert.deepEqual(errors, [], `真实 W${week} 数据应通过 weekly 契约，实际：` + JSON.stringify(errors));
  }
  console.log('PASS weekly 逐周回归：真实 W1/W2/W3 数据（loadData 直接加载 data.js）均通过 weekly 契约');
}

// ============================================================================
// W4 baseline exposure（monthly）——沿用既有回归，读真实 build 产物。
// ============================================================================
const fs = require('node:fs'), path = require('node:path');
const {loadData} = require('../../tools/validation/load_data');
const root = path.resolve(__dirname, '../..');
const actual = loadData(fs.readFileSync(path.join(root, 'build', 'week04.html'), 'utf8'));
const baseline = [...actual.RESERVED, ...actual.RESERVED_RETEST];
for (let week = 1; week <= 3; week++) {
  const previous = loadData(fs.readFileSync(path.join(root, 'build', `week0${week}.html`), 'utf8'));
  const exposed = new Set(JSON.stringify(previous).toLowerCase().match(/[a-z]+/g));
  assert.deepEqual(baseline.filter(word => exposed.has(word)), [], `W4 baseline exposed in W${week}`);
}
console.log('PASS W4 baseline: no exposure in any prior weekly data or explanation');

// ============================================================================
// M1 回归（外审 medium，2026-09-09）：不支持路由（stage/annual/monthly&&week!==4）
// 与 checkConsolidation 改前会因为 DAYS/day.steps/step.blocks/FIRST_TEACH_DAY 的
// 形状问题直接抛 TypeError，而不是返回确定的"不支持/非法"错误；META 是数组时也会被
// `typeof object` 误判成合法配置。这里逐条造畸形输入，只断言"不抛异常、拿到字符串
// 数组"，不追求穷尽每种形状组合。
// ============================================================================
{
  // ---- day.steps 缺失：stage/annual 路由改前会在 ctx() 里直接抛 TypeError ----
  const d = structuredClone(w5);
  d.META.assessmentMode = 'stage';
  delete d.DAYS[0].steps;   // 畸形：这一天没有 steps
  let errors;
  assert.doesNotThrow(() => { errors = validateAssessment(d); },
    'M1：day.steps 缺失时 stage 路由不应抛异常');
  assert(errors.some(e => e.includes('里程碑 2b 前不支持')), 'stage 路由仍应给出「不支持」这条确定错误：' + JSON.stringify(errors));
  assert(errors.some(e => e.includes('DAYS[0].steps 必须是数组')), 'stage 路由应同时报出 DAYS[0].steps 的形状问题：' + JSON.stringify(errors));
  console.log('PASS M1 回归：day.steps 缺失时 stage 路由不崩溃，给出「不支持」+ 形状错误两条');
}
{
  // ---- step.blocks 缺失：annual 路由 ----
  const d = structuredClone(w5);
  d.META.assessmentMode = 'annual';
  delete d.DAYS[0].steps[0].blocks;   // 畸形：这一步没有 blocks
  let errors;
  assert.doesNotThrow(() => { errors = validateAssessment(d); },
    'M1：step.blocks 缺失时 annual 路由不应抛异常');
  assert(errors.some(e => e.includes('里程碑 2b 前不支持')), 'annual 路由仍应给出「不支持」这条确定错误：' + JSON.stringify(errors));
  assert(errors.some(e => e.includes('DAYS[0].steps[0].blocks 必须是数组')), 'annual 路由应同时报出 step.blocks 的形状问题：' + JSON.stringify(errors));
  console.log('PASS M1 回归：step.blocks 缺失时 annual 路由不崩溃，给出「不支持」+ 形状错误两条');
}
{
  // ---- DAYS 本身不是数组：monthly && week!==4 路由 ----
  const d = structuredClone(w5);
  d.META.assessmentMode = 'monthly';
  d.META.week = 10;
  d.DAYS = null;   // 畸形：DAYS 整体缺失
  let errors;
  assert.doesNotThrow(() => { errors = validateAssessment(d); },
    'M1：DAYS 整体非数组时 monthly&&week!==4 路由不应抛异常');
  assert(errors.some(e => e.includes('里程碑 2b 前不支持')), 'monthly&&week!==4 路由仍应给出「不支持」：' + JSON.stringify(errors));
  assert(errors.some(e => e.includes('DAYS 必须是数组')), '应同时报出 DAYS 本身的形状问题：' + JSON.stringify(errors));
  console.log('PASS M1 回归：DAYS 非数组时 monthly&&week!==4 路由不崩溃，给出「不支持」+ 形状错误两条');
}
{
  // ---- consolidation:true 但 FIRST_TEACH_DAY 缺失：checkConsolidation 改前
  //      Object.keys(undefined) 直接抛 TypeError ----
  const d = structuredClone(w5);
  d.META.assessmentMode = 'stage';
  d.META.consolidation = true;
  delete d.FIRST_TEACH_DAY;
  let errors;
  assert.doesNotThrow(() => { errors = validateAssessment(d); },
    'M1：consolidation:true 且 FIRST_TEACH_DAY 缺失时不应抛异常');
  assert(errors.some(e => e.includes('里程碑 2b 前不支持')), 'stage 路由仍应给出「不支持」：' + JSON.stringify(errors));
  assert(!errors.some(e => e.includes('首教日')), 'FIRST_TEACH_DAY 缺失应视为"没有声明"，不应误判为"巩固周不得声明新字位首教日"：' + JSON.stringify(errors));
  console.log('PASS M1 回归：consolidation:true 且 FIRST_TEACH_DAY 缺失时不崩溃，且不误报"不得声明首教日"');
}
{
  // ---- weekly 路由本身也要扛住畸形 DAYS，不只是"不支持路由" ----
  const d = structuredClone(w5);
  d.DAYS = [{title: '', goal: '', wd: ''}];   // 畸形：这一天连 steps 都没有
  let errors;
  assert.doesNotThrow(() => { errors = validateAssessment(d); },
    'M1：weekly 路由遇到畸形 DAYS 也不应抛异常');
  assert(errors.some(e => e.includes('DAYS[0].steps 必须是数组')), 'weekly 路由应报出 DAYS[0].steps 的形状问题：' + JSON.stringify(errors));
  console.log('PASS M1 回归：weekly 路由遇到畸形 DAYS（缺 steps）不崩溃，报出形状错误');
}
{
  // ---- META 是数组：改前 `typeof []==='object'` 会被当成合法 META 放行 ----
  const d = structuredClone(w5);
  d.META = ['not', 'a', 'real', 'meta'];
  const errors = validateAssessment(d);
  assert(errors.some(e => e.includes('META.assessmentMode 缺失或非法')),
    'M1：META 是数组时应被视为"缺失或非法"，不能被当成合法配置放行：' + JSON.stringify(errors));
  console.log('PASS M1 回归：META 是数组时不被 typeof object 误判成合法配置，判「缺失或非法」');
}
