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
 * "这次真的扫到了新文件"而不是巧合地还是 6 个。
 *
 * M1 修复（预筛 medium：「globSoundsSources 依赖 git ls-files，本地新建但尚未 git add
 * 的 week05 数据不会被扫描，而注释宣称新增周会"自动纳入"——又是声明大于实作」）：
 * 上一版虽然从"硬编码 6 个路径"改成了"glob"，但 glob 的实现仍然是 `git ls-files
 * <pattern>`——本质还是只看 git 索引，一个字没解决"未 add 就不可见"这个真问题。
 * 现在改用文件系统 glob（`fs.readdirSync`），不经过 git：副机在本地新建
 * `frontend/src/weeks/week05.data.js` 后，即使还没 `git add`，这里也会立刻扫到它。
 * 目录本身固定（`frontend/src/weeks/`、`tests/fixtures/`），不会误扫到构建产物/临时
 * 目录（这两个目录本就不含 build/tmp 产物，无需额外排除）。 */
function globSoundsSources() {
  const files = [];
  const weekFilePattern = /^week\d+\.data\.js$/;
  const weeksDir = path.join(REPO, 'frontend', 'src', 'weeks');
  if (fs.existsSync(weeksDir)) {
    for (const name of fs.readdirSync(weeksDir)) {
      if (weekFilePattern.test(name)) files.push('frontend/src/weeks/' + name);
    }
  }
  const fixtureFilePattern = /^week\d+-data\.js$/;
  const fixturesDir = path.join(REPO, 'tests', 'fixtures');
  if (fs.existsSync(fixturesDir)) {
    for (const name of fs.readdirSync(fixturesDir)) {
      if (fixtureFilePattern.test(name)) files.push('tests/fixtures/' + name);
    }
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
 * 写法一旦出现仍会被抓到。
 *
 * M2 二次修复（2026-09-09 里程碑 2 收口批，codex 原话：「白名单粒度实际是"整文件 +
 * 整个模式"。该文件将来新增任何生产性 .L 读取都会被整体放行；陈旧自检只能证明"文件里
 * 仍有至少一个合法命中"，发现不了额外的非法命中」）：`{file, patternId}` 仍然是"这个
 * 文件这种写法，一律放行"——sounds_grapheme_adapter.js 获准 dot-access 后，它将来
 * 新增的任何一处 `.L` 读取（哪怕是完全不同意图、不同行）都会被同一条排除项悄悄吃掉。
 * 现在每条排除项都绑定一个可核对的**预期命中数**（`count`）：下面 scanForLResidue
 * 按文件+模式只消耗声明的这么多处命中，一旦这个文件这种写法的实际命中数超过声明值，
 * 多出来的命中会被当作真实的 hits 报出来（不是被整条模式放行）；M2 陈旧自检同步改成
 * "声明数与实测数必须精确相等"（不再是"至少命中 1 次"这种宽判据），命中数变化（增或
 * 减）都会被抓住，逼人来这里更新数字并说明理由。
 * 例外：本文件自身（SEVEN_PATTERNS 正则源码 + 本段注释）是自我指涉的假阳性，
 * 不是"生产代码里的已知合法用法"，用 `unbounded:true` 整段豁免而不绑定命中数——
 * 理由不同于其余各条：其余各条是"这个文件这一种写法有 N 处已核实合法的用法，多出的
 * 要抓"；本文件自己是"这个文件的这几种写法压根不构成生产语义上的 L 残留，无论写多少
 * 次注释/正则字面量都不该被当成需要盯防的对象"，两者不是同一种豁免理由，故不适用
 * 同一套"绑定命中数"的处理。 */
const EXCLUDED_ENTRIES = [
  // sounds_grapheme_adapter.js：临时适配层本体，同时容忍/派生 L 与 grapheme 两个
  // 字段，必然含 dot-access（entry.L 读值）、key-bare/destructure（错误消息与注释里
  // 的 L: 字面量、以及本文件内部变量赋值场景）。
  { file: 'tools/validation/sounds_grapheme_adapter.js', patternId: 'dot-access', count: 5, reason: '适配层读取 entry.L 派生 grapheme，属设计意图' },
  { file: 'tools/validation/sounds_grapheme_adapter.js', patternId: 'key-bare', count: 6, reason: '错误消息/注释里的 L: 字面量说明' },
  { file: 'tools/validation/sounds_grapheme_adapter.js', patternId: 'destructure', count: 3, reason: '同上，key-bare 正则同时命中的对象字面量场景' },
  // migration_audit.js：DATA-SOUNDS-01 的 l-field-present 规则本身职责就是"检测
  // SOUNDS 条目是否仍只有 L 没有 grapheme"，必须读 entry.L 才能判定，这是规则的
  // 核心逻辑而不是残留（L_FIELD_CONSUMER_SPECS 已在 H2 改指向 grapheme，不再需要
  // 排除；仅剩 l-field-present 这一处 dot-access）。
  { file: 'tools/validation/migration_audit.js', patternId: 'dot-access', count: 3, reason: 'DATA-SOUNDS-01 l-field-present 规则读取 entry.L 判定是否仍缺 grapheme，是规则本身，不是残留' },
  // test_migration_audit.js：为验证适配层三态兼容与冲突检测，故意构造带 L 字段的
  // 合成 SOUNDS 常量（L_ONLY/BOTH/CONFLICTING_ALIAS 等），是测试数据。
  { file: 'tests/unit/test_migration_audit.js', patternId: 'dot-access', count: 1, reason: '合成测试数据里访问 .L 字段核对适配层行为' },
  { file: 'tests/unit/test_migration_audit.js', patternId: 'key-bare', count: 9, reason: '合成测试数据的对象字面量 L: 值' },
  { file: 'tests/unit/test_migration_audit.js', patternId: 'destructure', count: 7, reason: '同上，key-bare 正则同时命中的对象字面量场景' },
  // tools/legacy/w2data.py：历史归档，整段存着迁移前的旧 JS 数据层字符串（`L:'c'`
  // 等）。不参与构建、不被任何运行路径引用，故不改；但从它复制代码到现役文件时
  // 必须自己把 L 换成 grapheme，这条排除就是为了让这件事有据可查。
  { file: 'tools/legacy/w2data.py', patternId: 'key-bare', count: 7, reason: '历史归档字符串里的旧 L:\'x\' 写法' },
  { file: 'tools/legacy/w2data.py', patternId: 'destructure', count: 7, reason: '同上，key-bare 正则同时命中的对象字面量场景' },
  // tools/theme_palette.py：命中的是 f-string 的格式说明符 `{L:.1f}`，L 是亮度变量名，
  // 与字位字形字段无关——只排除 key-bare/destructure 这两种误报模式，其余五种写法
  // 一旦在这个文件出现（比如真的读取了字位的 L 字段）仍会被抓到。
  { file: 'tools/theme_palette.py', patternId: 'key-bare', count: 1, reason: 'f-string 格式说明符 {L:.1f} 的 L 是亮度变量名，误报' },
  { file: 'tools/theme_palette.py', patternId: 'destructure', count: 2, reason: '同上，key-bare 正则同时命中的对象字面量场景（含 def tok(mode, token, L, C): 的形参列表）' },
  // tests/unit/test_theme_palette.py：theme_palette.py 的单测，同源沿用它的 OKLCH
  // 亮度变量命名 L（如 `tp.oklch_to_linear(L, kept, hue)`），与字位字形字段无关，
  // M1 扫描范围加 .html 前不会命中 .py（本文件早已存在，只是新增 destructure 模式
  // 后才第一次命中，M2 扩到 .html 与本项无关，这里只是把新暴露的误报如实记录）。
  { file: 'tests/unit/test_theme_palette.py', patternId: 'destructure', count: 1, reason: 'OKLCH 亮度变量 L 在函数调用元组参数里的普通用法，与字位字形字段无关，与 theme_palette.py 同源误报' },
  // 本文件自己：SEVEN_PATTERNS 的正则源码与本注释块里就写着 .L / 'L': 等字面量，
  // 扫描自身会产生自我指涉的假阳性，必须排除全部七种写法。unbounded:true 见上方
  // M2 二次修复注释——自我指涉不绑定命中数，整段豁免。
  ...SEVEN_PATTERNS.map(p => ({ file: 'tests/unit/test_grapheme_migration.js', patternId: p.id, unbounded: true, reason: '本文件的 SEVEN_PATTERNS 正则源码与注释自我指涉' }))
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

/* M1 修复（预筛 medium，第二处：源码扫描 listTrackedJsFiles 同样只信 git ls-files）：
 * 本地新建但尚未 `git add` 的 .js/.py/.html 文件（比如副机刚写完还没提交的工具脚本）
 * 不会出现在 git ls-files 的结果里，于是永远不会被下面的七写法扫描覆盖——"新文件
 * 自动纳入扫描"这句承诺对它们不成立。这里不改成纯文件系统 glob（那样会把
 * node_modules/build/tmp 等本就该排除的目录也扫进来，还要重新发明一遍 .gitignore
 * 的语义），改成"合并 + 显式失败"：仍用 git ls-files 拿到权威的跟踪文件集合，另外
 * 用文件系统遍历 frontend/src、tools、tests 这三个源码扫描真正关心的目录，找出
 * "文件存在但未被 git 跟踪"的候选——只要有一个，直接断言失败并提示 git add，不允许
 * 悄悄漏扫（这比"静默把未跟踪文件也纳入扫描"更安全：未跟踪文件也可能是刻意留着不提交
 * 的草稿，不该被自动当成扫描对象，但也不能被这道门槛无声放过——两种处置都不对，
 * 唯一对的是让人显式决定）。 */
function listTrackedJsFiles() {
  const { execFileSync } = require('node:child_process');
  // 扫描范围含 .py（2026-09-09 主会话抽查补）+ .html（M1，本批新增）：只扫 .js 会漏掉
  // 把 JS 源码作为字符串内嵌的 Python 文件（tools/legacy/w2data.py），也会漏掉
  // 四个周课件模板 .html 里内联的真实取数代码。
  const out = execFileSync('git', ['ls-files', '*.js', '*.py', '*.html'], { cwd: REPO, encoding: 'utf8' });
  const tracked = new Set(out.split('\n').filter(Boolean).map(p => p.replace(/\\/g, '/')));

  const SCAN_ROOTS = ['frontend/src', 'tools', 'tests'];
  const SKIP_DIR_NAMES = new Set(['node_modules', '.git', 'build', 'tmp', '__pycache__']);
  const candidates = [];
  function walk(dir) {
    for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (dirent.isDirectory()) {
        if (SKIP_DIR_NAMES.has(dirent.name)) continue;
        walk(path.join(dir, dirent.name));
        continue;
      }
      if (/\.(js|py|html)$/.test(dirent.name)) {
        candidates.push(path.relative(REPO, path.join(dir, dirent.name)).replace(/\\/g, '/'));
      }
    }
  }
  for (const root of SCAN_ROOTS) {
    const abs = path.join(REPO, ...root.split('/'));
    if (fs.existsSync(abs)) walk(abs);
  }
  const untracked = candidates.filter(rel => !tracked.has(rel));
  assert.equal(
    untracked.length, 0,
    `发现 ${untracked.length} 个未被 git 跟踪的 .js/.py/.html 文件（源码扫描门槛②只扫描 git ` +
    `跟踪的文件，未 git add 的文件不会被"新文件自动纳入扫描"这句承诺覆盖）——请先确认这些` +
    `文件该不该纳入扫描：该纳入就 git add，是刻意不提交的草稿/临时文件就移出 ` +
    `frontend/src、tools、tests 之外：\n` + untracked.map(f => `  ${f}`).join('\n')
  );

  return [...tracked];
}

/* scanForLResidue(files, patterns, excludedEntries) -> Array<{file, patternId, line}>
 * 独立函数，供③处坏源码复用同一套扫描逻辑（不是另写一份弱化版）。excludedEntries 是
 * EXCLUDED_ENTRIES 数组（或其子集/空数组）——M2 二次修复：不再是"文件+模式命中就整段
 * 放行"，而是按声明的 `count` **只消耗这么多处命中**（按文件内出现顺序消耗，先到先
 * 抵扣）；`unbounded:true` 的条目（仅本文件自我指涉）整段跳过，不计数。超过声明数的
 * 命中不会被吞掉，会正常进入 hits——这正是 codex 点名要挡的"该文件将来新增任何生产性
 * .L 读取都会被整体放行"。 */
function scanForLResidue(files, patterns, excludedEntries) {
  const byKey = new Map();
  for (const e of excludedEntries) byKey.set(excludedKey(e.file, e.patternId), e);
  const hits = [];
  for (const rel of files) {
    if (EXCLUDED_DIR_PREFIXES.some(prefix => rel.startsWith(prefix))) continue;
    const raw = fs.readFileSync(path.join(REPO, rel), 'utf8');
    const lines = raw.split('\n');
    for (const { id, re } of patterns) {
      const entry = byKey.get(excludedKey(rel, id));
      if (entry && entry.unbounded) continue; // 自我指涉整段豁免，不计数
      let remaining = entry ? entry.count : 0; // 未声明的 {file,patternId} 组合 remaining=0，即完全不豁免
      lines.forEach((lineText, idx) => {
        if (lineText.length > LONG_LINE_THRESHOLD) return; // M1：跳过 base64 字体等超长行
        if (!re.test(lineText)) return;
        if (remaining > 0) { remaining--; return; } // 消耗一处已声明的白名单命中，不计入 hits
        hits.push({ file: rel, patternId: id, line: idx + 1 });
      });
    }
  }
  return hits;
}

{
  const files = listTrackedJsFiles();
  assert(files.length > 50, `git ls-files 应返回相当数量的 .js/.py/.html 文件，实际 ${files.length}——排除逻辑或路径可能有误`);
  const hits = scanForLResidue(files, SEVEN_PATTERNS, EXCLUDED_ENTRIES);
  assert.equal(hits.length, 0,
    `源码扫描发现 ${hits.length} 处残留 L 引用（应为 0，含"超出白名单声明命中数"的额外命中）：\n` +
    hits.map(h => `  ${h.file}:${h.line} (${h.patternId})`).join('\n'));
  console.log(`PASS grapheme migration（源码门槛②）：${files.length} 个受版本控制 .js/.py/.html 文件（排除 ${EXCLUDED_ENTRIES.length} 个按精确命中数消耗的 {file,patternId} 白名单项、超过 ${LONG_LINE_THRESHOLD} 字符的行）七写法扫描全部干净`);
}

/* M2 陈旧自检（二次修复：判据从"仍至少命中 1 处"收紧为"实测命中数与声明的 count 精确
 * 相等"）：改前的宽判据只能证明"文件里还有命中"，抓不住"文件里其实多了新的合法命中，
 * 但白名单还是旧数字"这种漂移——那种情况下旧宽判据不会报警，但 scanForLResidue 会把
 * 多出来的命中当真实 hits 报出来，二者现在互为印证：这里改成精确相等后，"声明数与实测
 * 不符"本身就先在这一步被点名（附带原因，比在主断言的 hits 列表里裸看行号更好懂）。
 * unbounded 条目（本文件自我指涉）维持"至少命中 1 次"的宽判据——它们不绑定具体数字。 */
{
  const patternById = new Map(SEVEN_PATTERNS.map(p => [p.id, p.re]));
  const staleEntries = [];
  for (const entry of EXCLUDED_ENTRIES) {
    const abs = path.join(REPO, entry.file);
    if (!fs.existsSync(abs)) { staleEntries.push({ ...entry, why: '文件已不存在' }); continue; }
    const lines = fs.readFileSync(abs, 'utf8').split('\n');
    const re = patternById.get(entry.patternId);
    const actualCount = lines.filter(lt => lt.length <= LONG_LINE_THRESHOLD && re.test(lt)).length;
    if (entry.unbounded) {
      if (actualCount === 0) staleEntries.push({ ...entry, why: '当前一处都不命中（自我指涉豁免已陈旧）' });
      continue;
    }
    if (actualCount !== entry.count) {
      staleEntries.push({
        ...entry,
        why: `声明命中数 ${entry.count} 与实测 ${actualCount} 不一致——请核实是"这行代码/注释真的变了"` +
          `（变了就更新 count）还是"扫描逻辑本身有问题"，不要不加理由地改数字`
      });
    }
  }
  assert.equal(staleEntries.length, 0,
    `以下排除项声明命中数与实测不一致（或已陈旧）：\n` +
    staleEntries.map(e => `  ${e.file} / ${e.patternId}：${e.why}（原因：${e.reason}）`).join('\n'));
  console.log(`PASS grapheme migration（M2 陈旧自检）：${EXCLUDED_ENTRIES.length} 个 {file,patternId} 排除项声明命中数与实测均精确相等（自我指涉条目除外，仍按"至少命中 1 次"判据）`);
}

// ============================================================================
// M4（里程碑 2 收口批，2026-09-09）：normalizeIdList(value, {legacy:true}) 静态清单门槛。
// codex 原话：「三段式签名把迁移状态传播到每个消费者：4b 要逐点决定传不传
// legacy:true，第 7/8 步又要逐点撤销，任何漏撤都是长期兼容后门」。
// 裁定（见任务书 M4）：本批不做结构性重构（把转换集中到加载边界是 4b 的事，现在动
// 会与 4b 撞车）。只建立静态清单 + 门槛：列出当前全部传 legacy:true 的调用点（下方
// 常量），并断言生产代码（frontend/src/ 与 tools/ 下非测试文件；tools/legacy/ 归档
// 目录不算生产代码，与 sounds_grapheme_adapter.js 等排除清单同一套判断口径）里不得
// 出现 legacy:true——现在应为 0 处（唯一的两处调用点都在 tests/unit/ 下，是测试用旧
// 格式合成数据核对 normalizeIdList 自身行为，不是生产消费方）。第 7 步（方案 §3.5）
// 把全部消费方接完线、"legacy 字符串展开"分支本身被删除（normalizeIdList 收口为
// assertIdList）时，这道门槛要连测试代码也一起管——届时 KNOWN_LEGACY_TRUE_CALL_SITES
// 应清空，下面的扫描范围也要去掉 `rel.startsWith('tests/')` 这条豁免。
// ============================================================================

/* KNOWN_LEGACY_TRUE_CALL_SITES：当前全部传 `{ legacy: true }` 的调用点静态清单
 * （均为测试代码，不是生产代码——生产代码目前是 0 处，这正是下面门槛断言要守住的）。
 * 4b 步接线开始后，生产代码里每新增一处 legacy:true 都不会自动进这份清单，而是会被
 * 下面"生产代码不得出现 legacy:true"的断言拦下，逼人显式来这里登记、并写明为什么
 * 这次接线必须传 legacy:true（这正是这条 medium 要的效果——把"新增一处长期兼容后门"
 * 变成一个会被看见、需要说明理由的动作，而不是随手加一个选项）。 */
const KNOWN_LEGACY_TRUE_CALL_SITES = Object.freeze([
  { file: 'tests/unit/test_migration_diff.js', reason: '差分测试读取真实 W1-W4 的 box.META.rackG4/rackG5，现状仍是迁移前旧格式字符串，用 legacy:true 展开成 ID 数组做差分对照（本文件差分 1，见 diffSpellingComparison）' },
  { file: 'tests/unit/test_graphemes.js', reason: 'normalizeIdList 自身的单测，构造旧格式字符串输入验证 legacy 分支行为' }
]);

/* LEGACY_TRUE_DOC_MENTIONS：graphemes.js 里两处提到 `legacy:true` 的地方（一处是
 * options.legacy 的行为文档注释，一处是 id-list-legacy-string-rejected 错误消息里
 * 指导调用方"如果确实是旧格式数据请显式传 {legacy:true}"）——它们是**文档/错误提示
 * 文案提及这个选项名**，不是"这处代码自己调用时传了 legacy:true"，与生产代码真的
 * 调用 normalizeIdList(value, {legacy:true}) 是两回事，不该被本门槛当成调用点误伤。
 * 同样按精确命中数消耗（与 EXCLUDED_ENTRIES 同一套判据，避免"该文件将来新增任何
 * 真实调用点都被整体放行"），不是整文件豁免。 */
const LEGACY_TRUE_DOC_MENTIONS = Object.freeze([
  { file: 'frontend/src/shared/graphemes.js', count: 2, reason: '两处均为文档注释/错误提示文案提及选项名，不是调用点（见 normalizeIdList 头注释与 id-list-legacy-string-rejected 错误消息）' }
]);

const LEGACY_TRUE_PATTERN = /\blegacy\s*:\s*true\b/;
function scanForLegacyTrue(files) {
  const docByFile = new Map(LEGACY_TRUE_DOC_MENTIONS.map(e => [e.file, e.count]));
  const hits = [];
  for (const rel of files) {
    if (rel.startsWith('tests/')) continue; // 测试代码不在本批门槛范围内，见上方 KNOWN_LEGACY_TRUE_CALL_SITES 头注释
    if (rel.startsWith('tools/legacy/')) continue; // 归档目录，与 normalizeIdList 的 legacy 选项无关（同名巧合）
    const raw = fs.readFileSync(path.join(REPO, rel), 'utf8');
    let remaining = docByFile.has(rel) ? docByFile.get(rel) : 0;
    raw.split('\n').forEach((lineText, idx) => {
      if (lineText.length > LONG_LINE_THRESHOLD) return; // 同 M1：跳过 base64 等超长行
      if (!LEGACY_TRUE_PATTERN.test(lineText)) return;
      if (remaining > 0) { remaining--; return; } // 消耗掉已登记的文档提及，不计入 hits
      hits.push({ file: rel, line: idx + 1 });
    });
  }
  return hits;
}
{
  const files = listTrackedJsFiles().filter(f => f.startsWith('frontend/src/') || f.startsWith('tools/'));
  const hits = scanForLegacyTrue(files);
  assert.equal(hits.length, 0,
    `生产代码（frontend/src/ 与 tools/ 下非测试文件、非 tools/legacy/ 归档目录）中不得出现 ` +
    `legacy:true（应为 0 处——已知的全部调用点都应只在 tests/unit/ 下，见 ` +
    `KNOWN_LEGACY_TRUE_CALL_SITES），实际发现：\n` +
    hits.map(h => `  ${h.file}:${h.line}`).join('\n'));
  console.log(`PASS grapheme migration（M4 静态清单门槛）：生产代码 0 处 legacy:true（已知调用点清单 ${KNOWN_LEGACY_TRUE_CALL_SITES.length} 项，均在 tests/unit/ 下）`);
}
// 分辨力验证（改坏，内存构造，不落盘）：构造一段生产代码路径下、内嵌 legacy:true 的
// 坏源码文本，证明门槛真的会红。
{
  const fakeRel = 'frontend/src/__synthetic__/fake-consumer.js';
  const fakeSource = "normalizeIdList(box.META.rackG4, { legacy: true });";
  const originalReadFileSync = fs.readFileSync;
  fs.readFileSync = function (p, enc) {
    if (String(p).replace(/\\/g, '/').endsWith(fakeRel)) return fakeSource;
    return originalReadFileSync(p, enc);
  };
  let hits;
  try {
    hits = scanForLegacyTrue([fakeRel]);
  } finally {
    fs.readFileSync = originalReadFileSync;
  }
  assert.equal(hits.length, 1, '坏源码（生产代码路径下的 legacy:true）应被 M4 门槛命中 1 处');
  console.log('PASS grapheme migration（M4 分辨力验证，内存构造，不落盘）：生产代码路径下的 legacy:true 会被门槛命中');
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
    hits = scanForLResidue([fakeRel], SEVEN_PATTERNS, []);
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
