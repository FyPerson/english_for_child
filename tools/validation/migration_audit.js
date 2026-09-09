/* 迁移前审计（里程碑 2 第 3 步）。
 *
 * 目的：对真实 W1—W4 输出做只读审计，产出机器可读、带来源位置的发现列表，供第 5、7、9 步
 * 直接消费而不是人工抄写。schema 与内容范围逐字照方案：
 *   docs/里程碑2实施方案_20260908_v1.7.md §5「迁移前审计」行（schema）
 *   《周课件数据层交接规范 v2.0》§4.3 `assessmentMode` 契约矩阵（weekly 列必需/禁止项）
 *
 * 本工具只读：不修改 frontend/src/weeks/weekNN.data.js 或任何其他文件。
 *
 * CLI：
 *   node tools/validation/migration_audit.js            打印 JSON 到 stdout
 *   node tools/validation/migration_audit.js --out F.json  同时写入文件
 */
const fs = require('fs');
const path = require('path');
const { loadData, declaration } = require('./load_data');
const { collectWordConsumption } = require('./word_consumers');
const { withGraphemeFallback } = require('./sounds_grapheme_adapter');
const { segmentWord } = require('../../frontend/src/shared/graphemes');

const REPO = path.resolve(__dirname, '..', '..');
const SCHEMA_VERSION = '1.0.0';

/* 规范 §4.3 契约矩阵 weekly 列：必需 RESERVED；禁止 6 个常量 + 2 个块类型，
 * 按方案任务书要求「按这份清单计数，不要数矩阵表格的行数」（PROBE_A/PROBE_B 在表里
 * 合并显示成一行，数行会得到 7）——这里逐项列全，一共 8 项。 */
const WEEKLY_FORBIDDEN_CONSTANTS = ['RESERVED_RETEST', 'ASSESS_TEXT', 'GLOBAL_RESERVED', 'PROBE_A', 'PROBE_B', 'ANNUAL_DECODING'];
const WEEKLY_FORBIDDEN_BLOCKS = ['retest', 'probe'];
const LEGACY_ARRAY_FIELDS = ['wallLetters', 'rackG4', 'rackG5'];

const STATUS_VALUES = new Set(['pass', 'fail', 'not-applicable', 'unknown']);

function lineOf(raw, index) {
  if (index == null || index < 0) return null;
  return raw.slice(0, index).split('\n').length;
}

/* 复用 load_data.js 的 declaration() 取顶层常量声明的原始文本，再在 raw 里定位其起始行。
 * 找不到该常量时 present:false、line:null——"line 可空"的第一种情形：该项在文件中未声明。 */
function locateDeclaration(raw, name) {
  const text = declaration(raw, name);
  if (!text) return { present: false, line: null };
  const idx = raw.indexOf(text);
  return { present: true, line: lineOf(raw, idx) };
}

/* retest/probe 两种块类型不是顶层 const 声明，declaration() 抓不到，改在 DAYS 的原始
 * 文本里找 `b:'retest'` / `"b": "retest"` 这类写法（四周数据在紧凑 JS 风格与 JSON 风格
 * 之间混用，见 week01 的 META 是 JSON 风格、week04 的块是 JSON 风格），用一个能兼容
 * 两种引号/空格写法的正则。 */
function locateBlockOccurrences(raw, blockType) {
  const re = new RegExp('["\']?\\bb["\']?\\s*:\\s*["\']' + blockType + '["\']', 'g');
  const lines = [];
  let m;
  while ((m = re.exec(raw))) lines.push(lineOf(raw, m.index));
  return lines;
}

function pushFinding(findings, f) {
  if (!STATUS_VALUES.has(f.status)) {
    throw new Error('非法 status（不在闭集枚举内）：' + f.status + ' @ ' + f.ruleId + '/' + f.findingId);
  }
  if (!f.source || typeof f.source.file !== 'string' || !f.source.file) {
    throw new Error('finding.source.file 必填：' + f.ruleId + '/' + f.findingId);
  }
  findings.push(f);
}

/* auditWeek(box, raw, file) -> Array<finding>：对一周已加载的数据做全部规则检查。
 * 独立导出，方便测试直接喂合成 box + 任意 raw/file（不必真的落盘四周文件），
 * 尤其是 L/grapheme 两种形态的适配层等价性测试。 */
function auditWeek(box, raw, file) {
  const findings = [];
  const week = box.META && box.META.week;
  /* findingId 只需在同一 ruleId 内唯一（方案 §5），但同一 ruleId 会横跨四周产生同名的
     子项（如每周都有一条 'count'），所以在这里统一加周次前缀，避免跨周撞车。 */
  const weekTag = 'w' + week + ':';
  const META = box.META || {};
  const RESERVED = Array.isArray(box.RESERVED) ? box.RESERVED : [];
  const SOUNDS = box.SOUNDS || {};
  const W = box.W || {};
  const adaptedSounds = withGraphemeFallback(SOUNDS);
  const consumption = collectWordConsumption(box);

  const reservedLoc = locateDeclaration(raw, 'RESERVED');
  const soundsLoc = locateDeclaration(raw, 'SOUNDS');
  const wLoc = locateDeclaration(raw, 'W');
  const metaLoc = locateDeclaration(raw, 'META');

  /* ---- DATA-ASSESS-01：weekly 列必需 RESERVED + 8 项禁止（现状事实，不预判本周是否会
     声明 assessmentMode:'weekly'——见方案 §0.3，W1-W3 会走 weekly、W4 走 monthly，
     两者现状都如实记录，留给第 5 步按路由表决定怎么处置） ---- */
  pushFinding(findings, {
    findingId: weekTag + 'required:RESERVED',
    ruleId: 'DATA-ASSESS-01',
    week: week,
    status: reservedLoc.present ? 'pass' : 'fail',
    source: { file: file, line: reservedLoc.present ? reservedLoc.line : null, column: null },
    details: { item: 'RESERVED', requirement: 'required-for-weekly', present: reservedLoc.present }
  });
  WEEKLY_FORBIDDEN_CONSTANTS.forEach(name => {
    const loc = locateDeclaration(raw, name);
    pushFinding(findings, {
      findingId: weekTag + 'forbidden:' + name,
      ruleId: 'DATA-ASSESS-01',
      week: week,
      status: loc.present ? 'fail' : 'pass',
      source: { file: file, line: loc.present ? loc.line : null, column: null },
      details: {
        item: name, requirement: 'forbidden-for-weekly', present: loc.present,
        note: '现状事实：本周尚未声明 assessmentMode（规范 v2.0 §4.3 最小路由，里程碑 2 第 5 步落地）；本发现只表示当前数据是否满足 weekly 列的禁止项条件，不代表本周最终会走 weekly 路由'
      }
    });
  });
  WEEKLY_FORBIDDEN_BLOCKS.forEach(blockType => {
    const lines = locateBlockOccurrences(raw, blockType);
    pushFinding(findings, {
      findingId: weekTag + 'forbidden-block:' + blockType,
      ruleId: 'DATA-ASSESS-01',
      week: week,
      status: lines.length > 0 ? 'fail' : 'pass',
      source: { file: file, line: lines.length > 0 ? lines[0] : null, column: null },
      details: { item: blockType + ' 块', requirement: 'forbidden-for-weekly', present: lines.length > 0, occurrences: lines.length, lines: lines }
    });
  });

  /* ---- DATA-RESERVED-02：周检 5 词 + 每词三个字位 ---- */
  pushFinding(findings, {
    findingId: weekTag + 'count',
    ruleId: 'DATA-RESERVED-02',
    week: week,
    status: RESERVED.length === 5 ? 'pass' : 'fail',
    source: { file: file, line: reservedLoc.present ? reservedLoc.line : null, column: null },
    details: { count: RESERVED.length }
  });
  /* check_data.js:127 现状对 week 1 整周豁免"三字位"要求
     （`META.week === 1 || RESERVED.every(w => w.length === 3)`）——豁免粒度是整周，不是
     单个词，所以该周全部 5 个词的这一项一并标 not-applicable，而不是只标真正超长的那个。 */
  const week1Exempt = week === 1;
  RESERVED.forEach(word => {
    if (week1Exempt) {
      pushFinding(findings, {
        findingId: weekTag + 'segment-count:' + word,
        ruleId: 'DATA-RESERVED-02',
        week: week,
        status: 'not-applicable',
        source: { file: file, line: reservedLoc.present ? reservedLoc.line : null, column: null },
        details: { word: word, reason: 'check_data.js:127 对 week===1 整体豁免"三字位"要求，规则本身当前不适用于本周' }
      });
      return;
    }
    try {
      const ids = segmentWord(word, adaptedSounds);
      pushFinding(findings, {
        findingId: weekTag + 'segment-count:' + word,
        ruleId: 'DATA-RESERVED-02',
        week: week,
        status: ids.length === 3 ? 'pass' : 'fail',
        source: { file: file, line: reservedLoc.present ? reservedLoc.line : null, column: null },
        details: { word: word, graphemeCount: ids.length, graphemeIds: ids }
      });
    } catch (e) {
      pushFinding(findings, {
        findingId: weekTag + 'segment-count:' + word,
        ruleId: 'DATA-RESERVED-02',
        week: week,
        status: 'fail',
        source: { file: file, line: reservedLoc.present ? reservedLoc.line : null, column: null },
        details: { word: word, error: e.code || 'unknown-error', message: e.message, offset: e.offset, candidates: e.candidates }
      });
    }
  });

  /* ---- DATA-RESERVED-01：每个 RESERVED 必须在 W 里有释义 + 一个都不许泄漏进别处 ---- */
  RESERVED.forEach(word => {
    const hasDefinition = !!W[word];
    pushFinding(findings, {
      findingId: weekTag + 'definition:' + word,
      ruleId: 'DATA-RESERVED-01',
      week: week,
      status: hasDefinition ? 'pass' : 'fail',
      source: { file: file, line: wLoc.present ? wLoc.line : null, column: null },
      details: {
        word: word, hasDefinition: hasDefinition,
        currentlyExempted: week >= 4,
        note: week >= 4 ? 'check_data.js:79 现状对 week>=4 豁免"RESERVED 必须在 W 里"，该豁免正是规则 #1 状态列标注"待删除"的对象；本发现如实报告事实，不代表当前校验器会拦下' : null
      }
    });
  });
  RESERVED.forEach(word => {
    const hits = consumption.filter(r => r.word.toLowerCase() === word.toLowerCase());
    pushFinding(findings, {
      findingId: weekTag + 'leak:' + word,
      ruleId: 'DATA-RESERVED-01',
      week: week,
      status: hits.length === 0 ? 'pass' : 'fail',
      source: { file: file, line: reservedLoc.present ? reservedLoc.line : null, column: null },
      details: {
        word: word, leakCount: hits.length,
        locations: hits.map(h => ({ kind: h.kind, day: h.day, page: h.page, round: h.round }))
      }
    });
  });

  /* ---- DATA-WALL-01：newPatterns 现状 + 墙是否已覆盖 SOUNDS 全集（§2.4 的"统一后"判据）
     真相源（按 project.json 周序累计 newPatterns）本次尚不可算——newPatterns 字段
     现状全部缺失，第 7 步随数据迁移一并引入，这里如实标 unknown，不是 fail：
     "无法判定"和"判定为错"是两回事。 ---- */
  const hasNewPatterns = Array.isArray(META.newPatterns);
  /* status 恒为 'unknown'，与 present 是 true 是 false 无关：真相源（按 project.json
     周序累计 newPatterns，方案 §2.4）要等第 7 步全部四周迁入 newPatterns 后才能算，
     本步哪怕字段已经存在也没有可比较的独立顺序基准——所以这里只报告现状，不作判定。 */
  pushFinding(findings, {
    findingId: weekTag + 'newPatterns-presence',
    ruleId: 'DATA-WALL-01',
    week: week,
    status: 'unknown',
    source: { file: file, line: metaLoc.present ? metaLoc.line : null, column: null },
    details: {
      present: hasNewPatterns, value: hasNewPatterns ? META.newPatterns : null,
      reason: '真相源（按 project.json 周序累计 newPatterns，方案 §2.4）第 7 步才引入；本步只报告字段现状，不判定墙顺序对错'
    }
  });
  {
    const wallLetters = META.wallLetters;
    const wallSet = new Set(typeof wallLetters === 'string' ? wallLetters.split('') : (Array.isArray(wallLetters) ? wallLetters : []));
    const soundsSet = new Set(Object.keys(SOUNDS));
    const missingFromWall = [...soundsSet].filter(id => !wallSet.has(id));
    const extraInWall = [...wallSet].filter(id => !soundsSet.has(id));
    pushFinding(findings, {
      findingId: weekTag + 'wall-covers-all-sounds',
      ruleId: 'DATA-WALL-01',
      week: week,
      status: (missingFromWall.length === 0 && extraInWall.length === 0) ? 'pass' : 'fail',
      source: { file: file, line: metaLoc.present ? metaLoc.line : null, column: null },
      details: {
        wallCount: wallSet.size, soundsCount: soundsSet.size,
        missingFromWall: missingFromWall, extraInWall: extraInWall,
        note: '规范 v2.0 §3「唯一模型」要求 wallLetters 统一后等于 SOUNDS 全部键；统一动作本身是第 7 步的工作，这里只报告现状是否已经满足'
      }
    });
  }

  /* ---- DATA-PATTERN-02：四字段仍是旧字符串格式（未迁移为 ID 数组） ---- */
  LEGACY_ARRAY_FIELDS.forEach(field => {
    const value = META[field];
    const status = typeof value === 'string' ? 'fail' : (Array.isArray(value) ? 'pass' : 'unknown');
    pushFinding(findings, {
      findingId: weekTag + 'legacy-format:' + field,
      ruleId: 'DATA-PATTERN-02',
      week: week,
      status: status,
      source: { file: file, line: metaLoc.present ? metaLoc.line : null, column: null },
      details: { field: field, currentType: typeof value, value: value }
    });
  });

  /* ---- DATA-SOUNDS-01：SOUNDS 条目是否仍只有 L、没有 grapheme ---- */
  {
    const ids = Object.keys(SOUNDS);
    const lOnly = ids.filter(id => {
      const entry = SOUNDS[id];
      const hasG = entry && typeof entry.grapheme === 'string' && entry.grapheme.length > 0;
      const hasL = entry && typeof entry.L === 'string' && entry.L.length > 0;
      return hasL && !hasG;
    });
    pushFinding(findings, {
      findingId: weekTag + 'l-field-present',
      ruleId: 'DATA-SOUNDS-01',
      week: week,
      status: lOnly.length === 0 ? 'pass' : 'fail',
      source: { file: file, line: soundsLoc.present ? soundsLoc.line : null, column: null },
      details: {
        totalEntries: ids.length, entriesWithLOnly: lOnly.length, sampleIds: lOnly.slice(0, 8),
        note: '本发现标记"grapheme 缺失、仍需靠临时适配层从 L 派生才能分词"的条目数，不等价于'
          + '"L 字段是否已被彻底删除"——后者是第 4a 步双保险门槛（方案 §3.1）的判定范围，不在本审计内'
      }
    });
  }

  return findings;
}

/* buildAudit(weekSources) -> 完整审计文档。weekSources: Array<{file, raw}>（raw 是
 * weekNN.data.js 的原始文本），按方案要求"计算函数是纯函数"（方案 §2.4 取数规则），
 * 不在这里自己去扫工作树——调用方（CLI 或测试）负责传入要审计的源。 */
function buildAudit(weekSources, opts) {
  opts = opts || {};
  const findings = [];
  weekSources.forEach(({ file, raw }) => {
    const box = loadData(raw, false);
    findings.push(...auditWeek(box, raw, file));
  });

  /* §3.8 全局发现（不挂在具体某一周）：load_data.js 的 HTML 兜底仍接受旧字符串格式，
     按方案处置延后到第 8 步，这里只如实记录现状。 */
  const loadDataPath = path.join('tools', 'validation', 'load_data.js');
  const loadDataRaw = fs.readFileSync(path.join(REPO, loadDataPath), 'utf8');
  const fallbackMatch = /if\s*\(\s*!box\.META\s*&&\s*html\s*\)/.exec(loadDataRaw);
  pushFinding(findings, {
    findingId: 'legacy-html-fallback',
    ruleId: 'DATA-PATTERN-02',
    week: null,
    status: 'fail',
    source: { file: loadDataPath.replace(/\\/g, '/'), line: fallbackMatch ? lineOf(loadDataRaw, fallbackMatch.index) : null, column: null },
    details: {
      note: 'load_data.js 在 HTML 缺内联 META 时会自行拼合字符串 rack/wall（旧格式后门）。' +
        '按方案 §3.8：第 4b 步给旧入口显式 schemaVersion/适配器，第 8 步拒绝缺内联 META 的旧 HTML。' +
        '四周现有产物都内联了 META，此兜底当前是死路径，但不能靠"碰巧不触发"，故仍记为待处置项。'
    }
  });

  sortFindings(findings);
  checkFindingIdUniqueness(findings); // 内部自检，发现重复直接抛错，不把坏文档吐出去

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: opts.generatedAt || new Date().toISOString(),
    findings: findings
  };
}

/* sortFindings：稳定排序键 ruleId → source.file → source.line（null 排最后）→ findingId
 * （方案 §5「迁移前审计」行）。原地排序并返回同一数组，方便链式调用。 */
function sortFindings(findings) {
  findings.sort((a, b) => {
    if (a.ruleId !== b.ruleId) return a.ruleId < b.ruleId ? -1 : 1;
    if (a.source.file !== b.source.file) return a.source.file < b.source.file ? -1 : 1;
    const la = a.source.line, lb = b.source.line;
    if (la !== lb) {
      if (la === null) return 1;   // null 排最后
      if (lb === null) return -1;
      return la - lb;
    }
    if (a.findingId !== b.findingId) return a.findingId < b.findingId ? -1 : 1;
    return 0;
  });
  return findings;
}

/* checkFindingIdUniqueness：findingId 只需在同一 ruleId 内唯一（方案 §5：
 * "ruleId 已参与排序，只要 findingId 在同一规则内唯一，排序键即构成全序"）。
 * 发现违规直接抛错（用于 buildAudit 内部自检）；测试要拿"违规列表"而不是异常时用
 * findDuplicateFindingIds。 */
function findDuplicateFindingIds(findings) {
  const seen = new Map(); // ruleId -> Set<findingId>
  const dups = [];
  for (const f of findings) {
    if (!seen.has(f.ruleId)) seen.set(f.ruleId, new Set());
    const set = seen.get(f.ruleId);
    if (set.has(f.findingId)) dups.push({ ruleId: f.ruleId, findingId: f.findingId });
    else set.add(f.findingId);
  }
  return dups;
}
function checkFindingIdUniqueness(findings) {
  const dups = findDuplicateFindingIds(findings);
  if (dups.length) {
    throw new Error('findingId 在同一 ruleId 内重复：' + dups.map(d => d.ruleId + '/' + d.findingId).join(', '));
  }
}

/* validateAuditDocument(doc) -> Array<string>：结构校验，返回问题列表（空数组=合法）。
 * 供测试跑 schema 正反 fixture：合法文档应得到 []，故意写错的应得到非空列表。 */
function validateAuditDocument(doc) {
  const problems = [];
  if (!doc || typeof doc !== 'object') return ['文档必须是对象'];
  if (typeof doc.schemaVersion !== 'string' || !doc.schemaVersion) problems.push('顶层 schemaVersion 必须是非空字符串');
  if (typeof doc.generatedAt !== 'string' || !doc.generatedAt) problems.push('顶层 generatedAt 必须是字符串');
  if (!Array.isArray(doc.findings)) { problems.push('findings 必须是数组'); return problems; }
  doc.findings.forEach((f, i) => {
    const p = 'findings[' + i + ']';
    if (typeof f.findingId !== 'string' || !f.findingId) problems.push(p + '.findingId 必须是非空字符串');
    if (typeof f.ruleId !== 'string' || !f.ruleId) problems.push(p + '.ruleId 必须是非空字符串');
    if (!(f.week === null || typeof f.week === 'number')) problems.push(p + '.week 必须是 number 或 null');
    if (!STATUS_VALUES.has(f.status)) problems.push(p + '.status 必须是 pass/fail/not-applicable/unknown 之一');
    if (!f.source || typeof f.source !== 'object') problems.push(p + '.source 必须是对象');
    else {
      if (typeof f.source.file !== 'string' || !f.source.file) problems.push(p + '.source.file 必填且必须是非空字符串');
      if (!(f.source.line === null || typeof f.source.line === 'number')) problems.push(p + '.source.line 必须是 number 或 null');
      if (!(f.source.column === null || typeof f.source.column === 'number')) problems.push(p + '.source.column 必须是 number 或 null');
    }
    if (!f.details || typeof f.details !== 'object' || Array.isArray(f.details)) problems.push(p + '.details 必须是规则级对象结构，不是自由文本/数组');
  });
  const dups = findDuplicateFindingIds(doc.findings);
  if (dups.length) problems.push('findingId 在同一 ruleId 内重复：' + dups.map(d => d.ruleId + '/' + d.findingId).join(', '));
  const expectedOrder = sortFindings(doc.findings.slice());
  const actualIds = doc.findings.map(f => f.ruleId + '|' + f.source.file + '|' + f.source.line + '|' + f.findingId);
  const expectedIds = expectedOrder.map(f => f.ruleId + '|' + f.source.file + '|' + f.source.line + '|' + f.findingId);
  if (actualIds.join('\n') !== expectedIds.join('\n')) problems.push('findings 未按稳定排序键（ruleId → source.file → source.line[null 最后] → findingId）排序');
  return problems;
}

function defaultWeekSources() {
  return [1, 2, 3, 4].map(n => {
    const file = 'frontend/src/weeks/week0' + n + '.data.js';
    const raw = fs.readFileSync(path.join(REPO, file), 'utf8');
    return { file: file, raw: raw };
  });
}

function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
  const doc = buildAudit(defaultWeekSources());
  const json = JSON.stringify(doc, null, 2);
  if (outPath) {
    fs.writeFileSync(outPath, json + '\n', 'utf8');
    console.error('迁移前审计已写入：' + outPath);
  } else {
    console.log(json);
  }
}

module.exports = {
  SCHEMA_VERSION,
  WEEKLY_FORBIDDEN_CONSTANTS, WEEKLY_FORBIDDEN_BLOCKS, LEGACY_ARRAY_FIELDS,
  auditWeek, buildAudit, defaultWeekSources,
  sortFindings, findDuplicateFindingIds, checkFindingIdUniqueness, validateAuditDocument
};

if (require.main === module) main();
