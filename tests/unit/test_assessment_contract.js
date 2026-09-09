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
    META:{week:4, assessmentMode:'monthly', consolidation:true, wallLetters:'satipnckehrmdgoulfb'},
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
{
  const d = structuredClone(base);
  delete d.META.assessmentMode;
  assert(validateAssessment(d).some(e => e.includes('缺失或非法')), 'assessmentMode 缺失应失败');
  d.META.assessmentMode = 'weeklyish';
  assert(validateAssessment(d).some(e => e.includes('缺失或非法')), 'assessmentMode 非法值应失败');
  console.log('PASS assessmentMode 路由：缺失 / 非法值一律失败');
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
      bookMode: 'new', externalReading: false, wallLetters: 'satipnckehrmdgoulfb'
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
  // includeDictionary:false 说明。
  const d = structuredClone(w5);
  assert.deepEqual(validateAssessment(d), [], 'RESERVED 词自己在 W 里的释义不应被判定为泄漏');
  console.log('PASS weekly 共用校验：RESERVED 词自身的 W 释义不算泄漏（回归防止 W 词典入口被误判）');
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
