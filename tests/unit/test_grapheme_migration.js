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
  // M4 重计数（外审 medium，2026-09-09）：改前的行级判据把「命中的行数」当成
  // 「命中次数」，count 是按行数标定的；改成按 occurrence 精确计数后，用同一套
  // 判据重新实测本文件每种写法的真实出现次数，二者不同的条目在这里更新——不是
  // 数据变了，是量尺变了（改前会漏数同一行里的第二处 .L/L:，见 migration_audit.js
  // 那条 `entry.L === 'string' && entry.L.length > 0` 同一行两次 dot-access 的实证）。
  { file: 'tools/validation/sounds_grapheme_adapter.js', patternId: 'dot-access', count: 6, reason: '适配层读取 entry.L 派生 grapheme，属设计意图（M4 重计数：5→6，第 78 行 `typeof entry.L === \'string\' && entry.L.length > 0` 同一行两处 .L）' },
  { file: 'tools/validation/sounds_grapheme_adapter.js', patternId: 'key-bare', count: 7, reason: '错误消息/注释里的 L: 字面量说明（M4 重计数：6→7）' },
  { file: 'tools/validation/sounds_grapheme_adapter.js', patternId: 'destructure', count: 3, reason: '同上，key-bare 正则同时命中的对象字面量场景' },
  // migration_audit.js：DATA-SOUNDS-01 的 l-field-present 规则本身职责就是"检测
  // SOUNDS 条目是否仍只有 L 没有 grapheme"，必须读 entry.L 才能判定，这是规则的
  // 核心逻辑而不是残留（L_FIELD_CONSUMER_SPECS 已在 H2 改指向 grapheme，不再需要
  // 排除；仅剩 l-field-present 这一处 dot-access）。
  { file: 'tools/validation/migration_audit.js', patternId: 'dot-access', count: 4, reason: 'DATA-SOUNDS-01 l-field-present 规则读取 entry.L 判定是否仍缺 grapheme，是规则本身，不是残留（M4 重计数：3→4，第 405 行 `typeof entry.L === \'string\' && entry.L.length > 0` 同一行两处 .L）' },
  // test_migration_audit.js：合成 SOUNDS 常量（L_ONLY/BOTH/CONFLICTING_ALIAS 等）
  // 用的都是 `L: 'x'` 这种对象字面量写法（走 key-bare/destructure 两条 pattern，
  // 见下两行），不是 `entry.L` 属性访问。这里原有一条 dot-access:1 的白名单项，
  // 唯一命中来源实测是一段注释文字里的"旧 .L 形状"这四个字，不是真的属性访问代码——
  // 轮 D L2（外审，2026-09-10）重写了那段注释（改成不含 ".L" 字样的措辞，见该文件
  // expectMigrated 附近改动）后，这个文件的 dot-access 命中数如实降为 0，故删除
  // 这条白名单项（不是"扫描逻辑坏了不加理由改数字"，是命中来源本就是巧合的注释
  // 文本，如实反映现状）。
  { file: 'tests/unit/test_migration_audit.js', patternId: 'key-bare', count: 14, reason: '合成测试数据的对象字面量 L: 值（M4 重计数：9→14，L_ONLY/BOTH 两个合成常量各在一行内连写 r/ai/n 三个 L: 字面量，单行各命中 3 处，改前的行级判据只按行数记成 2）' },
  { file: 'tests/unit/test_migration_audit.js', patternId: 'destructure', count: 11, reason: '同上，key-bare 正则同时命中的对象字面量场景（M4 重计数：7→11，同一行多个 L: 的场景）' },
  // test_word_coloring.js（里程碑 2 第 4b 步收口批新增）：validateSoundsSchema 的
  // legacy-l-field 反例断言故意构造 { L: 's' } 这个合成对象字面量，用来验证"仍有
  // 遗留 L 字段"这条 issue 码；不是生产代码里的残留读取。
  { file: 'tests/unit/test_word_coloring.js', patternId: 'key-bare', count: 1, reason: 'validateSoundsSchema legacy-l-field 反例的合成对象字面量 L: 值' },
  { file: 'tests/unit/test_word_coloring.js', patternId: 'destructure', count: 1, reason: '同上，key-bare 正则同时命中的对象字面量场景' },
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
  ...SEVEN_PATTERNS.map(p => ({ file: 'tests/unit/test_grapheme_migration.js', patternId: p.id, unbounded: true, reason: '本文件的 SEVEN_PATTERNS 正则源码与注释自我指涉' })),
  // B-M1（外审 medium，2026-09-10）新增的两份 tests/fixtures/ HTML fixture：
  // 一份是真实历史生产产物（226e619，迁移前形态，SOUNDS 条目本就用 L 字段而不是
  // grapheme），一份是在它基础上做最小手术式修改的合成变体——两者的存在意义就是
  // "忠实保留/复现旧格式"，故意含 L 残留正是 B-M1 测试要验证的前提条件，不是需要
  // 清理的残留。unbounded:true：这类历史快照类 fixture 不追求精确计数（内容本身
  // 就是完整抄录的真实旧产物，不是逐行手写的合成数据，精确数字对判断没有意义）。
  // 只登记这两份 fixture 实测真的命中的三种写法（dot-access/key-bare/destructure，
  // 均实测 3/6/6 次）——不像自我指涉那样盲目登记全部七种，M2 陈旧自检对
  // unbounded 条目仍要求"至少命中一次"，登记一个实际零命中的写法只会被判"陈旧"。
  ...['dot-access', 'key-bare', 'destructure'].map(id => ({ file: 'tests/fixtures/week01-html-226e619-real-legacy-stripped.html', patternId: id, unbounded: true, reason: 'B-M1：真实历史生产产物（226e619，迁移前形态），忠实保留旧 L 字段是 fixture 的设计目的本身' })),
  ...['dot-access', 'key-bare', 'destructure'].map(id => ({ file: 'tests/fixtures/week01-html-226e619-legacy-no-meta-corrupted.html', patternId: id, unbounded: true, reason: 'B-M1：基于上述真实产物做最小手术式修改（删 META + 注入语法错误 token）的合成变体，同样忠实保留旧 L 字段' }))
];
function countMatches(re, text) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  const m = text.match(g);
  return m ? m.length : 0;
}
function excludedKey(file, patternId) { return file + '\u0000' + patternId; }
const EXCLUDED_SET = new Set(EXCLUDED_ENTRIES.map(e => excludedKey(e.file, e.patternId)));

// 归档 / 第三方 / 构建产物目录整体排除（与仓库既有约定一致：build/、tmp/ 均 gitignore）。
// tools/vendor/（段 4 U1，2026-09-11 新增）：第三方 vendor 代码（acorn.js，238KB，
// 见 tools/vendor/README.md），非本项目源码，不参与 L→grapheme 迁移——它必须被
// git 跟踪（listTrackedJsFiles 的护栏要求 tools/ 下任何 .js 文件都不能是未跟踪
// 状态，见该函数头注释），一旦被跟踪就会被下面的源码扫描扫到，里面必然有形如
// 单字母变量 `L` 的写法（压缩后的第三方代码，变量名与本项目"字位字段 L"的语义
// 毫无关系）。用整目录排除而不是 {file, patternId, count} 精确计数：vendor 代码
// 不应该被手工修改（升级方式是整份重新下载，见 README.md），逐条命中计数在这里
// 没有意义——真正的"该不该动这份第三方代码"判断在于要不要升级版本，不在于本文件
// 这套面向手写代码残留检测设计的计数机制。
const EXCLUDED_DIR_PREFIXES = ['node_modules/', 'build/', 'tmp/', '.git/', 'tools/vendor/'];

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
        // M4：按整行出现次数逐个消耗/逐个记 hit，不是"这行命中就算 1 次"——
        // 同一行出现两次 .L 时，第二次不该被第一次剩下的配额悄悄免检。
        const n = countMatches(re, lineText);
        for (let k = 0; k < n; k++) {
          if (remaining > 0) { remaining--; continue; } // 消耗一处已声明的白名单命中，不计入 hits
          hits.push({ file: rel, patternId: id, line: idx + 1 });
        }
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
    // M4：同 scanForLResidue，按出现次数求和，不是"命中的行数"——否则本该抓住的
    // "同一行第二次命中"漂移，在这道陈旧自检里也会被静默放过。
    const actualCount = lines.reduce((sum, lt) => sum + (lt.length <= LONG_LINE_THRESHOLD ? countMatches(re, lt) : 0), 0);
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
// M4（里程碑 2 收口批，2026-09-09 建立 / 2026-09-10 第 8 步终态）：
// normalizeIdList(value, {legacy:true}) 静态清单门槛。
// codex 原话：「三段式签名把迁移状态传播到每个消费者：4b 要逐点决定传不传
// legacy:true，第 7/8 步又要逐点撤销，任何漏撤都是长期兼容后门」。
// 沿革：本门槛建立时（第 4b 步前）只做静态清单 + 门槛，不做结构性重构——列出当时
// 全部传 legacy:true 的调用点，断言生产代码（frontend/src/ 与 tools/ 下非测试
// 文件；tools/legacy/ 归档目录不算生产代码）里的 legacy:true 都在
// KNOWN_LEGACY_TRUE_CALL_SITES 登记范围内，未登记的命中判失败。第 7 步数据迁成
// 数组后，当时登记的 5 条生产代码条目逐一撤销（count 归零，条目保留作历史记录）。
//
// **第 8 步终态（方案 §3.5：「第 2 步引入，第 8 步收紧为 assertIdList」）**：
// normalizeIdList 的 "legacy 字符串展开" 分支与 legacy 选项本身已被整体删除、
// 函数收口改名为 assertIdList(value, sounds)——不再有任何调用形态能合法携带
// legacy:true（第二个参数的含义已改成 sounds 表，传 `{legacy:true}` 会被
// resolveSoundEntry 当成非法 sounds 参数报错，而不是被特殊处理）。据此：
//   - KNOWN_LEGACY_TRUE_CALL_SITES 与 LEGACY_TRUE_DOC_MENTIONS 均清空为空数组——
//     全仓（frontend/src/、tools/、tests/unit/ 的两处历史调用点）已同步把
//     `normalizeIdList(x, {legacy:true})` 改成 `assertIdList(x, sounds)`，不再有
//     字面量 legacy:true 需要登记豁免。
//   - scanForLegacyTrue 去掉 `rel.startsWith('tests/')` 豁免——这道门槛此后连
//     测试代码也一起管，不再区分"生产代码"与"测试代码"两套标准。
// 这两个常量与 scanForLegacyTrue 本身**继续保留**（不随选项一起删除）：它们是
// 通用的文本模式扫描器，与 assertIdList 当前是否支持 legacy 无关——即使 API 层面
// 已经不存在这个选项，仍然值得作为一道永久回归门槛，防止未来有人从旧文档/历史
// commit 里复制粘贴出 `{legacy:true}` 这种写法（那会被 resolveSoundEntry 当场
// 抛错，但抛出的是相对含糊的 sounds-invalid/unknown-id，不如这道静态门槛的提示
// 直接）。
// ============================================================================

/* KNOWN_LEGACY_TRUE_CALL_SITES：第 8 步终态下应为空——见上方门槛头注释。保留这个
 * 常量（而不是删掉整套机制）是为了让 scanForLegacyTrue 的登记/消耗逻辑对未来
 * 可能出现的新 legacy:true 误用仍然可用，不必届时重新搭建。 */
const KNOWN_LEGACY_TRUE_CALL_SITES = Object.freeze([]);

/* LEGACY_TRUE_DOC_MENTIONS：第 8 步终态下应为空——graphemes.js 里 assertIdList 的
 * 文档注释与 id-list-legacy-string-rejected 错误消息均已改写，不再提及字面量
 * "legacy:true"（见 assertIdList 头注释与错误消息文案）。 */
const LEGACY_TRUE_DOC_MENTIONS = Object.freeze([]);

const LEGACY_TRUE_PATTERN = /\blegacy\s*:\s*true\b/;
/* KNOWN_CALL_SITE_COUNTS：KNOWN_LEGACY_TRUE_CALL_SITES 里带 count 的条目按 file 建
 * 索引供 scanForLegacyTrue 消耗（与 LEGACY_TRUE_DOC_MENTIONS 同一套按行数消耗的
 * 判据）。第 8 步终态下 KNOWN_LEGACY_TRUE_CALL_SITES 为空，这里自然也是空 Map。 */
const KNOWN_CALL_SITE_COUNTS = new Map(
  KNOWN_LEGACY_TRUE_CALL_SITES.filter(e => typeof e.count === 'number').map(e => [e.file, e.count])
);
function scanForLegacyTrue(files) {
  const docByFile = new Map(LEGACY_TRUE_DOC_MENTIONS.map(e => [e.file, e.count]));
  const hits = [];
  for (const rel of files) {
    if (rel.startsWith('tools/legacy/')) continue; // 归档目录，与 assertIdList 的历史 legacy 选项无关（同名巧合）
    const raw = fs.readFileSync(path.join(REPO, rel), 'utf8');
    // 一行可能同时命中"文档提及"与"已登记调用点"两类豁免——两个配额独立消耗，
    // 不共用同一个 remaining（一行只会被计数一次，但两个计数来源都可能覆盖它）。
    let docRemaining = docByFile.has(rel) ? docByFile.get(rel) : 0;
    let callSiteRemaining = KNOWN_CALL_SITE_COUNTS.has(rel) ? KNOWN_CALL_SITE_COUNTS.get(rel) : 0;
    raw.split('\n').forEach((lineText, idx) => {
      if (lineText.length > LONG_LINE_THRESHOLD) return; // 同 M1：跳过 base64 等超长行
      // M4：同 scanForLResidue，按整行出现次数逐个消耗/逐个记 hit——一行里第二个
      // `legacy:true` 不该被第一个消耗剩下的配额悄悄免检。
      const n = countMatches(LEGACY_TRUE_PATTERN, lineText);
      for (let k = 0; k < n; k++) {
        if (docRemaining > 0) { docRemaining--; continue; } // 消耗掉已登记的文档提及，不计入 hits
        if (callSiteRemaining > 0) { callSiteRemaining--; continue; } // 消耗掉 KNOWN_LEGACY_TRUE_CALL_SITES 登记的调用点
        hits.push({ file: rel, line: idx + 1 });
      }
    });
  }
  return hits;
}
{
  const files = listTrackedJsFiles().filter(f => f.startsWith('frontend/src/') || f.startsWith('tools/'));
  const hits = scanForLegacyTrue(files);
  assert.equal(hits.length, 0,
    `生产代码（frontend/src/ 与 tools/ 下非测试文件、非 tools/legacy/ 归档目录）中出现` +
    `未登记的 legacy:true（应为 0 处——生产代码里的每一处都必须先登记进 ` +
    `KNOWN_LEGACY_TRUE_CALL_SITES 并声明精确命中数），实际发现：\n` +
    hits.map(h => `  ${h.file}:${h.line}`).join('\n'));
  console.log(`PASS grapheme migration（M4 静态清单门槛）：生产代码 legacy:true 全部在 KNOWN_LEGACY_TRUE_CALL_SITES 登记范围内（${KNOWN_LEGACY_TRUE_CALL_SITES.length} 项，含 ${KNOWN_CALL_SITE_COUNTS.size} 个带精确计数的生产文件）`);
}
// 分辨力验证（改坏，内存构造，不落盘）：构造一段生产代码路径下、内嵌 legacy:true 的
// 坏源码文本，证明门槛真的会红。
{
  const fakeRel = 'frontend/src/__synthetic__/fake-consumer.js';
  const fakeSource = "assertIdList(box.META.rackG4, { legacy: true });"; // 第 8 步后这是一处误用（第二参数应是 sounds），仍应被本门槛按字面模式命中
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

// ============================================================================
// ⑤ M4 反例（外审 medium，2026-09-09）：同一行出现两次同一种写法，必须被算作两次
//    命中，不能被"这行命中过一次"悄悄合并成一次——这正是改前的漏洞：白名单 count
//    实际统计的是"命中的行数"，配额按行消耗，同一行第二次出现不会多算，可以绕过门槛。
//    两组反例都先用"零白名单额度"证明会各自报出 2 处 hits（不是 1 处），再用"额度恰好
//    为 1"证明会消耗 1 处、剩 1 处仍报出来（不是被 1 份配额一次性免掉整行）。
// ============================================================================
{
  const fakeRel = '__synthetic__/fake-two-per-line.js';
  const fakeSource = "const a = SOUNDS[x].L, b = SOUNDS[y].L;"; // 同一行两处 .L（dot-access 模式）
  const originalReadFileSync = fs.readFileSync;
  fs.readFileSync = function (p, enc) {
    if (String(p).replace(/\\/g, '/').endsWith(fakeRel)) return fakeSource;
    return originalReadFileSync(p, enc);
  };
  try {
    const hitsNoWhitelist = scanForLResidue([fakeRel], SEVEN_PATTERNS, []);
    const dotAccessHits = hitsNoWhitelist.filter(h => h.patternId === 'dot-access');
    assert.equal(dotAccessHits.length, 2,
      'M4 反例：同一行两处 .L，零白名单额度时应报 2 处 hits（改前的行级判据只会报 1 处，第二处被同一行"已经命中过"悄悄吞掉）');

    const hitsWithOneQuota = scanForLResidue([fakeRel], SEVEN_PATTERNS,
      [{ file: fakeRel, patternId: 'dot-access', count: 1, reason: 'M4 反例：只声明 1 处配额，验证第二处仍会被抓' }]);
    const dotAccessHitsWithQuota = hitsWithOneQuota.filter(h => h.patternId === 'dot-access');
    assert.equal(dotAccessHitsWithQuota.length, 1,
      'M4 反例：白名单声明 1 处配额时，应消耗掉第一处、仍报出第二处（不是 1 份配额把整行两处一起免检）');
  } finally {
    fs.readFileSync = originalReadFileSync;
  }
  console.log('PASS grapheme migration（M4 反例①，内存构造，不落盘）：scanForLResidue 对同一行两处 .L 精确计数为 2，白名单按处消耗不按行消耗');
}
{
  const fakeRel = 'frontend/src/__synthetic__/fake-two-legacy-per-line.js';
  const fakeSource = "const a = assertIdList(x, { legacy: true }), b = assertIdList(y, { legacy: true });"; // 同一行两处 legacy:true
  const originalReadFileSync = fs.readFileSync;
  fs.readFileSync = function (p, enc) {
    if (String(p).replace(/\\/g, '/').endsWith(fakeRel)) return fakeSource;
    return originalReadFileSync(p, enc);
  };
  let hits;
  try {
    hits = scanForLegacyTrue([fakeRel]); // fakeRel 未登记进 KNOWN_LEGACY_TRUE_CALL_SITES，零配额
  } finally {
    fs.readFileSync = originalReadFileSync;
  }
  assert.equal(hits.length, 2,
    'M4 反例：同一行两处 legacy:true，未登记调用点时应报 2 处 hits（改前的行级判据只会报 1 处）');
  console.log('PASS grapheme migration（M4 反例②，内存构造，不落盘）：scanForLegacyTrue 对同一行两处 legacy:true 精确计数为 2');
}

// ============================================================================
// M5（里程碑 2 第 8 步，2026-09-10）：load_data.js「HTML 反解析」入口拒绝旧格式
// （方案 §3.8 + §4 第 8 行验收：「HTML 反解析与数据层 JS 两条入口各有一条"拒绝
// 旧格式"失败测试」——本节是前者，后者见 tests/unit/test_graphemes.js 里
// assertIdList 对字符串输入的拒绝测试）。
//
// load_data.js 曾在 html=true 且找不到内联 `const META = {...};` 声明时，用正则从
// 旧版 HTML 结构里重建 rackG4/rackG5/wallLetters——重建出的是**字符串**，字位 ID
// 含多字母时（如 'ai'）会被拆成单字符，wallLetters 缺 wall 正则命中时甚至退化成
// `Object.keys(FIRST_TEACH_DAY).join('')`，产出不可反解析的拼接串（'ai'+'j' -> 'aij'）
// ——这正是里程碑 2 要消灭的旧形态。第 8 步已删除这条兜底，改为固定错误码拒绝。
// ============================================================================
{
  const { loadData } = require('../../tools/validation/load_data');

  // 反例①：完全没有 META、也没有任何旧版 HTML 结构痕迹的最小 HTML——应拒绝。
  {
    const minimalHtml = '<!doctype html><html><body>no META, no legacy markers</body></html>';
    let caught = null;
    try { loadData(minimalHtml, true); } catch (e) { caught = e; }
    assert(caught, 'loadData：缺内联 META 的 HTML（无任何旧版结构痕迹）应抛错，实际未抛');
    assert.equal(caught.code, 'legacy-html-fallback-rejected', 'loadData：缺内联 META 时错误码应为 legacy-html-fallback-rejected');
  }

  // 反例②：更贴近真实历史场景——带着旧版 RACK_LETTERS/wall 正则能命中的结构，但仍然
  // 没有内联 META。第 8 步前的实现会"成功"从这些片段重建出字符串 META；第 8 步后
  // 必须同样拒绝，不能因为"旧结构齐全"就悄悄放行——证明删除的是整条兜底，不是只删了
  // 触发条件的一部分。
  {
    const legacyStyleHtml = [
      '<html><body>',
      "const KEY = 'soundblocks-w1-v1';",
      "const RACK_LETTERS = 'satipn'.split('');",
      "const RACK_LETTERS = 'satipn'.split('');",
      "${'satipn'.split('').map(c=>{",
      '</body></html>'
    ].join('\n');
    let caught = null;
    try { loadData(legacyStyleHtml, true); } catch (e) { caught = e; }
    assert(caught, 'loadData：旧版 RACK_LETTERS/wall 正则片段齐全但缺内联 META 时应抛错，实际未抛（说明兜底重建仍在悄悄生效）');
    assert.equal(caught.code, 'legacy-html-fallback-rejected', 'loadData：旧结构齐全但缺内联 META 时错误码仍应为 legacy-html-fallback-rejected（不因旧结构齐全就放行）');
  }

  // 正例：真实现役产物（build/week01.html）都内联了 META，不应受影响——方案 §3.8：
  // 「四周现有产物都内联了 META，拒绝不影响任何现役路径」。
  {
    const week01Path = path.join(REPO, 'build', 'week01.html');
    assert(fs.existsSync(week01Path),
      `loadData M5 正例依赖 ${week01Path} 存在（先跑一次构建）——找不到该文件说明构建产物缺失，这本身就是需要暴露的问题，不应静默跳过`);
    const realRaw = fs.readFileSync(week01Path, 'utf8');
    const box = loadData(realRaw, true);
    assert(box.META && typeof box.META.week === 'number',
      'loadData：真实 build/week01.html（内联 META）应正常加载，不受第 8 步拒绝旧格式的影响');
  }

  // html=false（数据层 JS 入口）路径不受这条拒绝逻辑影响：兜底分支本就以 `&& html`
  // 为条件，html=false 时从不触发，缺 META 时 box.META 就是 undefined，交给调用方
  // 自己的守卫处理（不是本节要测的"HTML 反解析"场景，这里只confirm 边界没被误伤）。
  {
    const noMetaDataLayer = "const SOUNDS = { s: {grapheme:'s', type:'c'} };";
    const box2 = loadData(noMetaDataLayer, false);
    assert.equal(box2.META, undefined, 'loadData(raw, false)：数据层 JS 入口缺 META 时不触发 HTML 兜底拒绝，box.META 保持 undefined（交给调用方守卫，不是本节的拒绝对象）');
  }

  console.log('PASS grapheme migration（M5：load_data HTML 反解析拒绝旧格式，方案 §3.8）：缺内联 META 的 HTML（含/不含旧结构痕迹）均报 legacy-html-fallback-rejected；真实现役产物与 html=false 数据层入口均不受影响');
}

// ============================================================================
// B-M1（外审 medium，2026-09-10）：load_data.js 固定错误码可能被更早的 VM 异常截断。
//
// 改前 legacy-html-fallback-rejected 只在 vm.runInNewContext 执行完全部提取出的
// 声明、且事后发现 box.META 仍是 undefined 时才抛——真实旧 HTML 若声明重复/语法
// 不兼容/引用缺失，调用方会先收到 vm 执行阶段抛出的原生 SyntaxError/ReferenceError，
// 与契约（缺内联 META 时给出固定错误码）不符。改法：在执行任何提取出的声明之前，
// 先用与 declaration() 内部同一条正则（^const META = ，见 load_data.js 的
// META_DECLARATION_RE）探测 HTML 是否含内联 META，缺失立即抛错，不进入 vm。
//
// 真实旧产物 fixture 的调查过程（如实记录，供复核）：
//   1. 按方案指引 `git worktree add <临时目录> 226e619` 后在该工作树里
//      `python tools/project.py build`——**构建成功**，产出的 build/week01.html
//      是真实的历史生产 HTML（迁移前形态：META.wallLetters 是字符串 "satipn"、
//      SOUNDS 条目用 L 字段而不是 grapheme、RESERVED 里还有后来被 P8 换掉的
//      "spit"）。
//   2. 但这份真实历史产物**仍然内联了 META**——tools/validation/load_data.js
//      自诞生（git log --follow 显示它随 82fecc9「完善课程可靠性与第四周，重构
//      工程目录和回归流程」一起引入）起，本仓库的构建产物就从未缺过内联 META；
//      `git ls-tree -r 82fecc9^` 也确认 82fecc9 之前根本没有任何被版本控制的
//      week01 HTML（只有截图）。也就是说，"真实旧生产 HTML 缺内联 META"这个
//      场景，在本仓库整个提交历史里从未真实存在过——它是 load_data.js 注释里
//      "旧版 HTML 结构"的假设性描述（对应更早、从未进版本库的手工原型），不是
//      能从 git 历史直接抽取的真实产物。
//   3. 因此按方案「若旧提交构建不了，退而合成并在测试里注明合成非真实产物」的
//      预案（这里不是"构建不了"，而是"构建出的真实产物不含缺 META 场景"，
//      视为同一类情况的变体，同样落到"合成"分支）：以 226e619 真实构建产物为
//      **基底**（不是凭空手写），只做两处最小外科手术式修改：
//        a) 用 declaration() 定位并整体删除真实的 `const META = {...};` 块
//           （模拟"这份历史产物没有内联 META"这一假设场景）；
//        b) 在删除 META 后，找到仍然存在的真实 `const SOUNDS = {...};` 块，往
//           它内部插入一个语法不兼容的 token（`@@SYNTAX-ERROR@@`），模拟方案
//           点名的"语法不兼容"这一类真实旧 HTML 故障——证明"即使其他声明本身
//           语法有问题，缺 META 这一判定必须在到达那些声明之前就生效"。
//      两个 fixture 文件都在 tests/fixtures/ 下（长的 base64 音频/图片数据 URI
//      已用固定占位串替换，只保留判定逻辑需要的结构，体积从原始 2.9MB 降到
//      ~300KB，不改变任何一处顶层声明的边界与语义）：
//        - week01-html-226e619-real-legacy-stripped.html：未经修改的真实历史
//          产物（仅做上述体积裁剪），META 完好，用作"真实旧格式产物应正常
//          加载"的回归正例。
//        - week01-html-226e619-legacy-no-meta-corrupted.html：上面基础上再做
//          a)/b) 两处手术式修改的合成 fixture，明确标注非真实产物，专门复现
//          "缺 META + 其他声明语法不兼容"这一具体故障组合。
// ============================================================================
{
  const { loadData } = require('../../tools/validation/load_data');

  const realLegacyPath = path.join(REPO, 'tests', 'fixtures', 'week01-html-226e619-real-legacy-stripped.html');
  assert(fs.existsSync(realLegacyPath), `B-M1 真实旧产物 fixture 应存在：${realLegacyPath}`);
  const realLegacyRaw = fs.readFileSync(realLegacyPath, 'utf8');

  // 正例：真实历史产物（226e619，迁移前形态）内联了 META（老格式：字符串
  // wallLetters、L 字段），应能被现在的 loadData 正常加载，不触发拒绝逻辑。
  {
    const box = loadData(realLegacyRaw, true);
    assert.equal(box.META && box.META.week, 1, 'B-M1：真实历史产物（226e619）应能正常加载出 META.week===1');
    assert.equal(box.META.wallLetters, 'satipn', 'B-M1：真实历史产物应保留其历史形态（wallLetters 是字符串，不是数组）——这份 fixture 忠实反映迁移前的真实数据，不应被本次改动篡改');
    assert.equal(box.SOUNDS.s.L, 's', 'B-M1：真实历史产物的 SOUNDS 条目应仍是旧的 L 字段（未经过 4a 步收敛），confirm fixture 确实是真实的迁移前产物而不是已经处理过的现代数据');
  }

  // 核心用例：缺 META + SOUNDS 声明语法不兼容（合成 fixture，基于上面真实产物做
  // 最小手术式修改，见上方头注释）。改前的顺序（先执行提取出的声明、事后才检查
  // box.META）会让这份输入先在 vm.runInNewContext 阶段抛出原生 SyntaxError，
  // 调用方拿到的 e.code 是 undefined、e 是 SyntaxError 实例，不是契约承诺的
  // legacy-html-fallback-rejected；改后应在进入 vm 之前就被前置探测拦下。
  {
    const corruptedPath = path.join(REPO, 'tests', 'fixtures', 'week01-html-226e619-legacy-no-meta-corrupted.html');
    assert(fs.existsSync(corruptedPath), `B-M1 合成 fixture 应存在：${corruptedPath}`);
    const corruptedRaw = fs.readFileSync(corruptedPath, 'utf8');
    // 先确认这份 fixture 真的不含内联 META（否则下面的断言就失去意义）。
    assert(!/^const META = /m.test(corruptedRaw), 'B-M1：合成 fixture 应确实不含内联 META 声明，检查 fixture 是否被误改');
    // 再确认它确实含有语法不兼容的 token（否则测不出"即使其他声明有语法问题，
    // 缺 META 判定必须先生效"这一点，退化成只测"缺 META"这个已经被 M5 覆盖过的
    // 更简单场景）。
    assert(corruptedRaw.includes('@@SYNTAX-ERROR@@'), 'B-M1：合成 fixture 应含有意注入的语法不兼容 token，检查 fixture 是否被误改');

    let caught = null;
    try { loadData(corruptedRaw, true); } catch (e) { caught = e; }
    assert(caught, 'B-M1：缺 META 且其他声明语法不兼容的真实历史产物（合成变体）应该抛错，实际未抛');
    assert.equal(caught.code, 'legacy-html-fallback-rejected',
      `B-M1：即使 SOUNDS 声明本身含语法不兼容的 token，错误码也应该是 legacy-html-fallback-rejected` +
      `（在进入 vm.runInNewContext 之前就应该因为缺 META 被拦下），不应该是未包装的 vm 原生异常` +
      `（实际 code=${caught.code}，构造函数=${caught.constructor && caught.constructor.name}）`);
  }

  console.log('PASS grapheme migration（B-M1：load_data 固定错误码不再被更早的 VM 异常截断，方案 §3.8）：真实历史产物（226e619，未改动）内联 META 时正常加载；缺 META + 其他声明语法不兼容的合成变体（基于同一份真实产物做最小手术式修改）在进入 vm 之前就被前置探测拦下，抛出固定的 legacy-html-fallback-rejected，不是未包装的原生 SyntaxError');
}

// ============================================================================
// M2（外审 medium，2026-09-10）：load_data.js 的 META_DECLARATION_RE 改前只认
// 行首字面量 "const META = "（零缩进、等号两侧各恰一个空格），把"有没有一处内联
// META 声明"这件事判得比它该有的宽容度更严——缩进、`const META=`（等号不带空格）、
// `const META =\n{`（等号后换行）都是合法 JS，也都表达"这里有一个 META 声明"，
// 不该被判定成"缺 META"。改法：
//   - META_DECLARATION_RE 放宽为 `const\s+META\s*=`（配合 [ \t]* 容纳缩进）；
//   - declaration() 同步放宽（否则探测说"找到了"，但真正截取声明体的 declaration()
//     还是按老的严格正则找不到，box.META 最终仍是 undefined，等于探测的放宽只是
//     好看不管用）；
//   - 探测限定到 <script> 内容再执行（extractScriptContents），避免 HTML 正文里
//     偶然出现的字面量 "const META = {...}"（比如页面自己展示一段代码示例）被
//     误判成"找到了内联 META"。
// 四类测试：缩进、无空格等号、换行等号、正文伪声明（应判"缺 META"不误命中）。
//
// ⚠️ L-5 修复（预筛 low，第四轮，2026-09-11，仅补记现状，不改断言）：本节写于
// AST 迁移（里程碑 2 段 4 U1）之前，当时 META_DECLARATION_RE/extractScriptContents
// 确实是 load_data.js 生产读取路径的一部分。AST 迁移后，生产探测已改走
// tools/validation/load_data.js 的 hasInlineMeta（AST 语义，见其头注释），
// META_DECLARATION_RE 与 extractScriptContents 现在是**只为本节测试而活的历史
// 保留导出**（该文件里两处定义都已标注"测试专用 / 历史保留"）——下面 M2a-M2d 四条
// 测试的 `META_DECLARATION_RE.test(extractScriptContents(html))` 断言测的是这份
// 历史保留正则自身的判定口径，不代表 loadData()/hasInlineMeta 现在的真实探测行为
// （两者判定逻辑不保证同步，M2 本身"探测限定到 <script> 内容"这条也早已被 AST 天然
// 满足，不再是这条正则要单独承担的职责）。断言与 fixture 均不改——它们仍然是这份
// 正则本身的有效回归——只更正下面 PASS 文案与本段描述，避免读者把它误当生产路径。
// ============================================================================
{
  const { loadData, META_DECLARATION_RE, extractScriptContents } = require('../../tools/validation/load_data');

  const wrapInScript = body => `<!doctype html><html><body>\n<script>\n${body}\n</script>\n</body></html>`;

  // 反例①（正例，改前会被误判成"缺 META"）：缩进的 META 声明。
  {
    const html = wrapInScript('  const META = {"week":1};\nconst RESERVED=["a","b","c"];');
    assert(META_DECLARATION_RE.test(extractScriptContents(html)),
      'M2：缩进的 "const META = " 声明应被探测为存在，不应判定"缺 META"');
    const box = loadData(html, true);
    assert.equal(box.META && box.META.week, 1, 'M2：缩进的 META 声明应能被完整加载出 META.week===1（declaration() 同步放宽后端到端可用）');
  }

  // 反例②：等号两侧没有空格（`const META={`）。
  {
    const html = wrapInScript('const META={"week":2};\nconst RESERVED=["a","b","c"];');
    assert(META_DECLARATION_RE.test(extractScriptContents(html)),
      'M2：无空格等号的 "const META={" 声明应被探测为存在');
    const box = loadData(html, true);
    assert.equal(box.META && box.META.week, 2, 'M2：无空格等号的 META 声明应能被完整加载出 META.week===2');
  }

  // 反例③：等号后换行（`const META =\n{`，闭合括号独占一行——与真实周数据文件的
  // 常见换行风格一致，declaration() 靠"闭合括号独占一行"识别多行声明的收尾）。
  {
    const html = wrapInScript('const META =\n{\n  "week": 3\n};\nconst RESERVED=["a","b","c"];');
    assert(META_DECLARATION_RE.test(extractScriptContents(html)),
      'M2：等号后换行的 META 声明应被探测为存在');
    const box = loadData(html, true);
    assert.equal(box.META && box.META.week, 3, 'M2：等号后换行的 META 声明应能被完整加载出 META.week===3');
  }

  // 反例④：正文伪声明——字面量 "const META = {...}" 出现在 <script> 之外（比如页面
  // 展示一段代码示例），不应被误判成"找到了内联 META"；这份 HTML 真正的 <script>
  // 里没有任何 META 声明，应该正确判定"缺 META"并拒绝。
  {
    const html = '<!doctype html><html><body><pre>示例代码：const META = {"week":1};</pre>' +
      '<script>const RESERVED=["a","b","c"];</script></body></html>';
    assert(!META_DECLARATION_RE.test(extractScriptContents(html)),
      'M2：正文（<script> 之外）里的字面量 "const META = " 不应被探测为存在');
    let caught = null;
    try { loadData(html, true); } catch (e) { caught = e; }
    assert(caught, 'M2：正文伪声明、<script> 内确实没有 META 时应该抛错');
    assert.equal(caught.code, 'legacy-html-fallback-rejected',
      `M2：正文伪声明不应让探测误判为"找到了"，应正常判定为缺 META 并拒绝，实际 code=${caught.code}`);
  }

  console.log('PASS grapheme migration（M2：⚠️ 测试专用/历史保留的 META_DECLARATION_RE 放宽缩进/等号空白形态，并限定到 <script> 内容，方案 §3.8——AST 迁移后生产探测已改走 load_data.js 的 hasInlineMeta，本节测的是这份历史保留正则自身，不代表生产行为，见 L-5/第四轮 注记）：缩进/无空格等号/等号后换行三类合法声明均能正确探测且端到端加载成功；<script> 之外的正文伪声明不被误判，仍正确判定缺 META');
}

// ============================================================================
// M1（轮 D 复审，外审 medium，2026-09-10）：M2 只把"探测"（META_DECLARATION_RE
// 那一次 .test()）限定到了 <script> 内容，真正"抽取"声明体的 declaration(raw, n)
// 改前一直传整份 raw——HTML 正文若在行首恰好出现字面量声明（比如展示代码示例），
// declaration() 会在整份文档里匹配到第一个出现的声明，可能是正文里的伪声明，
// 不是 <script> 里那份真实数据。测试：正文以换行开头且行首有伪声明（RESERVED），
// <script> 内另有一份真实合法声明——加载出来的应该是 <script> 内那份，不是正文
// 那份伪声明。
// ============================================================================
{
  const { loadData, extractScriptContents } = require('../../tools/validation/load_data');

  const fakeReserved = "\nconst RESERVED = ['fake','leaked','from','body','oops'];\n";
  const realScriptBody = [
    "const META = {\"week\":1};",
    "const RESERVED = ['ram','hem','rid','dam','kid'];",
    "const SOUNDS = {};",
    "const W = {};",
    "const WALL_HINT = {};",
    "const BOOK = {pages:[]};",
    "const FIRST_TEACH_DAY = {};",
    "const G1_ROUNDS = {};",
    "const G1_THEME = {};",
    "const G3_PAIRS = [];",
    "const G4_WORDS = [];",
    "const G5_WHITELIST = [];",
    "const DAYS = [];"
  ].join('\n');
  const html = `<!doctype html><html><body>${fakeReserved}<script>\n${realScriptBody}\n</script></body></html>`;

  // 先确认这份合成 HTML 真的复现了"正文行首有伪声明、且它在整份文档里排在
  // <script> 之前"这个前提条件——不确认这一点，下面即使测试通过也可能只是没有
  // 真正构造出会触发旧 bug 的场景。
  //
  // 段 4 U1（2026-09-11，AST 迁移）附带改变：declaration() 改前是纯文本正则，对
  // 整份 raw 直接 .exec()，完全不知道"这段文字是不是在 <script> 标签里"——这正是
  // M1 这个 bug 的根源（会命中正文里排在前面的伪声明）。AST 版本的 declaration()
  // 先尝试把 raw 整份当一份脚本解析，失败（真实 HTML 文档必然失败，`<!doctype`
  // 不是合法 JS）后才退回按 <script> 标签逐个提取、逐个尝试——这个退回路径天然
  // 只看 <script> 标签内部，不会再命中 <script> 之外的正文伪声明。也就是说，
  // declaration() 本身现在直接对整份 raw HTML 调用也不会再被这个 bug 场景"骗到"，
  // 不再需要靠 loadData() 内部另外限定搜索范围来规避——下面这条断言从"确认 declaration()
  // 复现旧行为"改成"确认 declaration() 已经不会被正文伪声明劫持"，用同一份合成
  // HTML 验证的是同一件事的两个阶段（AST 迁移前/后）。
  const { declaration } = require('../../tools/validation/load_data');
  assert(declaration(html, 'RESERVED').includes('ram') && !declaration(html, 'RESERVED').includes('fake'),
    'M1（AST 迁移后）：直接对整份 raw HTML 调用 declaration() 应该正确跳过正文伪声明，命中 <script> 内的真实声明，不应该像改前的纯文本正则那样被正文伪声明劫持');
  assert(declaration(extractScriptContents(html), 'RESERVED').includes('ram'),
    'M1 前提：对 extractScriptContents(html) 调用 declaration() 应该命中 <script> 内的真实声明');

  const box = loadData(html, true);
  // box.RESERVED 是在 loadData 内部 vm.runInNewContext 的独立上下文里构造出的数组
  // ——跨 realm 的数组字面量与当前 realm 的 Array 原型链不是同一个对象，
  // assert/strict 的 deepStrictEqual 会因为"结构相同但不是同一原型链"判不相等
  // （"same structure but are not reference-equal"），不是本条断言真正关心的差异；
  // 用 [...box.RESERVED] 把内容搬回当前 realm 的普通数组再比较。
  assert.deepEqual([...box.RESERVED], ['ram', 'hem', 'rid', 'dam', 'kid'],
    `M1：loadData 应该取 <script> 内的真实 RESERVED 声明，不应该被正文里排在它之前的伪声明"劫持"，实际：${JSON.stringify(box.RESERVED)}`);
  assert.equal(box.META && box.META.week, 1, 'M1：META 仍应正确加载（探测本身在 M2 已经限定到 script，未受影响）');

  console.log('PASS grapheme migration（M1：load_data 的抽取阶段同步限定到 <script> 内容）：正文行首伪声明排在 <script> 之前时，loadData 取到的仍是 <script> 内的真实声明，不会被正文伪声明劫持');
}

// ============================================================================
// M2（轮 D 复审，外审 medium，2026-09-10）：extractScriptContents 的正则改前没有
// `i` 标志——`<SCRIPT>`/`<Script>` 这类大小写混排的标签名会被漏收，等价于"这份
// HTML 里没有 script"，导致探测/抽取都拿到空字符串。测试：全大写 `<SCRIPT>` 与
// 首字母大写 `<Script>` 两种写法均应被正确识别并提取出内容；同时用一份 ID 含引号
// 的最小场景注释说明当前范围（不含 `>` 属性值的标签才在支持范围内，见函数头注释）。
// ============================================================================
{
  const { loadData, extractScriptContents } = require('../../tools/validation/load_data');

  const upper = '<!doctype html><html><body><SCRIPT>\nconst META={"week":9};\n</SCRIPT></body></html>';
  assert.equal(extractScriptContents(upper).trim(), 'const META={"week":9};',
    'M2：全大写 <SCRIPT>...</SCRIPT> 应被正确提取内容');
  assert.equal(loadData(upper, true).META.week, 9, 'M2：全大写 <SCRIPT> 标签应能端到端加载出 META.week===9');

  const mixed = '<!doctype html><html><body><Script>\nconst META={"week":10};\n</Script></body></html>';
  assert.equal(extractScriptContents(mixed).trim(), 'const META={"week":10};',
    'M2：混合大小写 <Script>...</Script> 应被正确提取内容');
  assert.equal(loadData(mixed, true).META.week, 10, 'M2：混合大小写 <Script> 标签应能端到端加载出 META.week===10');

  console.log('PASS grapheme migration（M2：extractScriptContents 正则加 i 标志）：<SCRIPT>/<Script> 大小写混排标签均能被正确识别并提取内容，端到端加载正常');
}

// ============================================================================
// L2（轮 D 复审第三轮，外审 low，2026-09-10）：extractScriptContents 把多个
// <script> 标签的内容拼接成一份文本，declaration() 在拼接后的文本上只取第一次
// 匹配——如果前置 <script>（与课程数据无关的普通脚本）里恰好在行首出现一句
// `const RESERVED = [...]`（伪声明，同名巧合），会抢先于后置 <script> 里真正的
// 课程数据声明被匹配到。测试：前置 script 含伪 RESERVED、后置 script 含真实完整
// 声明集合——loadData 应该显式拒绝（duplicate-declaration），不悄悄选中伪声明。
// ============================================================================
{
  const { loadData, collectScriptEntries, findAllTopLevelDeclarations } = require('../../tools/validation/load_data');

  const fakeScript = "<script>\nconst RESERVED = ['fake','from','leading','script'];\n</script>";
  const realScriptBody = [
    "const META = {\"week\":1};",
    "const RESERVED = ['ram','hem','rid','dam','kid'];",
    "const SOUNDS = {};",
    "const W = {};",
    "const WALL_HINT = {};",
    "const BOOK = {pages:[]};",
    "const FIRST_TEACH_DAY = {};",
    "const G1_ROUNDS = {};",
    "const G1_THEME = {};",
    "const G3_PAIRS = [];",
    "const G4_WORDS = [];",
    "const G5_WHITELIST = [];",
    "const DAYS = [];"
  ].join('\n');
  const html = `<!doctype html><html><body>${fakeScript}\n<script>\n${realScriptBody}\n</script></body></html>`;

  // 前提检查：确认这份合成 HTML 真的有两个独立 <script>，各自顶层声明了一次
  // RESERVED（不是只有一次、没有真正复现"前置伪声明"这个场景）。
  //
  // 段 4 U1（2026-09-11，AST 迁移）：改前用 extractScriptContents 把两个 <script>
  // 拼接成一份文本再数——这里改用 collectScriptEntries + findAllTopLevelDeclarations
  // 直接验证新架构本身的产出（两个 script 分别解析，不拼接，见 load_data.js 顶部
  // 架构说明）：Map 里 RESERVED 应该有 2 条记录，scriptIndex 分别是 0（伪声明）和
  // 1（真实声明）——这也顺带验证了"不拼接"这个设计决定本身没有破坏"发现两次声明"
  // 这件事（拼接是会制造虚假冲突的老问题，不是保留跨 script 计数能力的必要条件）。
  //
  // 收口 A（2026-09-11）：这份合成 HTML 里两个 <script> 都没有被静默跳过，标签
  // 原始序号与"过滤后数组下标"这两种口径在这个 fixture 里恰好重合（都是 0、1），
  // 不足以证明口径统一本身——分辨力更强的用例见 tests/unit/test_load_data_ast.js
  // 「10」（第 0 个标签被静默跳过时两种口径才会给出不同的数字）；这里只是顺带把
  // scriptIndex 的值也断言上，不再只断言条数。
  const entries = collectScriptEntries(html, true);
  assert.equal(entries.length, 2, 'L2 前提：合成 HTML 应该有 2 个 <script> 标签（前置伪声明 + 后置真实声明），检查合成文本是否已变');
  const decls = findAllTopLevelDeclarations(entries);
  const reservedOcc = decls.get('RESERVED') || [];
  assert.equal(reservedOcc.length, 2,
    'L2 前提：两个 <script> 应该各自独立顶层声明了一次 RESERVED，Map 里应累计 2 条记录');
  assert.deepEqual(reservedOcc.map(o => o.scriptIndex), [0, 1],
    `L2：两条 RESERVED 记录的 scriptIndex 应分别是 0（前置伪声明所在标签）和 1（后置真实声明所在标签），实际：${JSON.stringify(reservedOcc.map(o => o.scriptIndex))}`);

  let caught = null;
  try { loadData(html, true); } catch (e) { caught = e; }
  assert(caught, 'L2：前置 script 含伪 RESERVED、后置 script 含真实 RESERVED 时，loadData 应该抛错，不应该悄悄选中前置的伪声明');
  assert.equal(caught.code, 'duplicate-declaration', `L2：错误码应为 duplicate-declaration，实际：${caught.code}`);
  assert.equal(caught.declarationName, 'RESERVED', `L2：错误应点名具体是哪个常量重复声明（RESERVED），实际：${caught.declarationName}`);
  assert.equal(caught.count, 2, `L2：错误应带上实际重复次数（2），实际：${caught.count}`);

  console.log('PASS grapheme migration（L2：多 script 前置伪声明检测）：前置 script 的伪 RESERVED 声明与后置 script 的真实声明重名时，loadData 显式拒绝（duplicate-declaration），不悄悄选中前置的伪声明');
}

// ============================================================================
// I-M2（段 3 第九批，外审 medium，2026-09-10；段 4 U1 追加 H1 根治，2026-09-11）：
// countDeclarationOccurrences 改前按"行首 + 可选缩进"匹配 `const NAME = `，不看
// 这一行嵌套在多深的括号里——某个辅助函数体内部若手滑写了一个同名局部 const（哪怕
// 缩进再深也满足"行首"这条判据），会被误计成"又一次顶层声明"，触发不该触发的
// duplicate-declaration 拒绝。段 3 第九批改用 maskStringsAndComments + bracketDepthAt
// 只数括号深度为 0（真正 Program 顶层）的匹配，但只修了"计数"，没有同步检查
// "抽取"——declaration() 仍是纯文本第一次匹配，不看深度。
//
// H1（轮 J 外审 high，2026-09-10）：这份合成 HTML 里局部 shadow 声明的**文本**恰好
// 排在真实顶层声明*之前*（辅助函数写在文件开头），这正是会触发 H1 的顺序——计数
// （深度感知）说"只有 1 个顶层声明"（判断正确），但抽取（纯文本第一次匹配）却会
// 选中排在前面的局部 shadow 声明，不是后面真正的顶层声明。改前这里只断言
// "loadData 不抛错"，没有断言 loadData 返回的值到底是哪一份——"不抛错"和"值是对的"
// 是两件事，前者成立不代表后者成立，这个 bug 曾经被这条只测前者的断言放行。段 4
// U1 补上返回值断言，同时把发现/抽取机制换成 AST（js_ast.js）——AST 从结构上就
// 不可能把嵌套在函数体内的局部声明当成顶层声明，H1 描述的"计数与抽取用不同判据、
// 可能互相矛盾"这条根因不复存在（两者现在共用同一个 Map，见 load_data.js
// findAllTopLevelDeclarations 头注释）。
// ============================================================================
{
  const { loadData, collectScriptEntries, findAllTopLevelDeclarations } = require('../../tools/validation/load_data');

  const scriptBody = [
    "function helperWithLocalShadow() {",
    "  // 辅助函数内部的局部同名 const，与顶层 RESERVED 声明无关，不应被计成顶层声明",
    "  const RESERVED = ['local', 'shadow', 'not', 'top', 'level'];",
    "  return RESERVED;",
    "}",
    "const META = {\"week\":1};",
    "const RESERVED = ['ram','hem','rid','dam','kid'];",
    "const SOUNDS = {};",
    "const W = {};",
    "const WALL_HINT = {};",
    "const BOOK = {pages:[]};",
    "const FIRST_TEACH_DAY = {};",
    "const G1_ROUNDS = {};",
    "const G1_THEME = {};",
    "const G3_PAIRS = [];",
    "const G4_WORDS = [];",
    "const G5_WHITELIST = [];",
    "const DAYS = [];"
  ].join('\n');
  const html = `<!doctype html><html><body><script>\n${scriptBody}\n</script></body></html>`;

  // 前提检查：AST 视角下，这个 <script> 顶层只声明了 1 次 RESERVED（局部 shadow
  // 嵌套在 helperWithLocalShadow 函数体内部，不在 ast.body 顶层，天然不计入）。
  const entries = collectScriptEntries(html, true);
  const decls = findAllTopLevelDeclarations(entries);
  const reservedOcc = decls.get('RESERVED') || [];
  assert.equal(reservedOcc.length, 1,
    'I-M2 前提：辅助函数内部的局部同名 const 不应被 AST 视为顶层声明，Map 里 RESERVED 应仍只有 1 条记录');
  // 收口 A（2026-09-11）：这份合成 HTML 只有 1 个 <script> 标签，顺带断言其
  // scriptIndex 就是这唯一标签的原始序号 0。
  assert.equal(reservedOcc[0].scriptIndex, 0,
    `I-M2：唯一一条 RESERVED 记录的 scriptIndex 应为 0（文档里唯一的 <script> 标签），实际：${reservedOcc[0].scriptIndex}`);

  let caught = null;
  let box = null;
  try { box = loadData(html, true); } catch (e) { caught = e; }
  assert.equal(caught, null, `I-M2：辅助函数内部的局部同名 const 不应触发 duplicate-declaration 拒绝，实际抛错：${caught && caught.message}`);
  // H1 核心断言（改前只测"不抛错"，漏掉了这一步）：返回值必须是真实顶层声明的值，
  // 不能是排在文本前面的局部 shadow 值——[...box.RESERVED] 见 M1 节头注释，box.RESERVED
  // 是 vm 独立 realm 里的数组，deepStrictEqual 需要先搬回当前 realm 的普通数组再比较。
  // L-2 修复（2026-09-11）：改前紧跟着一条 `assert.notDeepEqual(..., ['local',
  // 'shadow', ...])`——只要上面这条 deepEqual（真实值 ['ram','hem',...]）已经通过，
  // 这条 notDeepEqual 必然也通过（两个字面量本身就不相等），是恒真式，删掉，把
  // "不应是 shadow 值"的意思并进 deepEqual 自己的断言消息里。
  assert.deepEqual([...box.RESERVED], ['ram', 'hem', 'rid', 'dam', 'kid'],
    `I-M2/H1：loadData(...).RESERVED 应该等于真实顶层声明的值 ['ram','hem','rid','dam','kid']，` +
    `不应该被排在文本前面的局部 shadow 声明"劫持"（不应等于 ['local','shadow','not','top','level']），` +
    `实际：${JSON.stringify(box.RESERVED)}`);

  console.log('PASS grapheme migration（I-M2/H1：辅助函数内部局部同名 const 不触发重复、且不劫持抽取结果）：AST 只把 ast.body 顶层的声明视为顶层声明，计数与抽取共用同一份 Map，loadData 返回真实顶层值');
}

// ============================================================================
// H1 补充用例（段 4 U1，2026-09-11）：上面的 I-M2 场景里局部 shadow 声明的文本恰好
// 排在真实顶层声明*之前*——这是轮 J 外审点名的触发顺序，但为了不遗漏"顺序反过来"
// 是否也正确，这里再构造一份真实顶层声明在前、局部 shadow 声明（在另一个辅助函数
// 体内部）在后的版本，断言同样能正确抽取到真实顶层值。两个方向都覆盖，不依赖
// 文本顺序——这正是 AST 语义（只看 ast.body，不看文本先后）该有的性质。
// ============================================================================
{
  const { loadData } = require('../../tools/validation/load_data');

  const scriptBody = [
    "const META = {\"week\":1};",
    "const RESERVED = ['ram','hem','rid','dam','kid'];",
    "const SOUNDS = {};",
    "const W = {};",
    "const WALL_HINT = {};",
    "const BOOK = {pages:[]};",
    "const FIRST_TEACH_DAY = {};",
    "const G1_ROUNDS = {};",
    "const G1_THEME = {};",
    "const G3_PAIRS = [];",
    "const G4_WORDS = [];",
    "const G5_WHITELIST = [];",
    "const DAYS = [];",
    "function helperWithLocalShadowAfter() {",
    "  // 局部同名 const，这次排在真实顶层声明之后，同样不应被计成顶层声明",
    "  const RESERVED = ['local', 'shadow', 'declared', 'after', 'real'];",
    "  return RESERVED;",
    "}"
  ].join('\n');
  const html = `<!doctype html><html><body><script>\n${scriptBody}\n</script></body></html>`;

  const box = loadData(html, true);
  assert.deepEqual([...box.RESERVED], ['ram', 'hem', 'rid', 'dam', 'kid'],
    `H1 补充（顺序反过来）：loadData(...).RESERVED 应该等于真实顶层声明的值，实际：${JSON.stringify(box.RESERVED)}`);

  console.log('PASS grapheme migration（H1 补充：局部 shadow 声明排在真实顶层声明之后）：AST 判定与文本先后顺序无关，两种顺序都能正确抽取到真实顶层值');
}
