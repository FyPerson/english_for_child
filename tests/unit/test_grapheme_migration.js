/* 里程碑 2 第 4a 步「L → grapheme 收敛」双保险门槛（方案 §3.1 + §4 第 4a 行）。
 *
 * 两道门槛缺一不可（方案 §3.1「验收门槛是数据与代码双保险」）：
 *   ① 运行时 schema 断言：加载全部现役周与 fixture 后，递归断言每个 SOUNDS 条目
 *      没有自有键 L（不走原型链）、有合法 grapheme（非空字符串——这是
 *      frontend/src/shared/graphemes.js 里 isValidSoundEntryGrapheme/validateSoundsTable
 *      已经在用的定义；方案 §5「ID 字符集」只约束 SOUNDS 的键即字位 ID 本身要满足
 *      ^[a-z][a-z0-9_]*$，未对 grapheme 字形文本另立字符集限制——grapheme 走的是
 *      HTML 转义而不是字符集白名单，见 §5「ID 字符集与属性编码」行原文）。
 *   ② 源码扫描：覆盖六种写法 .L / ['L'] / ["L"] / L: / 'L': / "L": ，归档目录走
 *      显式排除清单，不靠路径模糊匹配。
 *
 * 两道门槛都只是发现手段的下限，不是互相替代——运行时断言抓不到"代码里还有一处
 * 从来没被现有数据触发过的 .L 读取"，源码扫描抓不到"数据文件本身还带着自有键 L
 * （即使代码已经不读它）"。方案原文：「四模式扫描是发现手段，不能单独当完成证明」。
 *
 * 本文件同时证明两道门槛真的有分辨力（"改坏副本"办法，任务要求）：见文末
 * ③④ 两组用内存构造的坏 fixture / 坏源码文本触发失败断言，不落盘、不改动仓库文件。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');

// ============================================================================
// ① 运行时 schema 断言：全部现役周 + 两个 fixture。
// ============================================================================
const { loadData } = require('../../tools/validation/load_data');

const SOUNDS_SOURCES = [
  'frontend/src/weeks/week01.data.js',
  'frontend/src/weeks/week02.data.js',
  'frontend/src/weeks/week03.data.js',
  'frontend/src/weeks/week04.data.js',
  'tests/fixtures/week02-data.js',
  'tests/fixtures/week03-data.js'
];

/* assertNoOwnLHasGrapheme(sounds, label)：核心断言函数，独立于「用真实文件加载」，
 * 这样③处的坏 fixture 复用同一份判定逻辑，不是另写一套弱化版检查。 */
function assertNoOwnLHasGrapheme(sounds, label) {
  assert(sounds && typeof sounds === 'object', `${label}: SOUNDS 必须是对象`);
  const ids = Object.keys(sounds);
  assert(ids.length > 0, `${label}: SOUNDS 不应为空`);
  for (const id of ids) {
    const entry = sounds[id];
    assert(entry && typeof entry === 'object', `${label}: SOUNDS.${id} 必须是对象`);
    // 不走原型链——只查自有键，Object.prototype.hasOwnProperty 是唯一正确判法
    // （呼应 sounds_grapheme_adapter.js 里 codex high 修的同一个坑：键存在 vs 值合法要分开判）。
    const hasOwnL = Object.prototype.hasOwnProperty.call(entry, 'L');
    assert.equal(hasOwnL, false, `${label}: SOUNDS.${id} 不应再有自有键 L（4a 步已收敛为 grapheme）`);
    const hasOwnGrapheme = Object.prototype.hasOwnProperty.call(entry, 'grapheme');
    assert.equal(hasOwnGrapheme, true, `${label}: SOUNDS.${id} 缺 grapheme 字段`);
    assert.equal(typeof entry.grapheme, 'string', `${label}: SOUNDS.${id}.grapheme 必须是字符串`);
    assert(entry.grapheme.length > 0, `${label}: SOUNDS.${id}.grapheme 不能是空字符串`);
  }
}

{
  let totalEntries = 0;
  for (const rel of SOUNDS_SOURCES) {
    const raw = fs.readFileSync(path.join(REPO, rel), 'utf8');
    const box = loadData(raw, false);
    assertNoOwnLHasGrapheme(box.SOUNDS, rel);
    totalEntries += Object.keys(box.SOUNDS).length;
  }
  assert.equal(SOUNDS_SOURCES.length, 6, '现役周（4）+ fixture（2）应恰好 6 个来源');
  console.log(`PASS grapheme migration（运行时门槛①）：${SOUNDS_SOURCES.length} 个来源、共 ${totalEntries} 条 SOUNDS 条目全部无自有键 L、grapheme 均合法`);
}

// ============================================================================
// ② 源码扫描：六写法 .L / ['L'] / ["L"] / L: / 'L': / "L": ，显式排除清单。
// ============================================================================

/* 六种写法对应的正则。字面量键 `L:` 已包含 `'L':`/`"L":` 的超集匹配风险
 * （比如 `xL: 1` 会被 /\bL:/ 命中吗？不会——\b 是词边界，`xL` 中 L 前是字母不是边界，
 * 不会误报），但为了和任务要求的"六种写法各自独立可核实"对齐，仍分别列出六个模式，
 * 而不是合并成更少的、语义更模糊的正则。 */
const SIX_PATTERNS = [
  { id: 'dot-access', re: /\.L\b/ },
  { id: 'bracket-single', re: /\['L'\]/ },
  { id: 'bracket-double', re: /\["L"\]/ },
  { id: 'key-bare', re: /\bL:/ },
  { id: 'key-single-quoted', re: /'L':/ },
  { id: 'key-double-quoted', re: /"L":/ }
];

/* 显式排除清单（不是路径模糊匹配）：
 *   - tools/validation/sounds_grapheme_adapter.js：第 3 步写的临时只读适配层，
 *     按任务边界本批不删，它的存在理由就是同时容忍 L 与 grapheme，必然含 .L。
 *   - tools/validation/migration_audit.js：第 3 步迁移前审计工具，L_FIELD_CONSUMER_SPECS
 *     里硬编码了旧 .L 正则用来"检测代码是否还在读 L"——这本身是审计逻辑的一部分，
 *     4a 收敛后这些正则会自然找不到匹配（见 tests/unit/test_migration_audit.js 的
 *     expectStale 断言），但正则文本本身仍然写着 .L 字面量，属于工具自身的必要内容，
 *     不是残留。
 *   - tests/unit/test_migration_audit.js：为验证适配层的"只 L / 只 grapheme / 两者
 *     都有"三态兼容与冲突检测，故意构造带 L 字段的合成 SOUNDS 常量（L_ONLY/BOTH 等），
 *     这些是测试数据，不是生产代码里的残留读取。
 * 三者均已在本文件之外单独核实过用途，见收口报告。 */
const EXCLUDED_FILES = new Set([
  'tools/validation/sounds_grapheme_adapter.js',
  'tools/validation/migration_audit.js',
  'tests/unit/test_migration_audit.js',
  // 2026-09-09 主会话抽查后补的两项（扫描范围扩到 .py 之后才可见）：
  //   - tools/legacy/w2data.py：历史归档，把第二周的旧 JS 数据层整段存成 Python
  //     字符串，里面是迁移前的 `L:'c'` 与 `SOUNDS.k = Object.assign(..., { L:'k' })`。
  //     它不参与构建、不被任何运行路径引用，故不改；但**从它复制代码到现役文件时
  //     必须自己把 L 换成 grapheme**，这条排除就是为了让这件事有据可查。
  'tools/legacy/w2data.py',
  //   - tools/theme_palette.py：误报。命中的是 f-string 的格式说明符
  //     `f'... ground L* {L:.1f} ...'`，其中 L 是亮度变量名，与字位字形字段无关。
  'tools/theme_palette.py',
  // 本文件自己：SIX_PATTERNS 的正则源码与本注释块里就写着 .L / 'L': 等字面量，
  // 扫描自身会产生自我指涉的假阳性，必须排除。
  'tests/unit/test_grapheme_migration.js'
]);

// 归档 / 第三方 / 构建产物目录整体排除（与仓库既有约定一致：build/、tmp/ 均 gitignore）。
const EXCLUDED_DIR_PREFIXES = ['node_modules/', 'build/', 'tmp/', '.git/'];

function listTrackedJsFiles() {
  const { execFileSync } = require('node:child_process');
  // 扫描范围含 .py（2026-09-09 主会话抽查补）：只扫 .js 会漏掉把 JS 源码作为字符串
  // 内嵌的 Python 文件——实测 tools/legacy/w2data.py 里就整段存着旧的 `L:'c'` 写法。
  // 那是历史归档、不参与构建，但若有人从中复制粘贴就会把 L 带回来，所以要扫得到、
  // 并在排除清单里显式记录，而不是靠"后缀不匹配所以碰巧没发现"。
  const out = execFileSync('git', ['ls-files', '*.js', '*.py'], { cwd: REPO, encoding: 'utf8' });
  return out.split('\n').filter(Boolean).map(p => p.replace(/\\/g, '/'));
}

/* scanForLResidue(files, patterns, excluded) -> Array<{file, patternId, line}>
 * 独立函数，供③处坏源码复用同一套扫描逻辑（不是另写一份弱化版）。 */
function scanForLResidue(files, patterns, excludedSet) {
  const hits = [];
  for (const rel of files) {
    if (excludedSet.has(rel)) continue;
    if (EXCLUDED_DIR_PREFIXES.some(prefix => rel.startsWith(prefix))) continue;
    const raw = fs.readFileSync(path.join(REPO, rel), 'utf8');
    const lines = raw.split('\n');
    for (const { id, re } of patterns) {
      lines.forEach((lineText, idx) => {
        if (re.test(lineText)) hits.push({ file: rel, patternId: id, line: idx + 1 });
      });
    }
  }
  return hits;
}

{
  const files = listTrackedJsFiles();
  assert(files.length > 50, `git ls-files 应返回相当数量的 .js/.py 文件，实际 ${files.length}——排除逻辑或路径可能有误`);
  const hits = scanForLResidue(files, SIX_PATTERNS, EXCLUDED_FILES);
  assert.equal(hits.length, 0,
    `源码扫描发现 ${hits.length} 处残留 L 引用（应为 0）：\n` +
    hits.map(h => `  ${h.file}:${h.line} (${h.patternId})`).join('\n'));
  console.log(`PASS grapheme migration（源码门槛②）：${files.length} 个受版本控制 .js/.py 文件（排除 ${EXCLUDED_FILES.size} 个显式白名单）六写法扫描全部干净`);
}

// ============================================================================
// ③ 证明门槛①真的会红：造一个带自有键 L 的坏 SOUNDS，内存构造，不落盘。
// ============================================================================
{
  const bad = { r: { L: 'r', grapheme: 'r', type: 'c' } };
  assert.throws(() => assertNoOwnLHasGrapheme(bad, 'synthetic-bad-L'),
    /不应再有自有键 L/, '坏 fixture（自有键 L 仍在）应让运行时门槛①报红');

  const badMissingGrapheme = { r: { type: 'c' } };
  assert.throws(() => assertNoOwnLHasGrapheme(badMissingGrapheme, 'synthetic-missing-grapheme'),
    /缺 grapheme 字段/, '坏 fixture（缺 grapheme）应让运行时门槛①报红');

  const badEmptyGrapheme = { r: { grapheme: '', type: 'c' } };
  assert.throws(() => assertNoOwnLHasGrapheme(badEmptyGrapheme, 'synthetic-empty-grapheme'),
    /不能是空字符串/, '坏 fixture（grapheme 空串）应让运行时门槛①报红');

  console.log('PASS grapheme migration（分辨力验证①，内存构造，不落盘）：带自有键 L / 缺 grapheme / grapheme 空串 三类坏 fixture 均能让运行时门槛报红');
}

// ============================================================================
// ④ 证明门槛②真的会红：造一段带六种写法各一处的坏源码文本，内存扫描，不落盘。
// ============================================================================
{
  const fakeRel = '__synthetic__/fake.js';
  const fakeSource = [
    "const a = SOUNDS[f].L;",           // .L
    "const b = SOUNDS['L'];",           // ['L']
    'const c = SOUNDS["L"];',           // ["L"]
    "const d = { L: 'x' };",            // L:
    "const e = { 'L': 'x' };",          // 'L':
    'const f2 = { "L": "x" };'          // "L":
  ].join('\n');

  // 复用同一套扫描逻辑，但绕开真实文件系统：临时把 fs.readFileSync 换成内存版本，
  // 用完立刻还原，不落盘、不影响后续任何测试。
  const originalReadFileSync = fs.readFileSync;
  fs.readFileSync = function (p, enc) {
    if (String(p).replace(/\\/g, '/').endsWith(fakeRel)) return fakeSource;
    return originalReadFileSync(p, enc);
  };
  let hits;
  try {
    hits = scanForLResidue([fakeRel], SIX_PATTERNS, new Set());
  } finally {
    fs.readFileSync = originalReadFileSync;
  }
  assert.equal(hits.length, 6, `坏源码应命中全部六种写法各一次，实际命中 ${hits.length} 处`);
  const hitIds = hits.map(h => h.patternId).sort();
  assert.deepEqual(hitIds, SIX_PATTERNS.map(p => p.id).sort(), '六种写法应各自被对应的模式命中一次，不重不漏');
  console.log('PASS grapheme migration（分辨力验证②，内存构造，不落盘）：六写法坏源码全部被源码扫描门槛命中');
}
