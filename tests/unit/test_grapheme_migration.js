/* 里程碑 2 第 4a 步「L → grapheme 收敛」双保险门槛（方案 §3.1 + §4 第 4a 行）。
 *
 * 两道门槛缺一不可（方案 §3.1「验收门槛是数据与代码双保险」）：
 *   ① 运行时 schema 断言：加载全部现役周与 fixture 后，逐条断言每个 SOUNDS 条目
 *      （L2 修复：改前写着"递归"，但 SOUNDS 条目本就是扁平结构——外层遍历 ID，
 *      内层直接查条目自身的属性，只有一层，不存在嵌套结构需要递归下探；"递归"这
 *      个词容易被后人误读成"连嵌套子结构都覆盖了"，故改成准确的"逐条"）
 *      没有自有键 L（不走原型链）、有合法 grapheme（非空字符串——这是
 *      frontend/src/shared/graphemes.js 里 isValidSoundEntryGrapheme/validateSoundsTable
 *      已经在用的定义；方案 §5「ID 字符集」只约束 SOUNDS 的键即字位 ID 本身要满足
 *      ^[a-z][a-z0-9_]*$，未对 grapheme 字形文本另立字符集限制——grapheme 走的是
 *      HTML 转义而不是字符集白名单，见 §5「ID 字符集与属性编码」行原文）。
 *   ② 源码扫描：覆盖七种写法 .L / ['L'] / ["L"] / L: / 'L': / "L": / 解构（{L}/{L:x}），
 *      归档目录走显式排除清单，不靠路径模糊匹配（2026-09-09 收口批 M3 补第 7 种写法
 *      "解构"，M1/M2 分别把扫描范围扩到 .html、排除清单细化到 {file,patternId}）。
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

/* H3 修复（预筛 high：「运行时门槛的语料硬编码 6 个文件，且被断言锁死在 6」）：改成 glob
 * 自动发现，不再手列固定路径 + `=== 6`。硬编码清单的问题是：W5 起副机新写
 * `frontend/src/weeks/week05.data.js` 不会自动进这道门槛，而原来那条 `=== 6` 的断言
 * 恰好保证了"忘了加"永远不会红——新文件既不在清单里，清单长度也仍然是 6，测试照样绿。
 * 改用 glob 后新增的周数据 / fixture 会被自动纳入扫描；断言从 `=== 6` 放宽为 `>= 6`
 * （现状 6 个来源是下限，不是上限），并在通过时打印实际发现的文件清单，方便人核对
 * "这次真的扫到了新文件"而不是巧合地还是 6 个。 */
function globSoundsSources() {
  const { execFileSync } = require('node:child_process');
  const patterns = ['frontend/src/weeks/week*.data.js', 'tests/fixtures/week*-data.js'];
  const files = [];
  for (const pattern of patterns) {
    const out = execFileSync('git', ['ls-files', pattern], { cwd: REPO, encoding: 'utf8' });
    out.split('\n').filter(Boolean).forEach(p => files.push(p.replace(/\\/g, '/')));
  }
  files.sort();
  return files;
}
const SOUNDS_SOURCES = globSoundsSources();

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
    // L2 补注（预筛 low）：hasOwnProperty 能抓到用 Object.defineProperty 定义的
    // 不可枚举（enumerable:false）自有键 L——它只看"这个键是不是这个对象自己的"，
    // 不看是否可枚举，`for...in`/`Object.keys` 会漏掉不可枚举键但 hasOwnProperty 不会。
    // 抓不到的是原型链上继承来的 L（比如 SOUNDS.r 的原型对象上有 L，但 r 自己没有）
    // ——这不是漏洞，是有意的：frontend/src/shared/graphemes.js 的 SOUNDS 表本身
    // 只按 Object.keys(sounds) / hasOwnProperty.call(sounds, id) 读自有 ID 键、不走
    // 原型链（resolveSoundEntry/validateSoundsTable 均如此，见该文件注释「只读
    // Object.keys 返回的自有键，不走原型链」），本文件的运行时门槛与它口径一致，
    // 原型链上挂着的属性本就不会被生产代码的这一层看到，不必额外覆盖。
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
  assert(SOUNDS_SOURCES.length >= 6, `glob 发现的来源数应 >= 6（现状下限：4 个现役周 + 2 个 fixture），实际 ${SOUNDS_SOURCES.length}`);
  console.log(`PASS grapheme migration（运行时门槛①）：glob 发现 ${SOUNDS_SOURCES.length} 个来源（>= 6 下限）、共 ${totalEntries} 条 SOUNDS 条目全部无自有键 L、grapheme 均合法`);
  console.log('  实际发现的来源清单：' + SOUNDS_SOURCES.join(', '));
}

// ============================================================================
// ② 源码扫描：七写法 .L / ['L'] / ["L"] / L: / 'L': / "L": / 解构（{L}/{L:x}），
//    显式排除清单。
// ============================================================================

/* M3 修复（预筛 medium：「六写法漏了解构，这条是真缺口」）：预筛逐条判断过——
 * `obj?.L` 已被 dot-access 覆盖（`/\.L\b/` 能匹配 `?.L` 里的 `.L` 子串）；
 * `Reflect.get(s,'L')`、`obj["L"+""]`、模板字符串动态键——本仓全是 ES5 风格课件代码
 * 与工具脚本，从不用这些，正则对动态键本就不可判定，追求覆盖等于自欺，**漏掉可接受**；
 * 但 `const {L} = s` / `const {L: label} = s` 解构不同——`tools/*.js` 与 `tests/*.js`
 * 都是现代 Node 风格、解构随处可见，**这条是真缺口**，补第 7 个模式。
 * 补完把"六写法"的措辞同步改成"七写法"（本节标题、下面 assert 消息、EXCLUDED_FILES
 * 注释、③④两组"改坏"验证均已同步）。 */
const SEVEN_PATTERNS = [
  { id: 'dot-access', re: /\.L\b/ },
  { id: 'bracket-single', re: /\['L'\]/ },
  { id: 'bracket-double', re: /\["L"\]/ },
  { id: 'key-bare', re: /\bL:/ },
  { id: 'key-single-quoted', re: /'L':/ },
  { id: 'key-double-quoted', re: /"L":/ },
  { id: 'destructure', re: /[{,]\s*L\s*[,}:=]/ }
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
 * 三者均已在本文件之外单独核实过用途，见收口报告。
 *
 * M2 修复（预筛 medium：「整文件排除过粗，且排除项会陈旧」）：改前是整文件排除
 * （`Set<file>`），问题两条都成立、粒度不成立——① tools/theme_palette.py 的命中只是
 * f-string 的 `{L:.1f}`（L 是亮度变量名），整文件排除会让该文件将来真出现的 `.L`
 * 隐形；② tools/legacy/w2data.py 是归档但仍可能被追加内容，同样不该整文件放行。
 * 改成 `{file, patternId}` 二元组——只排除"这个文件的这一种写法"，该文件其余六种
 * 写法一旦出现仍会被抓到。 */
const EXCLUDED_ENTRIES = [
  // sounds_grapheme_adapter.js：临时适配层本体，同时容忍/派生 L 与 grapheme 两个
  // 字段，必然含 dot-access（entry.L 读值）、key-bare/destructure（错误消息与注释里
  // 的 L: 字面量、以及本文件内部变量赋值场景）。
  { file: 'tools/validation/sounds_grapheme_adapter.js', patternId: 'dot-access', reason: '适配层读取 entry.L 派生 grapheme，属设计意图' },
  { file: 'tools/validation/sounds_grapheme_adapter.js', patternId: 'key-bare', reason: '错误消息/注释里的 L: 字面量说明' },
  { file: 'tools/validation/sounds_grapheme_adapter.js', patternId: 'destructure', reason: '同上，key-bare 正则同时命中的对象字面量场景' },
  // migration_audit.js：DATA-SOUNDS-01 的 l-field-present 规则本身职责就是"检测
  // SOUNDS 条目是否仍只有 L 没有 grapheme"，必须读 entry.L 才能判定，这是规则的
  // 核心逻辑而不是残留（L_FIELD_CONSUMER_SPECS 已在 H2 改指向 grapheme，不再需要
  // 排除；仅剩 l-field-present 这一处 dot-access）。
  { file: 'tools/validation/migration_audit.js', patternId: 'dot-access', reason: 'DATA-SOUNDS-01 l-field-present 规则读取 entry.L 判定是否仍缺 grapheme，是规则本身，不是残留' },
  // test_migration_audit.js：为验证适配层三态兼容与冲突检测，故意构造带 L 字段的
  // 合成 SOUNDS 常量（L_ONLY/BOTH/CONFLICTING_ALIAS 等），是测试数据。
  { file: 'tests/unit/test_migration_audit.js', patternId: 'dot-access', reason: '合成测试数据里访问 .L 字段核对适配层行为' },
  { file: 'tests/unit/test_migration_audit.js', patternId: 'key-bare', reason: '合成测试数据的对象字面量 L: 值' },
  { file: 'tests/unit/test_migration_audit.js', patternId: 'destructure', reason: '同上，key-bare 正则同时命中的对象字面量场景' },
  // tools/legacy/w2data.py：历史归档，整段存着迁移前的旧 JS 数据层字符串（`L:'c'`
  // 等）。不参与构建、不被任何运行路径引用，故不改；但从它复制代码到现役文件时
  // 必须自己把 L 换成 grapheme，这条排除就是为了让这件事有据可查。
  { file: 'tools/legacy/w2data.py', patternId: 'key-bare', reason: '历史归档字符串里的旧 L:\'x\' 写法' },
  { file: 'tools/legacy/w2data.py', patternId: 'destructure', reason: '同上，key-bare 正则同时命中的对象字面量场景' },
  // tools/theme_palette.py：命中的是 f-string 的格式说明符 `{L:.1f}`，L 是亮度变量名，
  // 与字位字形字段无关——只排除 key-bare/destructure 这两种误报模式，其余五种写法
  // 一旦在这个文件出现（比如真的读取了字位的 L 字段）仍会被抓到。
  { file: 'tools/theme_palette.py', patternId: 'key-bare', reason: 'f-string 格式说明符 {L:.1f} 的 L 是亮度变量名，误报' },
  { file: 'tools/theme_palette.py', patternId: 'destructure', reason: '同上，key-bare 正则同时命中的对象字面量场景（含 def tok(mode, token, L, C): 的形参列表）' },
  // tests/unit/test_theme_palette.py：theme_palette.py 的单测，同源沿用它的 OKLCH
  // 亮度变量命名 L（如 `tp.oklch_to_linear(L, kept, hue)`），与字位字形字段无关，
  // M1 扫描范围加 .html 前不会命中 .py（本文件早已存在，只是新增 destructure 模式
  // 后才第一次命中，M2 扩到 .html 与本项无关，这里只是把新暴露的误报如实记录）。
  { file: 'tests/unit/test_theme_palette.py', patternId: 'destructure', reason: 'OKLCH 亮度变量 L 在函数调用元组参数里的普通用法，与字位字形字段无关，与 theme_palette.py 同源误报' },
  // 本文件自己：SEVEN_PATTERNS 的正则源码与本注释块里就写着 .L / 'L': 等字面量，
  // 扫描自身会产生自我指涉的假阳性，必须排除全部七种写法。
  ...SEVEN_PATTERNS.map(p => ({ file: 'tests/unit/test_grapheme_migration.js', patternId: p.id, reason: '本文件的 SEVEN_PATTERNS 正则源码与注释自我指涉' }))
];
function excludedKey(file, patternId) { return file + '\u0000' + patternId; }
const EXCLUDED_SET = new Set(EXCLUDED_ENTRIES.map(e => excludedKey(e.file, e.patternId)));

// 归档 / 第三方 / 构建产物目录整体排除（与仓库既有约定一致：build/、tmp/ 均 gitignore）。
const EXCLUDED_DIR_PREFIXES = ['node_modules/', 'build/', 'tmp/', '.git/'];

/* M1 修复（预筛 medium：「源码扫描不扫 .html」）：四个 frontend/src/weeks/
 * week0N.template.html 受版本控制且含真实取数代码（如 week04 模板 7 处 SOUNDS[...]
 * 读取），只扫 .js/.py 漏了它们——扫描范围加 *.html。模板里含 base64 字体的
 * @font-face 大行（实测最长 24102 字符），按行长阈值跳过（超过 LONG_LINE_THRESHOLD
 * 的行不参与匹配）而不是只扫 <script> 段：四个模板实测真实代码行最长 748 字符、
 * base64 字体行最短 15133 字符，中间有巨大安全间隙，用行长阈值比解析 <script> 边界
 * 更简单可靠，也不会因为 <style> 块里偶尔出现内联脚本片段而漏扫。 */
const LONG_LINE_THRESHOLD = 2000;

function listTrackedJsFiles() {
  const { execFileSync } = require('node:child_process');
  // 扫描范围含 .py（2026-09-09 主会话抽查补）+ .html（M1，本批新增）：只扫 .js 会漏掉
  // 把 JS 源码作为字符串内嵌的 Python 文件（tools/legacy/w2data.py），也会漏掉
  // 四个周课件模板 .html 里内联的真实取数代码。
  const out = execFileSync('git', ['ls-files', '*.js', '*.py', '*.html'], { cwd: REPO, encoding: 'utf8' });
  return out.split('\n').filter(Boolean).map(p => p.replace(/\\/g, '/'));
}

/* scanForLResidue(files, patterns, excluded) -> Array<{file, patternId, line}>
 * 独立函数，供③处坏源码复用同一套扫描逻辑（不是另写一份弱化版）。excluded 现在是
 * `{file, patternId}` 二元组的集合（见 EXCLUDED_ENTRIES），不再是整文件粒度。 */
function scanForLResidue(files, patterns, excludedSet) {
  const hits = [];
  for (const rel of files) {
    if (EXCLUDED_DIR_PREFIXES.some(prefix => rel.startsWith(prefix))) continue;
    const raw = fs.readFileSync(path.join(REPO, rel), 'utf8');
    const lines = raw.split('\n');
    for (const { id, re } of patterns) {
      if (excludedSet.has(excludedKey(rel, id))) continue;
      lines.forEach((lineText, idx) => {
        if (lineText.length > LONG_LINE_THRESHOLD) return; // M1：跳过 base64 字体等超长行
        if (re.test(lineText)) hits.push({ file: rel, patternId: id, line: idx + 1 });
      });
    }
  }
  return hits;
}

{
  const files = listTrackedJsFiles();
  assert(files.length > 50, `git ls-files 应返回相当数量的 .js/.py/.html 文件，实际 ${files.length}——排除逻辑或路径可能有误`);
  const hits = scanForLResidue(files, SEVEN_PATTERNS, EXCLUDED_SET);
  assert.equal(hits.length, 0,
    `源码扫描发现 ${hits.length} 处残留 L 引用（应为 0）：\n` +
    hits.map(h => `  ${h.file}:${h.line} (${h.patternId})`).join('\n'));
  console.log(`PASS grapheme migration（源码门槛②）：${files.length} 个受版本控制 .js/.py/.html 文件（排除 ${EXCLUDED_ENTRIES.length} 个 {file,patternId} 白名单项、超过 ${LONG_LINE_THRESHOLD} 字符的行）七写法扫描全部干净`);
}

/* M2 陈旧自检：每个排除项当前必须仍至少命中 1 处（不看是否被真正跳过，单独用同一套
 * 正则原样扫一遍，不经过 EXCLUDED_SET 过滤），否则判为陈旧要求删除——改前"删掉一条
 * 排除也不会有人发现"，这里让陈旧的排除项自己变成一条会红的断言。跳过长行阈值仍要
 * 应用（否则 base64 行本身也可能巧合命中，产生误导性的"仍命中"）。 */
{
  const patternById = new Map(SEVEN_PATTERNS.map(p => [p.id, p.re]));
  const staleEntries = [];
  for (const entry of EXCLUDED_ENTRIES) {
    const abs = path.join(REPO, entry.file);
    if (!fs.existsSync(abs)) { staleEntries.push({ ...entry, why: '文件已不存在' }); continue; }
    const lines = fs.readFileSync(abs, 'utf8').split('\n');
    const re = patternById.get(entry.patternId);
    const stillHits = lines.some(lt => lt.length <= LONG_LINE_THRESHOLD && re.test(lt));
    if (!stillHits) staleEntries.push({ ...entry, why: '当前一处都不命中' });
  }
  assert.equal(staleEntries.length, 0,
    `以下排除项已陈旧（当前一处都不命中，应删除）：\n` +
    staleEntries.map(e => `  ${e.file} / ${e.patternId}：${e.why}（原因：${e.reason}）`).join('\n'));
  console.log(`PASS grapheme migration（M2 陈旧自检）：${EXCLUDED_ENTRIES.length} 个 {file,patternId} 排除项均仍至少命中 1 处，没有陈旧项`);
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
// ④ 证明门槛②真的会红：造一段带七种写法各一处的坏源码文本，内存扫描，不落盘。
// ============================================================================
{
  const fakeRel = '__synthetic__/fake.js';
  const fakeSource = [
    "const a = SOUNDS[f].L;",           // .L
    "const b = SOUNDS['L'];",           // ['L']
    'const c = SOUNDS["L"];',           // ["L"]
    "const d = { L: 'x' };",            // L:
    "const e = { 'L': 'x' };",          // 'L':
    'const f2 = { "L": "x" };',         // "L":
    "const { L } = entry;"              // 解构（M3 新增）
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
    hits = scanForLResidue([fakeRel], SEVEN_PATTERNS, new Set());
  } finally {
    fs.readFileSync = originalReadFileSync;
  }
  // 注：destructure 的正则 /[{,]\s*L\s*[,}:=]/ 与 key-bare 的 /\bL:/ 在"对象字面量键"
  // 这一种写法（`{ L: 'x' }`）上天然重叠——两个模式独立设计、各自负责的写法不同，
  // 重叠命中同一行是预期行为，不是缺陷，所以这里不再要求 hits.length 恰好等于
  // SEVEN_PATTERNS.length（7），而是分别核对"每种写法至少被命中一次"（不重不漏地
  // 覆盖全部七种模式 id）与"命中总数与七行坏源码的实际匹配次数一致"。
  const EXPECTED_HITS = 8; // 7 行坏源码，其中 `{ L: 'x' }` 同时命中 key-bare 与 destructure
  assert.equal(hits.length, EXPECTED_HITS, `坏源码应命中 ${EXPECTED_HITS} 处（7 种写法，其中对象字面量键形态被 key-bare 与 destructure 两个模式重叠命中），实际命中 ${hits.length} 处`);
  const hitIdSet = new Set(hits.map(h => h.patternId));
  assert.deepEqual([...hitIdSet].sort(), SEVEN_PATTERNS.map(p => p.id).sort(), '七种写法应各自至少被对应的模式命中一次，不漏任何一种');
  console.log('PASS grapheme migration（分辨力验证②，内存构造，不落盘）：七写法坏源码全部被源码扫描门槛命中');
}
