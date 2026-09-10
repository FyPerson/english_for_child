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
  WEEKLY_FORBIDDEN_CONSTANTS, WEEKLY_FORBIDDEN_BLOCKS,
  L_FIELD_CONSUMER_SPECS, lineOf
} = require('../../tools/validation/migration_audit');
const fs = require('node:fs');
const path = require('node:path');
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const { withGraphemeFallback } = require('../../tools/validation/sounds_grapheme_adapter');
const { collectWordConsumption } = require('../../tools/validation/word_consumers');

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
// findingId 带上错误的 code（grapheme-l-conflict / grapheme-field-invalid 是两种不同的
// 适配层错误，见下一节），不再是写死的单一 'grapheme-l-conflict'。
const conflictBox = makeSyntheticBox(CONFLICTING_ALIAS);
const conflictFindings = auditWeek(conflictBox, '', 'synthetic.js');
const conflictFinding = conflictFindings.find(f => f.findingId === 'w5:grapheme-adapter-error:grapheme-l-conflict');
assert(conflictFinding, 'auditWeek 遇到 grapheme/L 冲突时应产出一条 findingId="w5:grapheme-adapter-error:grapheme-l-conflict" 的发现，而不是让整个审计抛异常退出');
assert.equal(conflictFinding.ruleId, 'DATA-SOUNDS-01');
assert.equal(conflictFinding.status, 'fail');
assert.equal(conflictFinding.details.code, 'grapheme-l-conflict');
assert.match(conflictFinding.details.message, /grapheme-l-conflict|不一致/, '冲突 finding 的 details 应带上适配层的原始错误信息，方便定位是哪个 ID 冲突');
console.log('PASS migration_audit：auditWeek 把适配层冲突转成显式 fail finding（DATA-SOUNDS-01/w5:grapheme-adapter-error:grapheme-l-conflict），审计工具本身不崩溃');

// ============================================================================
// ⑤c（codex high②）：grapheme 键存在但值非法（不是非空字符串），同时有合法 L——
//    改前会被当成"grapheme 键不存在"，静默用 L 派生兜底覆盖掉本该暴露的 schema 错误；
//    改后必须显式抛错 grapheme-field-invalid，不允许被 L 兜底覆盖。
// ============================================================================
const INVALID_GRAPHEME_WITH_VALID_L = {
  z: { grapheme: 123, L: 'a', type: 'c' } // grapheme 键存在但是数字，不是非空字符串
};
// "改前会误判"的证据：按旧版判据 hasGrapheme = typeof entry.grapheme==='string' && ...
// 对 grapheme:123 算 false，于是会被旧逻辑的 `!hasGrapheme && hasLegacyL` 分支收编，
// 静默派生出 grapheme:'a'——把 grapheme 本来是非法值（123）这件事完全盖住了。
const legacyHasGrapheme = typeof INVALID_GRAPHEME_WITH_VALID_L.z.grapheme === 'string'
  && INVALID_GRAPHEME_WITH_VALID_L.z.grapheme.length > 0;
assert.equal(legacyHasGrapheme, false, '"改前"的判据把 grapheme:123 当成"没有 grapheme"，这正是会被静默覆盖的根因');
// "改后被抓住"：
assert.throws(() => withGraphemeFallback(INVALID_GRAPHEME_WITH_VALID_L),
  e => e.code === 'grapheme-field-invalid' && /123/.test(e.message),
  '适配层遇到 grapheme 键存在但值非法（如 123）时必须显式抛错（code=grapheme-field-invalid），不能被 L 兜底静默覆盖');
console.log('PASS migration_audit（codex high②）：grapheme:123 + L:\'a\' 不再被静默改写成 grapheme:\'a\'，而是显式抛错 grapheme-field-invalid');

// 空字符串 grapheme 同样属于"键存在但值非法"
assert.throws(() => withGraphemeFallback({ z: { grapheme: '', L: 'a', type: 'c' } }),
  e => e.code === 'grapheme-field-invalid',
  'grapheme 键存在但是空字符串，同样应显式抛错，不能被 L 兜底覆盖');

// auditWeek 同样把这种情况接住转成 fail finding（不崩溃）
const invalidGraphemeBox = makeSyntheticBox(INVALID_GRAPHEME_WITH_VALID_L);
const invalidGraphemeFindings = auditWeek(invalidGraphemeBox, '', 'synthetic.js');
const invalidGraphemeFinding = invalidGraphemeFindings.find(f => f.findingId === 'w5:grapheme-adapter-error:grapheme-field-invalid');
assert(invalidGraphemeFinding, 'auditWeek 应产出 grapheme-field-invalid 的 fail finding');
assert.equal(invalidGraphemeFinding.status, 'fail');
assert.equal(invalidGraphemeFinding.details.code, 'grapheme-field-invalid');
console.log('PASS migration_audit（codex high②）：auditWeek 把 grapheme-field-invalid 转成显式 fail finding，审计工具不崩溃');

// 键完全不存在（不是"存在但非法"）时，兜底行为必须保持不变——不能矫枉过正
const trulyMissingGrapheme = { z: { L: 'a', type: 'c' } }; // 没有 grapheme 键
// M6（2026-09-09 里程碑 2 收口批）：4a 收敛后适配层默认不再从 L 静默派生 grapheme——
// 必须显式传 { allowLegacyFallback: true } 才启用旧兜底行为，逼人把 grapheme 写全，
// 不让"键存在但笔误"这类情况被悄悄放行。
assert.doesNotThrow(() => withGraphemeFallback(trulyMissingGrapheme, { allowLegacyFallback: true }),
  'grapheme 键完全缺失、L 合法、显式打开 allowLegacyFallback 时应正常派生，不应该被 high② 的修复误伤');
assert.equal(withGraphemeFallback(trulyMissingGrapheme, { allowLegacyFallback: true }).z.grapheme, 'a',
  '键完全缺失且显式打开兜底时仍应派生出 grapheme:=L');
console.log('PASS migration_audit（回归）：grapheme 键完全缺失（不是存在但非法）、显式打开 allowLegacyFallback 时仍正常从 L 派生，未被 high② 误伤');

// M6 新增：不传 allowLegacyFallback（默认行为）时，同样的"只有 L 没有 grapheme"必须
// 显式抛错，不能悄悄派生——这是防止 gen_segments.js 之类的调用方在 W5 手滑写成
// `L:'ai'` 缺 grapheme 的数据上静默出错误建议的核心防线。
assert.throws(() => withGraphemeFallback(trulyMissingGrapheme),
  e => e.code === 'grapheme-missing-legacy-fallback-disabled' && /allowLegacyFallback/.test(e.message),
  '默认（不传 allowLegacyFallback）时，grapheme 键完全缺失、L 合法应显式抛错，不再静默派生');
assert.throws(() => withGraphemeFallback(trulyMissingGrapheme, {}),
  e => e.code === 'grapheme-missing-legacy-fallback-disabled',
  '显式传空 options（未打开 allowLegacyFallback）同样应抛错，不能被"传了 options 就当作打开"误判');
console.log('PASS migration_audit（M6）：默认（或未显式打开）不再从 L 静默派生 grapheme，需显式 { allowLegacyFallback: true } 才兜底');

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
// ⑦（coordinator C-1，2026-09-09 里程碑 2 第 5 步 P8 后更新）：week01 的周检词
//    spit 是四个字位（s/p/i/t），按 weekly 目标契约必须 fail——C-1 把判据方向
//    从 not-applicable 改成按契约判 fail，避免第 5 步误读"不需要改"而漏修。
//    第 5 步 P8 已把 spit 换成 pit（用户 2026-09-09 拍板：spit 里的 p 因 /s/ 后
//    去送气而听成"必"，与刚教的送气 p 不是一个音，不适合当周检词；pit 三字位、
//    词首 p 送气、语义干净）。这里的断言相应更新为"验证修复结果"：W1 全部 5 个
//    RESERVED 词现在都是三字位、都 pass，不应再有任何 fail。 */
// ============================================================================
{
  const w1SegmentFindings = realDoc.findings.filter(f => f.ruleId === 'DATA-RESERVED-02' && f.week === 1 && f.findingId.startsWith('w1:segment-count:'));
  assert.equal(w1SegmentFindings.length, 5, 'W1 应有 5 条 segment-count 发现（RESERVED 5 词）');
  assert(w1SegmentFindings.every(f => f.status !== 'not-applicable'),
    'W1 的 segment-count 不应再有 not-applicable——那是 C-1 修复前的判据方向错误，会让第 5 步误判"不需要改"');
  assert(!w1SegmentFindings.some(f => f.findingId === 'w1:segment-count:spit'),
    'spit 已在第 5 步 P8 被换成 pit，不应再出现在 RESERVED 里');
  const pitFinding = w1SegmentFindings.find(f => f.findingId === 'w1:segment-count:pit');
  assert(pitFinding, '应该有 pit 的 segment-count 发现（P8 换词后的新周检词）');
  assert.equal(pitFinding.status, 'pass', 'pit 是 p/i/t 三个字位，应判 pass');
  assert.equal(pitFinding.details.graphemeCount, 3, 'pit 的 graphemeCount 应为 3');
  assert.deepEqual(pitFinding.details.graphemeIds, ['p', 'i', 't']);
  const allStatuses = w1SegmentFindings.map(f => f.status);
  assert(allStatuses.every(s => s === 'pass'), `P8 换词后 W1 全部 5 个周检词（均三字位）应判 pass，实际 ${allStatuses}`);
  // L4（里程碑 2 第 5 步预筛）之后：check_data.js 的 `META.week === 1 ||` 豁免已随
  // pit 换词被删除（W1 五词全是三个字母，豁免零风险移除），currentlyExempted 因此
  // 恒为 false，不再随 week===1 变化——不是这批测试遗漏，是事实随之改变。
  assert(w1SegmentFindings.every(f => f.details.currentlyExempted === false), 'L4 删掉 check_data.js 的 week===1 豁免后，W1 全部 5 条 segment-count 都应标 currentlyExempted:false（不再豁免）');
  console.log('PASS migration_audit（C-1 修复 + P8 换词验证 + L4 豁免删除）：W1 的 pit 正确判为 pass（三字位），spit 已不在数据里；全部 5 词的 currentlyExempted 已随豁免删除改为 false');
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
  /* 轮 D L2（外审，2026-09-10）：改前这里对四处已知消费点各自钉死一个绝对行号，
     每次被扫描文件（render-blocks.js/games.js/check_data.js）里其他与消费点本身
     无关的改动（新增注释、插入一行 require、新增共享函数……）导致行号漂移，这份
     断言就要跟着手工更新一次——上面这段沿革注释在删除前已经记录了九次这类"纯漂移"
     更新，行号本身从不是这条测试真正关心的东西，真正关心的是"pattern 还能不能在
     文件里找到、status 是不是 pass"。
     改法：不再钉死行号，而是在测试运行时用 L_FIELD_CONSUMER_SPECS 里同一份 pattern
     （migration_audit.js 导出，不在测试里另外重复维护一份规则，避免两处判据分叉）
     对磁盘上的当前文件内容重新定位一次，得到"现在应该在哪一行"，再与 finding 报出的
     source.line 比较是否一致——这样文件里其他内容的行数变化不会让断言变红，行号
     退化为"两次计算是否互相印证"的诊断，不是硬编码基准。 */
  const expectMigrated = id => {
    const spec = L_FIELD_CONSUMER_SPECS.find(s => s.id === id);
    assert(spec, `L_FIELD_CONSUMER_SPECS 里应有 id=${id} 的消费点定义`);
    const f = lConsumerFindings.find(x => x.findingId === 'l-field-consumer:' + id);
    assert(f, `应有 l-field-consumer:${id}`);
    assert.equal(f.source.file, spec.file);
    assert.equal(f.status, 'pass', '四处已在 4a 步完成 L→grapheme 收敛，按新 pattern 应判 pass（消费点确实读取 grapheme）');
    assert.equal(f.details.consumesGrapheme, true);
    // 稳定定位：用同一份 pattern 现读磁盘文件重新算一次期望行号，不用绝对行号快照。
    const raw = fs.readFileSync(path.join(REPO_ROOT, spec.file), 'utf8');
    const m = spec.pattern.exec(raw);
    assert(m, `spec.pattern（${spec.id}）应该能在 ${spec.file} 里现算匹配到，否则 auditWeek 本身也不该判 pass`);
    const expectedLine = lineOf(raw, m.index);
    assert.equal(f.source.line, expectedLine,
      `l-field-consumer:${id} 报出的行号（${f.source.line}）应与用同一份 pattern 现算的行号（${expectedLine}）一致`);
  };
  expectMigrated('render-blocks-tileHTML');
  expectMigrated('render-blocks-forms-join');
  expectMigrated('games-flash-display');
  expectMigrated('check-data-schema-gate');
  console.log('PASS migration_audit（H-3 验证 + H2 回归 + 4b 二次更新 + 轮 D L2 去硬编码行号）：「L 字段消费点」四条全局发现已从 unknown 恢复为可判定的 pass，行号改按同一份 pattern 现算校验，不再随无关改动漂移');
}

// ============================================================================
// ⑧b（codex high①）：wall-covers-all-sounds 的 duplicateIds 必须参与 pass/fail 判定。
//    改前：集合完整（missing/extra 都空）但含重复项的墙会被误判成 pass。
//    改后：缺项、额外项、重复项三者各自独立地能把它判成 fail，各给一条反例 fixture，
//    外加一条"三者都干净"的正例。
// ============================================================================
{
  const soundsAB = { a: { grapheme: 'a', type: 'v' }, b: { grapheme: 'b', type: 'c' } };
  const boxWith = wallLetters => Object.assign(makeSyntheticBox(soundsAB), { META: Object.assign({}, makeSyntheticBox(soundsAB).META, { wallLetters }) });
  const wallFinding = wallLetters => auditWeek(boxWith(wallLetters), '', 'synthetic.js')
    .find(f => f.findingId === 'w5:wall-covers-all-sounds');

  const clean = wallFinding('ab');
  assert.equal(clean.status, 'pass', '墙 "ab" 恰好等于 SOUNDS 全集 {a,b}、无重复，应该 pass');
  assert.deepEqual(clean.details, Object.assign({}, clean.details, { hasMissing: false, hasExtra: false, hasDuplicates: false }));

  const missingOnly = wallFinding('a'); // 缺 b，无额外项，无重复
  assert.equal(missingOnly.status, 'fail', '缺项单独就应该判 fail（正例：只缺 b，其余都干净）');
  assert.deepEqual(missingOnly.details.missingFromWall, ['b']);
  assert.equal(missingOnly.details.hasMissing, true);
  assert.equal(missingOnly.details.hasExtra, false);
  assert.equal(missingOnly.details.hasDuplicates, false);

  const extraOnly = wallFinding('abz'); // 全集齐全 + 一个 SOUNDS 里没有的 z，无重复
  assert.equal(extraOnly.status, 'fail', '额外项单独就应该判 fail（正例：多了一个不存在于 SOUNDS 的 z，其余都干净）');
  assert.deepEqual(extraOnly.details.extraInWall, ['z']);
  assert.equal(extraOnly.details.hasMissing, false);
  assert.equal(extraOnly.details.hasExtra, true);
  assert.equal(extraOnly.details.hasDuplicates, false);

  const duplicateOnly = wallFinding('aab'); // 集合完整 {a,b}，无额外项，但 a 重复了一次
  // 改前的证据：missingFromWall 与 extraInWall 都是空数组，旧判据
  // `missingFromWall.length===0 && extraInWall.length===0` 会算出 pass——这正是 high①
  // 要修的误判。
  assert.deepEqual(duplicateOnly.details.missingFromWall, [], '"改前会误判"的前提：集合完整，缺项确实是空的');
  assert.deepEqual(duplicateOnly.details.extraInWall, [], '"改前会误判"的前提：无额外项');
  const legacyWouldPass = duplicateOnly.details.missingFromWall.length === 0 && duplicateOnly.details.extraInWall.length === 0;
  assert.equal(legacyWouldPass, true, '按"改前"的判据（只看 missing/extra）这条会被误判成 pass');
  // 改后：
  assert.equal(duplicateOnly.status, 'fail', '重复项单独就应该判 fail（正例：wallLetters="aab"，a 重复但集合完整）');
  assert.deepEqual(duplicateOnly.details.duplicateIds, ['a']);
  assert.equal(duplicateOnly.details.hasDuplicates, true);
  assert.equal(duplicateOnly.details.hasMissing, false);
  assert.equal(duplicateOnly.details.hasExtra, false);
  console.log('PASS migration_audit（codex high①）：墙的缺项/额外项/重复项各自独立触发 fail；"集合完整但含重复"改前会误判为 pass、改后被抓住（duplicateOnly 用例）');
}

// ============================================================================
// ⑧c（codex high③）：word_consumers.js 遇到 catalog 之外的未知块类型必须显式失败，
//    不能被 switch 的 default 静默跳过；auditWeek 要把它接住转成 DATA-BLOCK-01 的
//    fail finding，不让审计工具整体崩溃。
// ============================================================================
{
  const unknownBlockBox = {
    META: { week: 5 }, RESERVED: [], SOUNDS: {}, W: {}, WALL_HINT: {}, BOOK: { pages: [] }, FIRST_TEACH_DAY: {},
    G1_ROUNDS: {}, G1_THEME: {}, G3_PAIRS: [], G4_WORDS: [], G5_WHITELIST: [],
    DAYS: [{ n: 1, steps: [{ t: '', min: 30, blocks: [{ b: 'totally-unknown-block-type' }] }] }]
  };
  assert.throws(() => collectWordConsumption(unknownBlockBox),
    e => e.code === 'unknown-block-type' && e.blockType === 'totally-unknown-block-type',
    'collectWordConsumption 遇到 catalog 之外的块类型必须显式抛错（DATA-BLOCK-01），不能静默 continue/break');
  console.log('PASS migration_audit（codex high③）：collectWordConsumption 对未知块类型显式失败，不再静默跳过');

  const unknownBlockFindings = auditWeek(unknownBlockBox, '', 'synthetic.js');
  const blockFinding = unknownBlockFindings.find(f => f.findingId === 'w5:unknown-block-type');
  assert(blockFinding, 'auditWeek 应该把未知块类型的异常接住，转成一条 findingId="w5:unknown-block-type" 的发现');
  assert.equal(blockFinding.ruleId, 'DATA-BLOCK-01');
  assert.equal(blockFinding.status, 'fail');
  assert.equal(blockFinding.details.blockType, 'totally-unknown-block-type');
  console.log('PASS migration_audit（codex high③）：auditWeek 把未知块类型转成显式 fail finding（DATA-BLOCK-01），审计工具本身不崩溃');
}

// ============================================================================
// ⑧d（codex high④）：DATA-RESERVED-01 的释义查找必须用自有键而不是直接属性读取，
//    并校验释义值的 schema（对象 + 非空 zh），不能任意 truthy 值就算数。
// ============================================================================
{
  // "改前会误判"的证据：`!!({}).toString` 是 truthy（函数），旧版 `!!W[word]` 会把
  // RESERVED 词恰好撞上 Object.prototype 属性名（如 'constructor'）误判成"有释义"。
  const legacyWouldPass = !!({}).constructor;
  assert.equal(legacyWouldPass, true, '"改前"的判据 !!W[word] 对原型链属性 constructor 会误判为 truthy（有释义）');

  const protoBox = Object.assign(makeSyntheticBox({ a: { grapheme: 'a', type: 'v' } }), {
    RESERVED: ['constructor'], W: {} // W 是空对象，但 {}.constructor 走原型链能拿到 Object 构造函数
  });
  const defFinding = auditWeek(protoBox, '', 'synthetic.js').find(f => f.findingId === 'w5:definition:constructor');
  assert(defFinding, '应有 constructor 的 definition 发现');
  assert.equal(defFinding.status, 'fail', '改后：W 里没有自有键 constructor，即使原型链上有同名属性也必须判 fail');
  assert.equal(defFinding.details.hasOwnKey, false);
  console.log('PASS migration_audit（codex high④）：definition 检查改用自有键查找后，RESERVED=[\'constructor\']（W={}）正确判 fail，不再被原型链属性误判为 pass');

  // schema 校验：W 里确实有这个键，但值不符合 {zh,...} 的 schema（比如是个空对象/纯字符串）
  const badSchemaBox = Object.assign(makeSyntheticBox({ a: { grapheme: 'a', type: 'v' } }), {
    RESERVED: ['cat'], W: { cat: {} } // 有自有键，但缺 zh——旧版 !!W['cat'] 对 {} 同样是 truthy，会误判 pass
  });
  const legacyWouldPassSchema = !!badSchemaBox.W.cat;
  assert.equal(legacyWouldPassSchema, true, '"改前"的判据对缺 zh 的空对象同样误判为 truthy（有释义）');
  const badSchemaFinding = auditWeek(badSchemaBox, '', 'synthetic.js').find(f => f.findingId === 'w5:definition:cat');
  assert.equal(badSchemaFinding.status, 'fail', '改后：释义值缺 zh 字段，不符合 W 条目 schema，必须判 fail');
  assert.equal(badSchemaFinding.details.hasOwnKey, true);
  assert.equal(badSchemaFinding.details.schemaValid, false);
  console.log('PASS migration_audit（codex high④）：definition 检查额外校验 W 条目 schema（对象+非空 zh），缺 zh 的空对象不再被当成"有释义"');

  // 大小写口径统一：definition 与 leak 现在都按小写归一化比较
  const caseBox = Object.assign(makeSyntheticBox({ a: { grapheme: 'a', type: 'v' } }), {
    RESERVED: ['Cat'], W: { cat: { zh: '猫' } }
  });
  const caseFinding = auditWeek(caseBox, '', 'synthetic.js').find(f => f.findingId === 'w5:definition:Cat');
  assert.equal(caseFinding.status, 'pass', 'RESERVED 词 "Cat" 与 W 键 "cat" 大小写不同，但归一化后应视为同一个词，判 pass');
  console.log('PASS migration_audit（codex high④）：definition 查找按小写归一化比较，与 leak 检测口径统一');
}

// ============================================================================
// ⑧e（codex low）：validateAuditDocument 对 week/source.line/source.column 收紧为
//    非负整数（拒绝 NaN/Infinity/负数/小数），ruleId 收紧为 DATA-* 命名空间格式。
// ============================================================================
{
  const rejectSchema = (label, mutate) => {
    const doc = validDoc();
    mutate(doc);
    const problems = validateAuditDocument(doc);
    assert(problems.length > 0, `${label}: 期望 validateAuditDocument 报告问题，实际为空`);
    return problems;
  };
  rejectSchema('week 是小数', d => { d.findings[0].week = 1.5; });
  rejectSchema('week 是负数', d => { d.findings[0].week = -1; });
  rejectSchema('week 是 NaN', d => { d.findings[0].week = NaN; });
  rejectSchema('week 是 Infinity', d => { d.findings[0].week = Infinity; });
  rejectSchema('source.line 是小数', d => { d.findings[0].source.line = 2.5; });
  rejectSchema('source.line 是负数', d => { d.findings[0].source.line = -1; });
  rejectSchema('source.line 是 NaN', d => { d.findings[0].source.line = NaN; });
  rejectSchema('source.column 是 Infinity', d => { d.findings[0].source.column = Infinity; });
  rejectSchema('ruleId 不匹配 DATA-* 命名空间', d => { d.findings[0].ruleId = 'not-a-rule-id'; });
  rejectSchema('ruleId 是小写', d => { d.findings[0].ruleId = 'data-x'; });
  // 合法值仍应该通过（不能矫枉过正）
  assert.deepEqual(validateAuditDocument(validDoc()), [], '合法的最小文档（week/line 均为非负整数，ruleId 匹配 DATA-* 格式）在收紧后仍应通过');
  console.log('PASS migration_audit（codex low）：week/source.line/source.column 收紧为非负整数，ruleId 收紧为 DATA-* 命名空间格式，10 类反例全部被拒绝，合法文档仍通过');
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
    /* 2026-09-09 里程碑 2 第 7 步（数据迁移）后更新：wallLetters/rackG4/rackG5 四周
       12 条 legacy-format fail 全部转 pass（三个字段已迁成 ID 数组）；仅剩
       legacy-html-fallback 1 条 fail（load_data.js 的 HTML 兜底按方案 §3.8 延后到
       第 8 步处置，本步不动）。 */
    'DATA-PATTERN-02': { pass: 12, fail: 1, 'not-applicable': 0, unknown: 0 },
    /* P16（主会话裁定，2026-09-10）后更新：check_data.js 删掉了 `META.week >= 4 ||
       W[w]` 那条豁免，frontend/src/weeks/week04.data.js 同步把 RESERVED 五词
       （dab/nag/nod/rot/sob）补进 W——原先 5 条 w4:definition:* fail 全部转 pass，
       40 条全部 pass，不再有 fail。 */
    'DATA-RESERVED-01': { pass: 40, fail: 0, 'not-applicable': 0, unknown: 0 },
    /* 2026-09-09 里程碑 2 第 5 步 P8：W1 周检词 spit（4 字位）换成 pit（3 字位）后，
       segment-count 24 条全部 pass，不再有 fail。 */
    'DATA-RESERVED-02': { pass: 24, fail: 0, 'not-applicable': 0, unknown: 0 },
    /* 2026-09-09 里程碑 2 收口批 H2 后更新：四周 w{1..4}:l-field-present 早先已从
       fail 转 pass（SOUNDS 条目不再是"只有 L 没有 grapheme"）；四条 l-field-consumer
       本批把 pattern 改指向 grapheme 等价写法后，从 unknown 恢复为 pass（消费点确实
       按预期读取 grapheme，见 §287 附近 expectMigrated 断言）。8 条全部 pass。 */
    'DATA-SOUNDS-01': { pass: 8, fail: 0, 'not-applicable': 0, unknown: 0 },
    /* 2026-09-09 里程碑 2 第 7 步后更新：wallLetters 已按方案 §2.4 统一为累计全集
       （W2 7→13、W3 6→19），w2/w3:wall-covers-all-sounds 从 fail 转 pass（w1/w4 本就
       pass），DATA-WALL-01 现在 4 条 pass、0 条 fail。
       2026-09-10 里程碑 2 收口批 M-8 后更新：newPatterns-presence 的 4 条从 unknown
       改判 not-applicable——第 7 步已完成，"要等第 7 步才能算真相源"这条理由现在为假
       （累计教学顺序真相源已在 check_data.js 的 DATA-WALL-01 五条断言里落地并对四周
       真实数据验证通过，见 tests/unit/test_wall_order.js）。仍然"不在这个一次性预
       迁移快照工具里重复实现第二套真相源计算"（避免两个实现者分别做出结果、两端
       漂移），但状态不该继续挂 unknown——按方案口径 unknown 必须被后续步骤视为未
       完成证据，永远挂着就是给自己埋一条完成不了的待办；not-applicable（这条规则
       在这个工具里已不需要判定）才是准确状态。 */
    'DATA-WALL-01': { pass: 4, fail: 0, 'not-applicable': 4, unknown: 0 }
  };
  const actualByRule = {};
  for (const f of realDoc.findings) {
    actualByRule[f.ruleId] = actualByRule[f.ruleId] || { pass: 0, fail: 0, 'not-applicable': 0, unknown: 0 };
    actualByRule[f.ruleId][f.status]++;
  }
  assert.deepEqual(actualByRule, REAL_STATUS_COUNTS_BY_RULE,
    '真实四周审计的 status 分布必须与钉住的期望值一致——如果这条红了，说明某条规则的判定逻辑或语料覆盖发生了变化，需要人工核实是修复还是回归');
  assert.equal(realDoc.findings.length, 129, `真实审计总条数应为 129，实际 ${realDoc.findings.length}`);
  /* 总条数不变（129）：第 7 步只是把已有 finding 的 status 从 fail 改判为 pass
     （字段格式与墙集合从不合规变成合规），不新增不减少 finding 条数——newPatterns
     字段本身虽新增到 META 里，但 newPatterns-presence 这条 finding 本来就存在
     （只是 details.present 从 false 变 true）。
     L1（外审 low，2026-09-10）：本条注释原写"status 不变仍是 unknown"——已随
     上方 M-8 更新（见 §515 附近注释）作废：newPatterns-presence 的 4 条第 7 步后
     已从 unknown 改判 not-applicable。这里只是重申"总条数 129 不变"这件事跟
     status 具体怎么变无关——不管某条 finding 的 status 在哪一步从什么改判成什么，
     只要没有 finding 被新增或删除，总条数就不受影响；不要把"计数不变"误读成
     "status 也不变"。 */

  const REAL_FAIL_FINDING_IDS = [
    'DATA-ASSESS-01/w4:forbidden-block:retest',
    'DATA-ASSESS-01/w4:forbidden:ASSESS_TEXT',
    'DATA-ASSESS-01/w4:forbidden:GLOBAL_RESERVED',
    'DATA-ASSESS-01/w4:forbidden:PROBE_A',
    'DATA-ASSESS-01/w4:forbidden:PROBE_B',
    'DATA-ASSESS-01/w4:forbidden:RESERVED_RETEST',
    'DATA-PATTERN-02/legacy-html-fallback'
    // P16（2026-09-10）后：原来的 5 条 DATA-RESERVED-01/w4:definition:{dab,nag,nod,
    // rot,sob} fail 已随 W4 数据补齐 W 释义转为 pass，不再出现在这份 fail 清单里。
  ].sort();
  const actualFailIds = realDoc.findings.filter(f => f.status === 'fail').map(f => f.ruleId + '/' + f.findingId).sort();
  assert.deepEqual(actualFailIds, REAL_FAIL_FINDING_IDS,
    '真实四周审计的完整 fail findingId 清单必须与钉住的期望值一致（这是第 5 步判断修复范围的直接依据）');
  console.log(`PASS migration_audit（H-4）：真实四周 status 分布与 ${REAL_FAIL_FINDING_IDS.length} 条 fail findingId 清单均已钉住，抽取器/规则若少收一类会在此处变红`);
}

// ============================================================================
// M3（里程碑 2 第 5 步预筛，2026-09-10 收口批 M-8 更新）：「范围停手」只数了 fail，
// 漏掉了 W1—W4 各一条 DATA-WALL-01/newPatterns-presence 的 unknown——而"unknown
// 必须被后续步骤视为未完成证据、不能等同于 pass"是方案第 7 步写死的规则。这条断言
// 原先显式钉住这 4 条的 findingId + status（unknown），防止它们被「范围停手」静默
// 跳过。
//
// M-8（2026-09-10 里程碑 2 收口批）：第 7 步已经完成，"newPatterns 累计教学顺序
// 真相源要等第 7 步才能算"这条理由现在为假——真相源已经在 check_data.js 的
// DATA-WALL-01 五条断言（wall_order.js 的 computeTeachingOrder/gatherWeekRecordsUpTo）
// 里落地，并对四周真实数据验证通过、0 fail（见上面 ⑨ 的 DATA-WALL-01:
// {pass:4, fail:0, 'not-applicable':4, unknown:0} 与 tests/unit/test_wall_order.js）。
// migration_audit.js 相应把这 4 条的 status 从 unknown 改判 not-applicable——
// 仍然"不在这个一次性预迁移快照工具里重复实现第二套真相源计算"（避免两个实现者
// 分别做出结果、两端漂移），但不再继续给自己埋一条永远完成不了的 unknown 待办。
// 这条断言相应改成显式钉住 not-applicable，不让状态被静默改判成别的值；M3 原本
// 防止「范围停手」漏掉未完成项的目的，现在由「这 4 条已经是 not-applicable、
// 真正的判定结论在 check_data.js 里全绿」这件事本身保证，不再需要挡着 unknown。
// ============================================================================
{
  const EXPECTED_NOT_APPLICABLE_NEW_PATTERNS_IDS = ['w1:newPatterns-presence', 'w2:newPatterns-presence', 'w3:newPatterns-presence', 'w4:newPatterns-presence'];
  for (const findingId of EXPECTED_NOT_APPLICABLE_NEW_PATTERNS_IDS) {
    const f = realDoc.findings.find(x => x.ruleId === 'DATA-WALL-01' && x.findingId === findingId);
    assert(f, `真实四周审计应存在 DATA-WALL-01/${findingId} 这条发现`);
    assert.equal(f.status, 'not-applicable',
      `DATA-WALL-01/${findingId} 的 status 应为 not-applicable（第 7 步已完成，真相源已在 check_data.js 落地验证通过，这条快照式 finding 不再需要判定），实际：${f.status}`);
    // 第 7 步后 present 应为 true（newPatterns 字段已迁入四周 META），value 应是
    // 该周真实的 newPatterns 数组——status 改判不代表这条 finding 的 details 没有
    // 随数据迁移更新，两件事分开验证。
    assert.equal(f.details.present, true, `DATA-WALL-01/${findingId} 的 details.present 第 7 步后应为 true`);
    assert(Array.isArray(f.details.value), `DATA-WALL-01/${findingId} 的 details.value 第 7 步后应是数组`);
  }
  console.log('PASS M3 回归 + M-8 改判：W1—W4 各一条 DATA-WALL-01/newPatterns-presence 已从 unknown 改判 not-applicable 并显式钉住 findingId + status（present 已变 true），不被「范围停手」静默跳过');
}
