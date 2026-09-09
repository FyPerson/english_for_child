/* 里程碑 2 第 3 步：迁移前审计 schema 正反 fixture + 重复记录检测 +
 * 临时 L→grapheme 适配层的等价性测试 + 真实 W1–W4 审计结果的结构性断言。
 *
 * schema 逐字照方案 docs/里程碑2实施方案_20260908_v1.7.md §5「迁移前审计」行：
 *   顶层 { schemaVersion, generatedAt, findings:[...] }（schemaVersion 在顶层不在每条记录里）；
 *   每条 finding 含 findingId / ruleId / week / status（闭集枚举）/ source（{file,line,column}，
 *   file 必填）/ details（规则级对象，不是自由文本）；
 *   稳定排序键 ruleId → source.file → source.line（null 排最后）→ findingId；
 *   findingId 的唯一性以"同一 ruleId 内唯一"为机器校验条件。
 */
const assert = require('node:assert/strict');
const {
  buildAudit, auditWeek, defaultWeekSources, sortFindings,
  findDuplicateFindingIds, validateAuditDocument,
  WEEKLY_FORBIDDEN_CONSTANTS, WEEKLY_FORBIDDEN_BLOCKS
} = require('../../tools/validation/migration_audit');
const { withGraphemeFallback } = require('../../tools/validation/sounds_grapheme_adapter');

// ============================================================================
// ① schema 正例：一个手写的最小合法文档必须通过 validateAuditDocument
// ============================================================================
function validDoc() {
  return {
    schemaVersion: '1.0.0',
    generatedAt: '2026-01-01T00:00:00.000Z',
    findings: [
      { findingId: 'a', ruleId: 'DATA-X', week: 1, status: 'pass', source: { file: 'f.js', line: 1, column: null }, details: { note: 'x' } },
      { findingId: 'b', ruleId: 'DATA-X', week: 1, status: 'fail', source: { file: 'f.js', line: 2, column: null }, details: { note: 'y' } },
      { findingId: 'a', ruleId: 'DATA-Y', week: null, status: 'unknown', source: { file: 'g.js', line: null, column: null }, details: {} }
    ]
  };
}
assert.deepEqual(validateAuditDocument(validDoc()), [], '手写的合法最小文档应该通过 schema 校验（0 个问题）');
console.log('PASS migration_audit schema：合法最小文档通过');

// ============================================================================
// ② schema 反例：每类违规各触发至少一条问题
// ============================================================================
function reject(label, mutate) {
  const doc = validDoc();
  mutate(doc);
  const problems = validateAuditDocument(doc);
  assert(problems.length > 0, `${label}: 期望 validateAuditDocument 报告问题，实际为空`);
  return problems;
}
reject('缺顶层 schemaVersion', d => { delete d.schemaVersion; });
reject('缺顶层 generatedAt', d => { delete d.generatedAt; });
reject('findings 不是数组', d => { d.findings = {}; });
reject('status 不在闭集枚举内', d => { d.findings[0].status = 'ok-ish'; });
reject('source 缺 file', d => { delete d.findings[0].source.file; });
reject('source.line 类型非法', d => { d.findings[0].source.line = 'one'; });
reject('details 是自由文本字符串而不是对象', d => { d.findings[0].details = '随便写点什么'; });
reject('details 是数组而不是规则级对象', d => { d.findings[0].details = ['x']; });
reject('week 类型非法（既不是 number 也不是 null）', d => { d.findings[0].week = '1'; });
{
  const dupProblems = reject('同一 ruleId 内 findingId 重复', d => {
    d.findings.push({ findingId: 'a', ruleId: 'DATA-X', week: 1, status: 'pass', source: { file: 'f.js', line: 3, column: null }, details: {} });
  });
  assert(dupProblems.some(p => p.includes('findingId') && p.includes('重复')), '重复 findingId 的问题描述应点名"findingId"与"重复"');
}
{
  const orderProblems = reject('顺序违反稳定排序键', d => {
    d.findings.reverse();
  });
  assert(orderProblems.some(p => p.includes('排序')), '乱序文档应被 validateAuditDocument 抓到');
}
console.log('PASS migration_audit schema：9 类反例（含重复 findingId、乱序）均被正确拒绝');

// ============================================================================
// ③ findDuplicateFindingIds：直接单测这个更底层的工具函数
// ============================================================================
assert.deepEqual(findDuplicateFindingIds([
  { ruleId: 'A', findingId: 'x' }, { ruleId: 'A', findingId: 'y' }, { ruleId: 'B', findingId: 'x' }
]), [], '不同 ruleId 下的同名 findingId 不算重复（唯一性只在同一 ruleId 内要求）');
assert.deepEqual(findDuplicateFindingIds([
  { ruleId: 'A', findingId: 'x' }, { ruleId: 'A', findingId: 'x' }
]), [{ ruleId: 'A', findingId: 'x' }], '同一 ruleId 内重复的 findingId 应该被识别');
console.log('PASS migration_audit：findDuplicateFindingIds 正确区分"同规则内重复"与"跨规则同名"');

// ============================================================================
// ④ sortFindings：null 排最后 + 三级键生效
// ============================================================================
{
  const findings = [
    { ruleId: 'B', source: { file: 'a.js', line: 5 }, findingId: 'z' },
    { ruleId: 'A', source: { file: 'a.js', line: null }, findingId: 'm' },
    { ruleId: 'A', source: { file: 'a.js', line: 2 }, findingId: 'n' },
    { ruleId: 'A', source: { file: 'a.js', line: 2 }, findingId: 'a' }
  ];
  const sorted = sortFindings(findings.slice());
  assert.deepEqual(sorted.map(f => f.findingId), ['a', 'n', 'm', 'z'],
    'ruleId 优先分组（A 组在 B 组前）；A 组内先按 line 升序（2 在 null 前），line 相同再按 findingId（a 在 n 前）；null 排在该 ruleId+file 分组的最后');
}
console.log('PASS migration_audit：sortFindings 的 ruleId → file → line(null 最后) → findingId 四级键正确');

// ============================================================================
// ⑤ 临时 L→grapheme 适配层：三种形态（只 L / 只 grapheme / 两者都有）在
//    DATA-RESERVED-02 的 segment-count 这条依赖分词的规则上必须得到同一结果
//    ——这正是方案要求的"配测试：两种形态的输入都能得到相同的审计结果"。
// ============================================================================
function makeSyntheticBox(soundsVariant) {
  return {
    META: { week: 5, wallLetters: 'rain', rackG4: 'rain', rackG5: 'rain' },
    RESERVED: ['rain'],
    SOUNDS: soundsVariant,
    W: { rain: { zh: '雨' } },
    WALL_HINT: {}, BOOK: { title: 't', zh: 'z', pages: [] }, FIRST_TEACH_DAY: {},
    G1_ROUNDS: {}, G1_THEME: {}, G3_PAIRS: [], G4_WORDS: [], G5_WHITELIST: [],
    DAYS: []
  };
}
const L_ONLY = { r: { L: 'r', type: 'c' }, ai: { L: 'ai', type: 'v' }, n: { L: 'n', type: 'c' } };
const GRAPHEME_ONLY = { r: { grapheme: 'r', type: 'c' }, ai: { grapheme: 'ai', type: 'v' }, n: { grapheme: 'n', type: 'c' } };
const BOTH = { r: { L: 'r', grapheme: 'r', type: 'c' }, ai: { L: 'ai', grapheme: 'ai', type: 'v' }, n: { L: 'n', grapheme: 'n', type: 'c' } };

const findingsFromL = auditWeek(makeSyntheticBox(L_ONLY), '', 'synthetic.js');
const findingsFromGrapheme = auditWeek(makeSyntheticBox(GRAPHEME_ONLY), '', 'synthetic.js');
const findingsFromBoth = auditWeek(makeSyntheticBox(BOTH), '', 'synthetic.js');

const segmentFinding = list => list.find(f => f.ruleId === 'DATA-RESERVED-02' && f.findingId === 'w5:segment-count:rain');
[findingsFromL, findingsFromGrapheme, findingsFromBoth].forEach((list, i) => {
  const f = segmentFinding(list);
  assert(f, `变体 ${i} 应该产出 rain 的 segment-count 发现`);
  assert.equal(f.status, 'pass', `变体 ${i}（${['只L', '只grapheme', '两者都有'][i]}）下 rain 应能唯一分词成 3 个字位`);
  assert.deepEqual(f.details.graphemeIds, ['r', 'ai', 'n'], `变体 ${i} 的分词结果应是 r/ai/n`);
});
// 三种输入形态下，除 SOUNDS 本身依赖的 DATA-SOUNDS-01（预期不同：L_ONLY 才 fail）之外，
// 其余全部规则的发现应逐字节相同——证明适配层只影响"能不能分词"，不改变别的判定。
function withoutSoundsRule(findings) {
  return findings.filter(f => f.ruleId !== 'DATA-SOUNDS-01').map(f => JSON.stringify(f));
}
assert.deepEqual(withoutSoundsRule(findingsFromL), withoutSoundsRule(findingsFromGrapheme),
  'L-only 与 grapheme-only 两种输入在除 DATA-SOUNDS-01 外的全部发现应完全一致');
assert.deepEqual(withoutSoundsRule(findingsFromGrapheme), withoutSoundsRule(findingsFromBoth),
  'grapheme-only 与两者都有两种输入在除 DATA-SOUNDS-01 外的全部发现应完全一致');
assert.equal(segmentFinding(findingsFromL).status, segmentFinding(findingsFromBoth).status,
  'L-only 与两者都有：分词依赖的发现结果一致（都能借适配层/原生 grapheme 正确分词）');
console.log('PASS migration_audit：临时 L→grapheme 适配层——只L/只grapheme/两者都有 三种形态得到相同的分词类审计结果');

// ============================================================================
// ⑤b（coordinator M-5）：grapheme 与 L 都在但取值冲突——典型形态是别名派生
//    （week02.data.js:106 `SOUNDS.k = Object.assign({}, SOUNDS.c, {L:'k'})`）在
//    第 4a 步迁移过程中只改了基类没改派生行，继承来的 grapheme 会覆盖掉真正想要的
//    显示值。适配层必须显式失败，不能悄悄选 grapheme 而把错误的字形静默地喂给分词。
// ============================================================================
const CONFLICTING_ALIAS = {
  c: { grapheme: 'c', type: 'c' },
  k: { grapheme: 'c', L: 'k', type: 'c' } // 继承自 c 的 grapheme:'c'，但派生行仍标着 L:'k'——冲突
};
assert.throws(() => withGraphemeFallback(CONFLICTING_ALIAS),
  e => e.code === 'grapheme-l-conflict' && /grapheme/.test(e.message) && /不一致/.test(e.message),
  '适配层遇到 grapheme 与 L 冲突（值不同）时必须显式抛错（code=grapheme-l-conflict），不能静默选 grapheme 丢掉 L 的信号');
// 一致的"两者都有"（前面 ⑤ 的 BOTH 变体）不应该被这条新逻辑误伤，顺带回归一次
assert.doesNotThrow(() => withGraphemeFallback(BOTH), '"两者都有但值一致" 不属于冲突，不应该抛错（不能把 M-5 的修复矫枉过正）');
console.log('PASS migration_audit：适配层对 grapheme/L 冲突对（如 c/k 别名迁移不完整）显式失败，不静默；一致的"两者都有"不受影响');

// auditWeek 遇到这种冲突时不应该让整个审计工具崩溃退出，而是转成一条显式的 fail finding
// （审计工具的职责是"报告问题"，不是"遇到问题就整体炸掉让调用方连其余发现都拿不到"）。
const conflictBox = makeSyntheticBox(CONFLICTING_ALIAS);
const conflictFindings = auditWeek(conflictBox, '', 'synthetic.js');
const conflictFinding = conflictFindings.find(f => f.findingId === 'w5:grapheme-l-conflict');
assert(conflictFinding, 'auditWeek 遇到 grapheme/L 冲突时应产出一条 findingId="w5:grapheme-l-conflict" 的发现，而不是让整个审计抛异常退出');
assert.equal(conflictFinding.ruleId, 'DATA-SOUNDS-01');
assert.equal(conflictFinding.status, 'fail');
assert.match(conflictFinding.details.message, /grapheme-l-conflict|不一致/, '冲突 finding 的 details 应带上适配层的原始错误信息，方便定位是哪个 ID 冲突');
console.log('PASS migration_audit：auditWeek 把适配层冲突转成显式 fail finding（DATA-SOUNDS-01/w5:grapheme-l-conflict），审计工具本身不崩溃');

// ============================================================================
// ⑥ 真实 W1–W4：跑真实 buildAudit，做结构性断言（不是内容快照，内容摘要见任务报告）
// ============================================================================
const realDoc = buildAudit(defaultWeekSources());
assert.deepEqual(validateAuditDocument(realDoc), [], '真实四周审计文档必须通过 schema 校验');
assert.equal(typeof realDoc.schemaVersion, 'string');
assert(Array.isArray(realDoc.findings) && realDoc.findings.length > 0);

// 8 个禁止项按清单计数（6 常量 + 2 块类型），不是数矩阵表格行数（PROBE_A/PROBE_B 合并显示会数成 7）
assert.equal(WEEKLY_FORBIDDEN_CONSTANTS.length + WEEKLY_FORBIDDEN_BLOCKS.length, 8,
  '规范 §4.3 weekly 列的禁止项必须是 6 常量 + 2 块类型 = 8 项，不是按矩阵表格行数数出的 7 项');

// 每周 DATA-ASSESS-01 恰好 9 条（1 必需 + 8 禁止）
for (let week = 1; week <= 4; week++) {
  const assessFindings = realDoc.findings.filter(f => f.ruleId === 'DATA-ASSESS-01' && f.week === week);
  assert.equal(assessFindings.length, 9, `W${week} 的 DATA-ASSESS-01 发现数应为 9（1 必需 RESERVED + 8 项禁止），实际 ${assessFindings.length}`);
}

// findingId 在同一 ruleId 内必须唯一——machine check，真实四周 + 全局发现一起跑
assert.deepEqual(findDuplicateFindingIds(realDoc.findings), [], '真实审计文档不应有同 ruleId 内重复的 findingId');

// 排序必须是 buildAudit 自己产出时就已经排好的顺序
const resorted = sortFindings(realDoc.findings.slice());
assert.deepEqual(realDoc.findings, resorted, 'buildAudit 产出的 findings 必须已经按稳定排序键排好');

console.log(`PASS migration_audit：真实 W1–W4 审计文档结构合法，${realDoc.findings.length} 条发现，findingId 唯一性与排序均通过机器校验`);

// ============================================================================
// ⑦（coordinator C-1）：week01 的 spit 是四个字位，DATA-RESERVED-02 的
//    segment-count 发现必须是 fail（按 weekly 目标契约判），不能是 not-applicable
//    ——not-applicable 会被第 5 步的停机条款读成"这条规则不适用，不用管"，从而漏修
//    真正需要换掉的周检词。W1 其余四词仍按同一契约判 pass，且全部 5 条都要如实标注
//    currentlyExempted:true（当前 check_data.js:127 还豁免着，但契约判定不受它影响）。
// ============================================================================
{
  const w1SegmentFindings = realDoc.findings.filter(f => f.ruleId === 'DATA-RESERVED-02' && f.week === 1 && f.findingId.startsWith('w1:segment-count:'));
  assert.equal(w1SegmentFindings.length, 5, 'W1 应有 5 条 segment-count 发现（RESERVED 5 词）');
  assert(w1SegmentFindings.every(f => f.status !== 'not-applicable'),
    'W1 的 segment-count 不应再有 not-applicable——那是 C-1 修复前的判据方向错误，会让第 5 步误判"不需要改"');
  const spitFinding = w1SegmentFindings.find(f => f.findingId === 'w1:segment-count:spit');
  assert(spitFinding, '应该有 spit 的 segment-count 发现');
  assert.equal(spitFinding.status, 'fail', 'spit 是 s/p/i/t 四个字位，按 weekly 目标契约必须是 fail');
  assert.equal(spitFinding.details.graphemeCount, 4, 'spit 的 graphemeCount 应为 4');
  assert.deepEqual(spitFinding.details.graphemeIds, ['s', 'p', 'i', 't']);
  assert.equal(spitFinding.details.currentlyExempted, true, 'W1 的 segment-count 发现都要如实标注"当前校验器还豁免着"');
  const otherFourStatuses = w1SegmentFindings.filter(f => f.findingId !== 'w1:segment-count:spit').map(f => f.status);
  assert(otherFourStatuses.every(s => s === 'pass'), `W1 除 spit 外的四个词（均三字位）应判 pass，实际 ${otherFourStatuses}`);
  assert(w1SegmentFindings.every(f => f.details.currentlyExempted === true), 'W1 全部 5 条 segment-count 都要标 currentlyExempted:true');
  console.log('PASS migration_audit（C-1 修复验证）：W1 的 spit 正确判为 fail（四字位），不再是 not-applicable；其余四词 pass 且全部标注 currentlyExempted');
}

// ============================================================================
// ⑧（coordinator H-3）：墙顺序 details 带有序 wallLettersOrdered/duplicateIds；
//    「L 字段消费点」四条全局发现精确定位到方案 §3.1 影响面表点名的四个消费点。
// ============================================================================
{
  const wallFindings = realDoc.findings.filter(f => f.ruleId === 'DATA-WALL-01' && f.findingId.endsWith('wall-covers-all-sounds'));
  assert.equal(wallFindings.length, 4);
  wallFindings.forEach(f => {
    assert(Array.isArray(f.details.wallLettersOrdered), `W${f.week} wall-covers-all-sounds 的 details 应带有序 wallLettersOrdered`);
    assert(Array.isArray(f.details.duplicateIds), `W${f.week} wall-covers-all-sounds 的 details 应带 duplicateIds（即使为空数组）`);
  });
  console.log('PASS migration_audit（H-3 验证）：wall-covers-all-sounds 的 details 带有序 wallLettersOrdered 与 duplicateIds');
}
{
  const lConsumerFindings = realDoc.findings.filter(f => f.ruleId === 'DATA-SOUNDS-01' && f.findingId.startsWith('l-field-consumer:'));
  assert.equal(lConsumerFindings.length, 4, '「L 字段消费点」应精确对应方案 §3.1 影响面表点名的四处');
  assert(lConsumerFindings.every(f => f.week === null), 'L 字段消费点是代码事实，不挂在具体某一周');
  const expectLocated = (id, file, line) => {
    const f = lConsumerFindings.find(x => x.findingId === 'l-field-consumer:' + id);
    assert(f, `应有 l-field-consumer:${id}`);
    assert.equal(f.source.file, file);
    assert.equal(f.source.line, line, `l-field-consumer:${id} 应精确定位到 ${file}:${line}`);
    assert.equal(f.status, 'fail', '四处目前都还在读 .L，现状应为 fail');
  };
  expectLocated('render-blocks-tileHTML', 'frontend/src/shared/render-blocks.js', 46);
  expectLocated('render-blocks-forms-join', 'frontend/src/shared/render-blocks.js', 49);
  expectLocated('games-flash-display', 'frontend/src/shared/games.js', 1154);
  expectLocated('check-data-schema-gate', 'tools/validation/check_data.js', 83);
  console.log('PASS migration_audit（H-3 验证）：「L 字段消费点」四条全局发现精确定位到方案 §3.1 影响面表点名的四处（render-blocks.js:46/49、games.js:1154、check_data.js:83）');
}

// ============================================================================
// ⑨（coordinator H-4，选定方案：在测试里钉住 status 分布与 fail 清单，不提交 --out
//    产物做 fixture）。
//
// 理由：审计产物本身没有比"能重新生成、且能被结构校验/机器唯一性校验通过"更强的
// 持久化必要——真正要防的回归是"抽取器/规则少收一类、泄漏 finding 静默变少却没有
// 测试变红"。钉住每条 ruleId 的 status 计数分布，加上完整的 fail findingId 清单，
// 直接覆盖这个回归类别：任何一条发现的 status 变化、新增/减少一条 fail、或某个
// findingId 消失，都会让下面某一条 assert.deepEqual 报不匹配。相比提交一份
// --out JSON 文件当 fixture 再做"忽略 generatedAt 的 diff"，这个方案不需要额外维护
// 一份持久化产物（也不需要另外处理 schemaVersion 升级、字段新增等这类会让整份 JSON
// 漂移但语义没变的情况），而且断言本身就是可读的期望值，代码评审时能直接看出
// "这次改动预期让哪些 fail 消失/出现"，比读一份大 JSON diff 更直接。
// 代价：details 内部结构的变化不会被这组断言捕捉到（比如某条 fail 的 message 文案
// 改了但 status 没变）——但那类变化风险由 schema 校验（validateAuditDocument）与
// ⑦⑧ 两组针对具体 details 字段的断言分别兜底，不需要靠"钉整份 JSON"来发现。
// ============================================================================
{
  const REAL_STATUS_COUNTS_BY_RULE = {
    'DATA-ASSESS-01': { pass: 30, fail: 6, 'not-applicable': 0, unknown: 0 },
    'DATA-PATTERN-02': { pass: 0, fail: 13, 'not-applicable': 0, unknown: 0 },
    'DATA-RESERVED-01': { pass: 35, fail: 5, 'not-applicable': 0, unknown: 0 },
    'DATA-RESERVED-02': { pass: 23, fail: 1, 'not-applicable': 0, unknown: 0 },
    'DATA-SOUNDS-01': { pass: 0, fail: 8, 'not-applicable': 0, unknown: 0 },
    'DATA-WALL-01': { pass: 2, fail: 2, 'not-applicable': 0, unknown: 4 }
  };
  const actualByRule = {};
  for (const f of realDoc.findings) {
    actualByRule[f.ruleId] = actualByRule[f.ruleId] || { pass: 0, fail: 0, 'not-applicable': 0, unknown: 0 };
    actualByRule[f.ruleId][f.status]++;
  }
  assert.deepEqual(actualByRule, REAL_STATUS_COUNTS_BY_RULE,
    '真实四周审计的 status 分布必须与钉住的期望值一致——如果这条红了，说明某条规则的判定逻辑或语料覆盖发生了变化，需要人工核实是修复还是回归');
  assert.equal(realDoc.findings.length, 129, `真实审计总条数应为 129，实际 ${realDoc.findings.length}`);

  const REAL_FAIL_FINDING_IDS = [
    'DATA-ASSESS-01/w4:forbidden-block:retest',
    'DATA-ASSESS-01/w4:forbidden:ASSESS_TEXT',
    'DATA-ASSESS-01/w4:forbidden:GLOBAL_RESERVED',
    'DATA-ASSESS-01/w4:forbidden:PROBE_A',
    'DATA-ASSESS-01/w4:forbidden:PROBE_B',
    'DATA-ASSESS-01/w4:forbidden:RESERVED_RETEST',
    'DATA-PATTERN-02/legacy-html-fallback',
    'DATA-PATTERN-02/w1:legacy-format:rackG4',
    'DATA-PATTERN-02/w1:legacy-format:rackG5',
    'DATA-PATTERN-02/w1:legacy-format:wallLetters',
    'DATA-PATTERN-02/w2:legacy-format:rackG4',
    'DATA-PATTERN-02/w2:legacy-format:rackG5',
    'DATA-PATTERN-02/w2:legacy-format:wallLetters',
    'DATA-PATTERN-02/w3:legacy-format:rackG4',
    'DATA-PATTERN-02/w3:legacy-format:rackG5',
    'DATA-PATTERN-02/w3:legacy-format:wallLetters',
    'DATA-PATTERN-02/w4:legacy-format:rackG4',
    'DATA-PATTERN-02/w4:legacy-format:rackG5',
    'DATA-PATTERN-02/w4:legacy-format:wallLetters',
    'DATA-RESERVED-01/w4:definition:dab',
    'DATA-RESERVED-01/w4:definition:nag',
    'DATA-RESERVED-01/w4:definition:nod',
    'DATA-RESERVED-01/w4:definition:rot',
    'DATA-RESERVED-01/w4:definition:sob',
    'DATA-RESERVED-02/w1:segment-count:spit',
    'DATA-SOUNDS-01/l-field-consumer:check-data-schema-gate',
    'DATA-SOUNDS-01/l-field-consumer:games-flash-display',
    'DATA-SOUNDS-01/l-field-consumer:render-blocks-forms-join',
    'DATA-SOUNDS-01/l-field-consumer:render-blocks-tileHTML',
    'DATA-SOUNDS-01/w1:l-field-present',
    'DATA-SOUNDS-01/w2:l-field-present',
    'DATA-SOUNDS-01/w3:l-field-present',
    'DATA-SOUNDS-01/w4:l-field-present',
    'DATA-WALL-01/w2:wall-covers-all-sounds',
    'DATA-WALL-01/w3:wall-covers-all-sounds'
  ].sort();
  const actualFailIds = realDoc.findings.filter(f => f.status === 'fail').map(f => f.ruleId + '/' + f.findingId).sort();
  assert.deepEqual(actualFailIds, REAL_FAIL_FINDING_IDS,
    '真实四周审计的完整 fail findingId 清单必须与钉住的期望值一致（这是第 5 步判断修复范围的直接依据）');
  console.log(`PASS migration_audit（H-4）：真实四周 status 分布与 ${REAL_FAIL_FINDING_IDS.length} 条 fail findingId 清单均已钉住，抽取器/规则若少收一类会在此处变红`);
}
