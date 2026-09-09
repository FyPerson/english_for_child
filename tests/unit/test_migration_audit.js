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
