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

/* 「L 字段消费点」（方案 §5「迁移前审计」行 + §3.1 影响面表）：这是代码侧的事实，与具体
 * 某一周的数据无关，所以清单直接照抄方案 §3.1 已经做过四模式扫描确认过的四个生产消费点，
 * 不在这里重新写一套扫描逻辑去"重新发现"——重新扫描属于第 4a 步双保险门槛（AST/六写法
 * 源码扫描）的职责，本审计只负责核对这份已知清单当前是否还在、精确定位到哪一行。
 *
 * ⚠️ 语义变化（里程碑 2 收口批 H2，2026-09-09）：第 4a 步已把这四个消费点从
 * `SOUNDS[id].L` 改写成 `SOUNDS[id].grapheme`（render-blocks.js/games.js/
 * check_data.js 均已实测核对过），若仍用旧 `.L` 正则去找，这四条永远匹配不上，
 * status 会一直卡在 unknown（"清单可能过期，需要人工核实"）——但这四条明明是
 * **可判定**的（跟 newPatterns 那 4 条"真的缺独立教学顺序真相源判不了"不是一回事），
 * 留成 unknown 是错的。这里把每条 spec 的 pattern 改指向 grapheme 等价写法，
 * 让审计恢复"这个消费点是否按预期读取字形字段"的判定能力。
 * **随之而来的语义变化**：这份清单原本的意思是"找出还在消费旧 L 字段的地方"
 * （找到=fail=还没迁移完）；现在 pattern 已经指向 grapheme，找到的意思变成
 * "找出消费字形字段（grapheme）的地方"——找到=pass=消费点确实按预期读取 grapheme
 * （迁移已完成且没有回退），找不到=fail=这个已知消费点的代码形状变了（可能是
 * 迁移回退回 L、也可能是消费点代码本身被改写/删除），需要人工核实，不再是"清单过期"
 * 这一种更宽松的 unknown 解释。下面 pushFinding 那段的 status 判据与 note 文案
 * 已同步改写，别让后人以为它还在找 `L`。 */
const L_FIELD_CONSUMER_SPECS = [
  { id: 'render-blocks-tileHTML', file: 'frontend/src/shared/render-blocks.js', pattern: /SOUNDS\[f\]\.grapheme\s*,/, label: 'tileHTML(SOUNDS[f].grapheme, …) 传字形' },
  { id: 'render-blocks-forms-join', file: 'frontend/src/shared/render-blocks.js', pattern: /forms\.map\(f\s*=>\s*SOUNDS\[f\]\.grapheme\)\.join/, label: 'forms.map(f=>SOUNDS[f].grapheme).join(\' 和 \')' },
  { id: 'games-flash-display', file: 'frontend/src/shared/games.js', pattern: /\$\{s\.grapheme\}/, label: 'flash 卡面显示 s.grapheme' },
  { id: 'check-data-schema-gate', file: 'tools/validation/check_data.js', pattern: /s\.grapheme\s*&&\s*s\.ipa/, label: 'SOUNDS 条目字段齐全门槛（缺 grapheme 就报错）' }
];

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
  /* 适配层遇到 grapheme/L 冲突（同一条目两个字段都在但值不同）或非法 grapheme（键存在
     但值不是非空字符串）都会显式抛错，不静默选一个可能错的值——见
     sounds_grapheme_adapter.js 的两种错误码 grapheme-l-conflict / grapheme-field-invalid。
     这里接住，转成一条 fail finding，不让整个审计工具因为一条数据的问题而崩溃；
     分词相关的其余发现继续用未适配的 SOUNDS 兜底跑（大概率因缺 grapheme 而报
     segment-unknown，如实反映"适配失败"的后果，不是掩盖）。
     ⚠️（M6）显式传 { allowLegacyFallback: true }：本审计工具审的就是"迁移前状态"，
     必须能吃只有 L 没有 grapheme 的合成/历史数据（tests/unit/test_migration_audit.js
     的 L_ONLY 三态兼容用例即依赖这一点）；适配层默认已改为不再静默派生，这里是唯一
     需要保留旧兜底行为的调用方，其余调用方（gen_segments.js 等）用默认行为即可。 */
  let adaptedSounds, graphemeAdapterError = null;
  try {
    adaptedSounds = withGraphemeFallback(SOUNDS, { allowLegacyFallback: true });
  } catch (e) {
    graphemeAdapterError = e;
    adaptedSounds = SOUNDS;
  }
  /* word_consumers.js 遇到 BLOCK_TYPE_CATALOG 之外的未知块类型同样显式抛错
     （DATA-BLOCK-01：未知块类型直接失败），这里同一套接住-转finding的模式：不让
     一个未登记的块类型让整个审计崩溃，但要把它变成一条看得见的 fail，而不是像
     旧版 switch 的 default:break 那样静默吞掉。consumption 兜底为空数组时，
     下面的 RESERVED 泄漏检测会全部"看似"pass——这不是掩盖，是如实的级联后果，
     该 fail finding 本身已经说明了原因，第 5/7 步据此知道要先修好未知块类型问题
     再信任泄漏检测的结果。 */
  let consumption = [], blockCatalogError = null;
  try {
    consumption = collectWordConsumption(box);
  } catch (e) {
    blockCatalogError = e;
  }

  const reservedLoc = locateDeclaration(raw, 'RESERVED');
  const soundsLoc = locateDeclaration(raw, 'SOUNDS');
  const wLoc = locateDeclaration(raw, 'W');
  const metaLoc = locateDeclaration(raw, 'META');

  if (graphemeAdapterError) {
    pushFinding(findings, {
      findingId: weekTag + 'grapheme-adapter-error:' + (graphemeAdapterError.code || 'unknown'),
      ruleId: 'DATA-SOUNDS-01',
      week: week,
      status: 'fail',
      source: { file: file, line: soundsLoc.present ? soundsLoc.line : null, column: null },
      details: { code: graphemeAdapterError.code || 'unknown', message: graphemeAdapterError.message }
    });
  }
  if (blockCatalogError) {
    pushFinding(findings, {
      findingId: weekTag + 'unknown-block-type',
      ruleId: 'DATA-BLOCK-01',
      week: week,
      status: 'fail',
      source: { file: file, line: null, column: null },
      details: {
        code: blockCatalogError.code || 'unknown', blockType: blockCatalogError.blockType || null,
        message: blockCatalogError.message,
        note: 'word_consumers.js 的 BLOCK_TYPE_CATALOG 未登记此块类型，词消费抽取在本周整体降级为空集合，下面 DATA-RESERVED-01 的泄漏检测结果不可信，需先在 catalog 里登记该块类型再复核'
      }
    });
  }

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
  /* ⚠️ 判据方向（coordinator C-1 修复）：这条必须按「规范 §4.3 weekly 列的目标契约」判，
     不能按「check_data.js:127 现状怎么校验」判——那条豁免正是第 5 步启用 weekly 契约后
     会消失的东西（W1-W3 在第 5 步会声明 assessmentMode:'weekly'，规范 §5「测评路由」行
     写死 RESERVED 的"每词三个字位"共用校验对 weekly 周照常执行，不因当前豁免而放行）。
     `DATA-ASSESS-01` 对 W4（永远不会是 weekly）套用 weekly 禁止项清单是"现状 vs 目标契约"
     的统一记录方式，这里的 W1 也必须用同一套逻辑：按真实分词结果判 pass/fail，
     只在 details.currentlyExempted 里如实标注"当前校验器还豁免着"，不能让豁免升格成
     "这条规则不适用"（not-applicable 会被第 5 步的停机条款读成"审计证明不需要改"，
     从而漏修 spit 这个真正的四字位词）。 */
  RESERVED.forEach(word => {
    const currentlyExempted = week === 1;
    const exemptedNote = currentlyExempted
      ? 'check_data.js:127 现状对 week===1 整体豁免"三字位"要求（`META.week === 1 || RESERVED.every(...)`）；'
        + '该豁免会在第 5 步启用 weekly 契约后消失（规范 §4.3 weekly 列对 RESERVED 的共用校验照常执行），'
        + '本发现按目标契约判定，不代表当前校验器会拦下'
      : null;
    try {
      const ids = segmentWord(word, adaptedSounds);
      pushFinding(findings, {
        findingId: weekTag + 'segment-count:' + word,
        ruleId: 'DATA-RESERVED-02',
        week: week,
        status: ids.length === 3 ? 'pass' : 'fail',
        source: { file: file, line: reservedLoc.present ? reservedLoc.line : null, column: null },
        details: { word: word, graphemeCount: ids.length, graphemeIds: ids, currentlyExempted: currentlyExempted, note: exemptedNote }
      });
    } catch (e) {
      pushFinding(findings, {
        findingId: weekTag + 'segment-count:' + word,
        ruleId: 'DATA-RESERVED-02',
        week: week,
        status: 'fail',
        source: { file: file, line: reservedLoc.present ? reservedLoc.line : null, column: null },
        details: {
          word: word, error: e.code || 'unknown-error', message: e.message, offset: e.offset, candidates: e.candidates,
          currentlyExempted: currentlyExempted, note: exemptedNote
        }
      });
    }
  });

  /* ---- DATA-RESERVED-01：每个 RESERVED 必须在 W 里有释义 + 一个都不许泄漏进别处 ----
     ⚠️（codex high 修复）`!!W[word]` 是直接属性读取，会走原型链——`W['toString']`
     返回 Object.prototype.toString（truthy），会被误判成"有释义"。改用只在
     Object.keys(W) 返回的自有键里查找（Object.keys 天然不含原型链属性，等价于逐个
     hasOwnProperty），且额外校验释义值本身符合 W 条目 schema（至少是对象、有非空
     zh 字段——规范 v2.0 §3「12 个常量表」：`W` 的形状是 `{词:{zh, art, lemma?,
     proper?, segments?}}`），不是随便一个 truthy 值就算数。

     ⚠️ 统一大小写口径（codex 指出原实现一边敏感一边不敏感）：下面的 definition 查找
     与 leak 检测（本函数另一半）现在都按小写归一化比较——W 的键与 RESERVED 词在
     四周现有数据里本来就全是小写，归一化不改变现状结果，但让两条检查的口径与
     assessment_contract.js 的 normalize()/tokens()（同样先 toLowerCase 再比较）一致，
     不再存在"同一个词大小写不同就被两条规则读出两种答案"的缝隙。 */
  const wKeysByLower = new Map(); // 小写归一化词 -> W 里的原始键（原始键必然是 Object.keys(W) 的自有键）
  Object.keys(W).forEach(k => wKeysByLower.set(k.toLowerCase(), k));
  const isValidWEntry = entry => !!entry && typeof entry === 'object' && !Array.isArray(entry)
    && typeof entry.zh === 'string' && entry.zh.length > 0;

  RESERVED.forEach(word => {
    const originalKey = wKeysByLower.get(word.toLowerCase());
    const hasOwnKey = originalKey !== undefined && Object.prototype.hasOwnProperty.call(W, originalKey);
    const entry = hasOwnKey ? W[originalKey] : undefined;
    const hasDefinition = hasOwnKey && isValidWEntry(entry);
    pushFinding(findings, {
      findingId: weekTag + 'definition:' + word,
      ruleId: 'DATA-RESERVED-01',
      week: week,
      status: hasDefinition ? 'pass' : 'fail',
      source: { file: file, line: wLoc.present ? wLoc.line : null, column: null },
      details: {
        word: word, hasDefinition: hasDefinition,
        hasOwnKey: hasOwnKey, schemaValid: hasOwnKey ? isValidWEntry(entry) : null,
        currentlyExempted: week >= 4,
        note: week >= 4 ? 'check_data.js:79 现状对 week>=4 豁免"RESERVED 必须在 W 里"，该豁免正是规则 #1 状态列标注"待删除"的对象；本发现如实报告事实，不代表当前校验器会拦下' : null
      }
    });
  });
  RESERVED.forEach(word => {
    const normalizedWord = word.toLowerCase();
    const hits = consumption.filter(r => r.word.toLowerCase() === normalizedWord);
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
    // 有序、保留重复项——第 7 步要拿它当"累计 newPatterns"真相源落地前的现状参照
    // （方案 §2.4），只给一个 Set 看不出顺序也看不出重复，details 必须留下原始有序值。
    const wallOrdered = typeof wallLetters === 'string' ? wallLetters.split('') : (Array.isArray(wallLetters) ? wallLetters.slice() : []);
    const wallSet = new Set(wallOrdered);
    const soundsSet = new Set(Object.keys(SOUNDS));
    const missingFromWall = [...soundsSet].filter(id => !wallSet.has(id));
    const extraInWall = [...wallSet].filter(id => !soundsSet.has(id));
    const seenOnce = new Set();
    const duplicateIds = [];
    wallOrdered.forEach(id => {
      if (seenOnce.has(id)) { if (!duplicateIds.includes(id)) duplicateIds.push(id); }
      else seenOnce.add(id);
    });
    /* ⚠️（codex high 修复）duplicateIds 之前只写进 details 不参与判定——"集合完整但含
       重复项"的墙会被误判成 pass。在独立的教学顺序真相源（累计 newPatterns，第 7 步
       才可算）落地之前，缺项、额外项、重复项三者各自独立判失败：任何一类不为空，
       这条发现就是 fail，details 里各自列出是哪一类、具体是哪些 ID，方便第 7 步
       定位到底要修哪一类问题。顺序本身仍不比较（无真相源可比）。 */
    const hasMissing = missingFromWall.length > 0;
    const hasExtra = extraInWall.length > 0;
    const hasDuplicates = duplicateIds.length > 0;
    pushFinding(findings, {
      findingId: weekTag + 'wall-covers-all-sounds',
      ruleId: 'DATA-WALL-01',
      week: week,
      status: (hasMissing || hasExtra || hasDuplicates) ? 'fail' : 'pass',
      source: { file: file, line: metaLoc.present ? metaLoc.line : null, column: null },
      details: {
        wallLettersOrdered: wallOrdered, duplicateIds: duplicateIds,
        wallCount: wallSet.size, soundsCount: soundsSet.size,
        missingFromWall: missingFromWall, extraInWall: extraInWall,
        hasMissing: hasMissing, hasExtra: hasExtra, hasDuplicates: hasDuplicates,
        note: '规范 v2.0 §3「唯一模型」要求 wallLetters 统一后等于 SOUNDS 全部键、无重复；统一动作本身是第 7 步的工作，这里只报告现状是否已经满足。'
          + '缺项(missingFromWall)/额外项(extraInWall)/重复项(duplicateIds) 三者任一非空即判 fail，各自独立报告，不合并成一个模糊的"不一致"。'
          + 'wallLettersOrdered 保留原始顺序，供第 7 步核对累计 newPatterns 真相源迁入前后是否一致（顺序本身第 7 步前不比较）'
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
 * weekNN.data.js 的原始文本）由调用方（CLI 或测试）传入——**周记录**这一部分符合方案
 * §2.4"计算函数是纯函数，输入为按周排序的规范化周记录数组，不直接读工作树"的要求，
 * auditWeek() 本身不碰文件系统。
 *
 * 但本函数另外产出少量"全局/工具自身事实"发现（load_data.js 的旧格式兜底是否还在、
 * L 字段消费点清单是否还在），这些检查的对象根本不是"某一周的数据记录"，而是仓库里
 * 固定路径的工具/生产代码本身——它们不是 §2.4 讨论的"周记录"，所以这里直接
 * fs.readFileSync 读那几个固定文件，不算破坏"周记录取数是纯函数"这条约束，也不需要
 * 由调用方把工具代码也包装成 weekSources 传进来。 */
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

  /* 「L 字段消费点」全局发现：逐个核对 L_FIELD_CONSUMER_SPECS 这份已知清单（照抄方案
     §3.1，不重新扫描）当前是否还在，精确定位到行——供第 4a 步直接拿着清单去改，
     不用重新翻一遍四模式扫描。 */
  L_FIELD_CONSUMER_SPECS.forEach(spec => {
    const specRaw = fs.readFileSync(path.join(REPO, spec.file), 'utf8');
    const m = spec.pattern.exec(specRaw);
    // H2：pattern 现在指向 grapheme 等价写法（见上方常量注释的语义变化说明）——
    // 找到 = pass（消费点确实按预期读取 grapheme，4a 迁移已生效且未回退）；
    // 找不到 = fail（这个已知消费点的代码形状变了：可能回退回 L，也可能被改写/
    // 删除，需要人工核实，不再是"清单过期"那种更宽松的 unknown）。
    pushFinding(findings, {
      findingId: 'l-field-consumer:' + spec.id,
      ruleId: 'DATA-SOUNDS-01',
      week: null,
      status: m ? 'pass' : 'fail',
      source: { file: spec.file, line: m ? lineOf(specRaw, m.index) : null, column: null },
      details: {
        label: spec.label, consumesGrapheme: !!m,
        note: m
          ? '按预期读取 SOUNDS[id].grapheme 取显示字形（第 4a 步 L→grapheme 迁移已生效）'
          : '按已知的 grapheme 消费写法没能定位到——这个已知消费点的代码形状发生了变化（可能回退回 L，也可能被改写/删除），需要人工核实'
      }
    });
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

/* RULE_ID_PATTERN：ruleId 必须落在规范的 DATA-* 命名空间里（形如 DATA-ASSESS-01、
 * DATA-RESERVED-02），不是随便一个字符串——否则 'not-a-real-rule' 这类拼写错误也能
 * 通过 schema 校验（codex low）。 */
const RULE_ID_PATTERN = /^DATA-[A-Z0-9]+(-[A-Z0-9]+)*$/;

/* isNonNegativeInteger：source.line / source.column / week 现状要么是"确定的非负整数
 * 位置/周次"要么是 null（可空且已写明何时为空），不该接受 NaN、Infinity、负数、
 * 小数——`typeof v === 'number'` 对这些全部放行，必须换成 Number.isInteger + 非负
 * （codex low）。 */
function isNonNegativeInteger(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
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
    if (typeof f.ruleId !== 'string' || !RULE_ID_PATTERN.test(f.ruleId)) problems.push(p + '.ruleId 必须是非空字符串且匹配 DATA-* 命名空间格式（如 DATA-ASSESS-01）');
    if (!(f.week === null || isNonNegativeInteger(f.week))) problems.push(p + '.week 必须是非负整数或 null');
    if (!STATUS_VALUES.has(f.status)) problems.push(p + '.status 必须是 pass/fail/not-applicable/unknown 之一');
    if (!f.source || typeof f.source !== 'object') problems.push(p + '.source 必须是对象');
    else {
      if (typeof f.source.file !== 'string' || !f.source.file) problems.push(p + '.source.file 必填且必须是非空字符串');
      if (!(f.source.line === null || isNonNegativeInteger(f.source.line))) problems.push(p + '.source.line 必须是非负整数或 null');
      if (!(f.source.column === null || isNonNegativeInteger(f.source.column))) problems.push(p + '.source.column 必须是非负整数或 null');
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
