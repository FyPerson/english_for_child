/* 里程碑 2 段 4 U1（2026-09-11）：tools/validation/load_data.js 的 AST 化验证。
 *
 * 背景：段 3 十轮外审停在轮 J，三条 HIGH 之一 + 两条 medium 同一个根因——
 * tools/validation/load_data.js 用自制词法器 tools/validation/js_lex.js（正则 +
 * 括号深度近似）判断"哪些是顶层数据声明"。H1（必须根治）：countDeclarationOccurrences
 * 只把括号深度 0 的声明计入重复检查，但 declaration() 仍按文本顺序抽取第一个匹配，
 * 局部同名 const 排在真实顶层声明前面时会静默返回错误数据；两条 medium：js_lex 不
 * 识别正则字面量（未配对括号让深度统计漂移）、"顶层声明格式契约"（单行分号结尾或
 * 顶格 };/]; 结尾）依赖换行/缩进形态。方案：换用真正的 JS 解析器（acorn，vendor 到
 * tools/vendor/acorn.js），把"哪些是顶层声明"这个问题的答案唯一化为 AST 的
 * Program.body。
 *
 * 本文件补挂 tests/unit/test_grapheme_migration.js 已有的 I-M2/L2/M1/B-M1 等回归
 * 之外的新增覆盖面，专门针对 AST 化本身引入的新原语（collectScriptSources /
 * findAllTopLevelDeclarations / declaration 的 AST 重写）。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const {
  loadData, declaration, collectScriptSources, collectScriptEntries, findAllTopLevelDeclarations,
  JS_MIME_TYPES, KNOWN_NON_JS_SCRIPT_TYPES, scriptTypeAttr, parseStartTagAttributes
} = require('../../tools/validation/load_data');
const { findTopLevelSoundsAssignments } = require('../../tools/validation/js_ast');

/* MIN_NAMES_BODY：不含 META/RESERVED 本身，凑齐 NAMES 列表里其余必须能通过
 * vm.runInNewContext 求值的最小声明集合，避免每个用例都重复列一遍。调用方按需
 * 拼接自己的 META/RESERVED（或其它要测试的名字）。 */
const OTHER_NAMES_BODY = [
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

function wrapScript(body) {
  return `<!doctype html><html><body><script>\n${body}\n</script></body></html>`;
}

// ============================================================================
// 1. 正则字面量不再影响判定。
// ============================================================================
{
  // 1a：最直接的场景——三种正则字面量（`/\{/` 未配对花括号、`` /`/ `` 反引号、
  // `/["']/` 引号）排在真实顶层声明之前，声明仍应被正确发现与抽取。
  //
  // 破坏验证（改前用 tools/validation/js_lex.js 的正则+括号深度近似）：把这份
  // scriptBody 喂给 git HEAD（改前）版本的 countDeclarationOccurrences，META 和
  // RESERVED 的计数都错误地报告为 0（真实值应为各 1 次）——`/\{/` 的未配对 `{` 让
  // maskStringsAndComments 之后的括号深度从此永久 +1 偏移，此后所有真正的顶层
  // 声明都被误判为"嵌套在某个结构内部"（深度非 0）。declaration() 恰好因为不依赖
  // 深度而侥幸抽取正确，但 countDeclarationOccurrences 已经完全失去分辨力。
  const body = [
    "const re = /\\{/;",
    "const re2 = /`/;",
    "const re3 = /[\"']/;",
    "const META = {\"week\":1};",
    "const RESERVED = ['a','b','c'];",
    OTHER_NAMES_BODY
  ].join('\n');
  const html = wrapScript(body);

  const entries = collectScriptEntries(html, true);
  const decls = findAllTopLevelDeclarations(entries);
  assert.equal((decls.get('META') || []).length, 1, '1a：正则字面量不应影响 META 的顶层声明计数（应为 1）');
  assert.equal((decls.get('RESERVED') || []).length, 1, '1a：正则字面量不应影响 RESERVED 的顶层声明计数（应为 1）');

  const box = loadData(html, true);
  assert.equal(box.META.week, 1, '1a：META 应被正确加载');
  assert.deepEqual([...box.RESERVED], ['a', 'b', 'c'], '1a：RESERVED 应被正确加载');

  console.log('PASS load_data_ast（1a：三种正则字面量不影响顶层声明发现/抽取）');
}

{
  // 1b：更强的回归——正则字面量不应该"碰巧不出问题"，而是应该让 duplicate-declaration
  // 这类需要精确计数的判定在有正则字面量的情况下依然可靠。
  //
  // M-4 修复（2026-09-11，预筛 medium）：改前这里构造的是"同一个 <script> 内两次
  // `const RESERVED`"，acorn 在 hasInlineMeta 阶段解析该 script 就直接抛出
  // duplicate-declaration（走 tryFindTopLevelDeclarations 的"同一作用域内标识符已
  // 被声明"分支）——findAllTopLevelDeclarations 的 Map 归并逻辑（H1 的真正根治点）
  // 根本没被调用到。把这条用例的归并逻辑整个改坏（比如让 findAllTopLevelDeclarations
  // 不再按 name 分组），这条用例依然全绿，测不出任何东西；同时全仓库没有任何用例
  // 覆盖"正则字面量 + 跨 script Map 计数"这个组合（用例 4 跨 script 但没有正则
  // 字面量，改前的 1b 有正则字面量但不跨 script）。
  // 改法：两个 <script>，各自都含一个正则字面量（`/\{/`，与 1a 同款、会让改前的
  // js_lex 括号深度近似方案漂移），各自顶层声明一次 RESERVED——重复发生在
  // *跨 script*，必须真正走到 findAllTopLevelDeclarations 的 Map 归并才能被发现。
  const scriptA = [
    "<script>",
    "const re = /\\{/;",
    "const META = {\"week\":1};",
    "const RESERVED = ['first','one'];",
    "</script>"
  ].join('\n');
  const scriptB = [
    "<script>",
    "const re2 = /\\{/;",
    "const RESERVED = ['second','dup'];",
    "</script>"
  ].join('\n');
  const html = `<!doctype html><html><body>${scriptA}\n${scriptB}</body></html>`;

  // 前提：两个 script 各自的正则字面量不应干扰 collectScriptEntries/AST 解析，
  // RESERVED 在 Map 里应该正确累计出 2 条（真正走了 Map 归并，不是同一 script
  // 内的 acorn 解析期失败）。
  const entries = collectScriptEntries(html, true);
  assert.equal(entries.length, 2, '1b 前提：应有 2 个独立 <script>，各含一个正则字面量');
  const decls = findAllTopLevelDeclarations(entries);
  const reservedOcc = decls.get('RESERVED') || [];
  assert.equal(reservedOcc.length, 2,
    `1b 前提：正则字面量不应影响跨 script 的 RESERVED 计数，应累计 2 条，实际：${reservedOcc.length}`);

  let caught = null;
  try { loadData(html, true); } catch (e) { caught = e; }
  assert(caught, '1b：正则字面量存在时，真实的跨 script 重复声明仍应被检测到并拒绝');
  assert.equal(caught.code, 'duplicate-declaration', `1b：错误码应为 duplicate-declaration，实际：${caught.code}`);
  assert.equal(caught.declarationName, 'RESERVED', `1b：应点名 RESERVED，实际：${caught.declarationName}`);
  // count/countIsLowerBound 是精确值（Map 归并出的完整清单），不是下限——与用例 5
  // （同一 script 内重复，count 只是下限）显式区分，这正是"走了 Map 路径"的证据。
  assert.equal(caught.count, 2, `1b：应带上精确的重复次数 2，实际：${caught.count}`);
  assert.equal(caught.countIsLowerBound, false,
    `1b：跨 script 路径的 count 是精确值，应标记 countIsLowerBound=false，实际：${caught.countIsLowerBound}`);

  console.log('PASS load_data_ast（1b：正则字面量不会让跨 script 的重复声明 Map 归并失效，真正经过了 findAllTopLevelDeclarations）');
}

// ============================================================================
// 2. 格式契约解除：等号两侧无空格、等号后换行、缩进、声明体内部含顶格 };/ 字符串
//    或模板不再是"顶层声明"判定所依赖的形态。
// ============================================================================
{
  const body = [
    "const META={\"week\":1};", // 等号两侧无空格
    "const RESERVED =\n['a','b','c'];", // 等号后换行
    "  const SOUNDS = {};", // 带缩进的顶层声明——缩进在 JS 里完全合法，AST 不依赖
                             // 缩进/顶格来判断"是不是顶层"，只看 ast.body（L-6 修复，2026-09-11）
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
  const html = wrapScript(body);
  const box = loadData(html, true);
  assert.equal(box.META.week, 1, '2：等号两侧无空格的 META 应能正确加载');
  assert.deepEqual([...box.RESERVED], ['a', 'b', 'c'], '2：等号后换行的 RESERVED 应能正确加载');
  // box.SOUNDS 同样是 vm 独立 realm 里的对象字面量，与 M1 节头注释里的数组同理，
  // 用 {...box.SOUNDS} 搬回当前 realm 的普通对象再比较，避免 deepStrictEqual 因
  // "结构相同但不是同一原型链"误判不相等。
  assert.deepEqual({ ...box.SOUNDS }, {}, '2：缩进的顶层声明（SOUNDS）应能正确加载');
  console.log('PASS load_data_ast（2a：无空格等号 / 换行等号 / 缩进声明均能正确抽取）');
}

{
  // 2b + 3：声明体内部含"顶格 };"的模板字符串（碰巧长得像声明结尾），且该模板字符串
  // 还带 `${...}` 插值、插值内部含花括号与引号——真正的结尾在这些诱饵之后。
  //
  // 破坏验证（改前）：git HEAD 版本的 declaration() 用 `/^\s*[}\]];/m` 找"顶格 };
  // 或 ];"作为多行声明的收尾，会在模板字符串内部那行顶格的 "};" 处提前截断，
  // 漏掉真正的结尾与紧随其后的所有内容（含真正的收尾 "};" 本身都被漏掉，返回的
  // 文本本身甚至不是一条完整合法的 JS 语句）。
  const body = [
    "const META = {",
    "  greeting: `hello ${\"a\" + \"{fake}\"} world",
    "};",
    "more text after fake close`",
    "};",
    "const RESERVED = ['x','y','z'];"
  ].join('\n');
  const html = wrapScript(body);

  const metaText = declaration(html, 'META');
  assert(metaText.includes('more text after fake close'),
    `2b/3：META 的声明体是一个含插值与"假顶格 };"的模板字符串，应该抽取到真正的结尾，实际抽取：${JSON.stringify(metaText)}`);
  assert(metaText.trim().endsWith('};'), '2b/3：META 声明的抽取文本应该以真正的顶层收尾 }; 结束');

  const reservedText = declaration(html, 'RESERVED');
  assert.equal(reservedText, "const RESERVED = ['x','y','z'];",
    `3：RESERVED 是紧随其后的独立顶层声明，不应被 META 声明体内部的插值/假收尾干扰，实际：${JSON.stringify(reservedText)}`);

  console.log('PASS load_data_ast（2b/3：声明体内部的模板字符串插值/假顶格 }; 不影响抽取边界，后续声明也不受干扰）');
}

// ============================================================================
// 4. 跨 script 同名顶层声明 → duplicate-declaration。
// ============================================================================
{
  const scriptA = "<script>\nconst META = {\"week\":1};\nconst RESERVED = ['a','b','c'];\n</script>";
  const scriptB = "<script>\nconst RESERVED = ['x','y','z'];\n</script>";
  const html = `<!doctype html><html><body>${scriptA}\n${scriptB}</body></html>`;

  const entries = collectScriptEntries(html, true);
  assert.equal(entries.length, 2, '4 前提：应有 2 个独立 <script>');
  const decls = findAllTopLevelDeclarations(entries);
  assert.equal((decls.get('RESERVED') || []).length, 2, '4 前提：RESERVED 应在两个 script 里各出现一次，Map 累计 2 条');

  let caught = null;
  try { loadData(html, true); } catch (e) { caught = e; }
  assert(caught, '4：跨 script 同名顶层声明应被拒绝');
  assert.equal(caught.code, 'duplicate-declaration', `4：错误码应为 duplicate-declaration，实际：${caught.code}`);
  assert.equal(caught.declarationName, 'RESERVED', `4：应点名 RESERVED，实际：${caught.declarationName}`);
  assert.equal(caught.count, 2, `4：应带上重复次数 2，实际：${caught.count}`);
  // 收口 B（2026-09-11）：这条路径的 count 来自 findAllTopLevelDeclarations 的 Map
  // 归并结果，是精确值——与用例 5（同一 script 内重复，count 只是下限）显式区分开。
  assert.equal(caught.countIsLowerBound, false,
    `4：跨 script 路径的 count 是精确值，应标记 countIsLowerBound=false，实际：${caught.countIsLowerBound}`);
  // M-1 修复（2026-09-11）：跨 script 路径的每条记录都已经过 AST 确认是真顶层
  // 声明，作用域是确定的顶层，应标记 scopeUnknown=false——与用例 5（同一 script
  // 内的重复，acorn 报错不带作用域深度信息，scopeUnknown=true）显式区分开。
  assert.equal(caught.scopeUnknown, false,
    `4：跨 script 路径的作用域是确定的顶层，应标记 scopeUnknown=false，实际：${caught.scopeUnknown}`);
  // L-4 修复（预筛 low，2026-09-11）：跨 script 路径的 declarationName 恒来自 NAMES
  // 数组的 for..of，一定是数据常量清单里的一个——应标记 nameIsDataConstant=true，
  // 与用例 5（同一 script 内重复，declarationName 直接取自 acorn 报错文本，可以是
  // 任意标识符，nameIsDataConstant=false）显式区分开。
  assert.equal(caught.nameIsDataConstant, true,
    `4：跨 script 路径的 declarationName 恒为 NAMES 之一，应标记 nameIsDataConstant=true，实际：${caught.nameIsDataConstant}`);

  console.log('PASS load_data_ast（4：跨 script 同名顶层声明 → duplicate-declaration，count 精确值已标记）');
}

// ============================================================================
// 5. 同一 script 内重复 const 同名 → 给出可理解的失败（不是裸 SyntaxError）。
// ============================================================================
{
  const body = [
    "const META = {\"week\":1};",
    "const RESERVED = ['a','b','c'];",
    "const RESERVED = ['d','e','f'];"
  ].join('\n');
  const html = wrapScript(body);

  let caught = null;
  try { loadData(html, true); } catch (e) { caught = e; }
  assert(caught, '5：同一 script 内重复 const 同名应该抛错，不应该正常通过');
  assert.notEqual(caught.constructor && caught.constructor.name, 'SyntaxError',
    `5：不应该是裸的原生 SyntaxError 逃逸出来，实际构造函数：${caught.constructor && caught.constructor.name}`);
  assert.equal(caught.code, 'duplicate-declaration', `5：应能识别为 duplicate-declaration，实际 code：${caught.code}`);
  assert.equal(caught.declarationName, 'RESERVED', `5：应能从 acorn 的报错文本解析出标识符名 RESERVED，实际：${caught.declarationName}`);
  // 收口 B（2026-09-11）：这条路径的 count（固定 2）是下限——acorn 一遇到第二次声明
  // 就停，拿不到真实重复了几次；不断言精确 count，只断言这个标记本身。
  assert.equal(caught.countIsLowerBound, true,
    `5：同一 script 内的 count 只是下限，应标记 countIsLowerBound=true，实际：${caught.countIsLowerBound}`);
  // M-1 修复（2026-09-11）：acorn 的报错不带作用域深度信息，这条路径不知道重复
  // 到底发生在顶层还是嵌套作用域，应标记 scopeUnknown=true——与用例 4（跨 script，
  // 作用域确定是顶层，scopeUnknown=false）显式区分开。这条用例同时也是 M-1 的
  // 对照组：同一 script 内真顶层 META + 真顶层重复 RESERVED。
  // R-6 修复（轮 K 外审，2026-09-11，更正过期描述）：本段原来写"即使 hasInlineMeta
  // 捕获了 duplicate-declaration，也必须靠 META_DECLARATION_RE 探测到 META 存在，
  // 继续走到严格通道如实抛出"——这条描述已经过时：hasInlineMeta 现在（见用例
  // 22/③、hasInlineMeta 头注释）不再对 duplicate-declaration 做任何"缺 META 优先"
  // 消歧，也不再引用 META_DECLARATION_RE 做任何旁证，duplicate-declaration 无条件
  // 直接向上传播，不需要（也不会）先去探测 META 是否存在。本用例真正验证的是这条
  // 无条件传播本身：即使这份文档确实有顶层 META，同一 script 内的重复声明依然如实
  // 抛出 duplicate-declaration，不会被误吞成 legacy-html-fallback-rejected。
  assert.equal(caught.scopeUnknown, true,
    `5：同一 script 内的重复声明不知道作用域深度，应标记 scopeUnknown=true，实际：${caught.scopeUnknown}`);
  // L-4 修复（预筛 low，2026-09-11）：这条路径的 declarationName 直接取自 acorn 报错
  // 文本里的标识符名（dup[1]），不保证是数据常量——本用例恰好是 RESERVED（数据常量），
  // 但字段本身不能只看名字取值就假定语义，必须显式标记 nameIsDataConstant=false，
  // 与用例 4（declarationName 恒为 NAMES 之一，nameIsDataConstant=true）区分开；
  // 用例 14 的 `const x=1; const x=2;` 才是 declarationName 不是数据常量的典型场景。
  assert.equal(caught.nameIsDataConstant, false,
    `5：同一 script 内路径的 declarationName 不保证是数据常量，应标记 nameIsDataConstant=false，实际：${caught.nameIsDataConstant}`);

  console.log('PASS load_data_ast（5：同一 script 内重复 const 同名 → duplicate-declaration，不泄漏裸 SyntaxError，count 下限已标记）');
}

// ============================================================================
// 6. 非 JS 类型的 script 被跳过：不影响解析，也不被当成声明来源。
// ============================================================================
{
  const jsonScript = '<script type="application/json">{"const":1,"RESERVED":"should not be parsed as JS"}</script>';
  const realScript = "<script>\nconst META = {\"week\":1};\nconst RESERVED = ['a','b','c'];\n</script>";
  const html = `<!doctype html><html><body>${jsonScript}\n${realScript}</body></html>`;

  const sources = collectScriptSources(html, true);
  assert.equal(sources.length, 1, '6：application/json 类型的 <script> 不应被收进待解析的来源列表');
  assert(!sources[0].includes('should not be parsed'), '6：application/json 的内容不应混入被收集的来源');

  const box = loadData(html, true);
  assert.equal(box.META.week, 1, '6：非 JS 类型 script 不应妨碍真实 script 的正常加载');
  assert.deepEqual([...box.RESERVED], ['a', 'b', 'c'], '6：RESERVED 应正常来自真实的 <script>，不受 JSON script 干扰');

  console.log('PASS load_data_ast（6：application/json 等非 JS 类型的 <script> 被跳过，不参与解析）');
}

// ============================================================================
// 7. 解析失败的 JS script → 抛 script-parse-failed 且带 scriptIndex。
// ============================================================================
{
  const goodScript = "<script>\nconst META = {\"week\":1};\nconst RESERVED = ['a','b','c'];\n</script>";
  const brokenScript = "<script>\nconst SOUNDS = @@NOT-VALID-JS@@;\n</script>";
  const html = `<!doctype html><html><body>${goodScript}\n${brokenScript}</body></html>`;

  const sources = collectScriptSources(html, true);
  assert.equal(sources.length, 2, '7 前提：应有 2 个 <script>（第 0 个合法、第 1 个语法损坏）');

  let caught = null;
  try { loadData(html, true); } catch (e) { caught = e; }
  assert(caught, '7：含语法损坏的 <script> 应该导致 loadData 抛错');
  assert.equal(caught.code, 'script-parse-failed', `7：错误码应为 script-parse-failed，实际：${caught.code}`);
  assert.equal(caught.scriptIndex, 1, `7：应点名是第几个 <script>（索引 1，从 0 开始），实际：${caught.scriptIndex}`);

  console.log('PASS load_data_ast（7：语法损坏的 <script> → script-parse-failed 且带 scriptIndex，不静默跳过）');
}

// ============================================================================
// 8. type="module" 明确拒绝：不跳过、直接抛 unsupported-script-type（收口 A，
//    2026-09-11）——与用例 6 的 application/json 静默跳过对照：两种"不是普通
//    script"的 type，处置刻意不同（一个抛错、一个跳过），不写成一条恒真的
//    「反正都不当数据源」。
// ============================================================================
{
  const moduleScript = '<script type="module">\nexport const RESERVED = ["a","b","c"];\n</script>';
  const realScript = "<script>\nconst META = {\"week\":1};\n</script>";
  const html = `<!doctype html><html><body>${realScript}\n${moduleScript}</body></html>`;

  let caughtDirect = null;
  try { collectScriptSources(html, true); } catch (e) { caughtDirect = e; }
  assert(caughtDirect, '8：collectScriptSources 遇到 type="module" 应直接抛错，不是静默跳过（对照用例 6 的 application/json）');
  assert.equal(caughtDirect.code, 'unsupported-script-type', `8：错误码应为 unsupported-script-type，实际：${caughtDirect.code}`);
  assert.equal(caughtDirect.scriptType, 'module', `8：应带上 scriptType="module"，实际：${caughtDirect.scriptType}`);
  assert.equal(caughtDirect.scriptIndex, 1, `8：应点名是第几个 <script>（索引 1，从 0 开始），实际：${caughtDirect.scriptIndex}`);

  let caught = null;
  try { loadData(html, true); } catch (e) { caught = e; }
  assert(caught, '8：loadData 遇到 module 脚本应抛错，不应静默漏读这份数据来源');
  assert.equal(caught.code, 'unsupported-script-type', `8：loadData 抛出的错误码应为 unsupported-script-type，实际：${caught.code}`);
  assert.equal(caught.scriptType, 'module', `8：loadData 抛出的错误应带上 scriptType="module"，实际：${caught.scriptType}`);

  console.log('PASS load_data_ast（8：type="module" 明确拒绝——抛 unsupported-script-type，不静默跳过；与用例 6 对照，两种非常规 type 处置不同）');
}

// ============================================================================
// 9. declaration() 遇到含 module 脚本的 HTML 不应被连累抛错——它对任何解析失败
//    一律宽容处理（见 load_data.js declaration() 头注释），module 触发的
//    unsupported-script-type 也不例外：应退回 legacyTextDeclaration 纯文本兜底，
//    仍能找到与 module 无关、写得好好的其它声明。
// ============================================================================
{
  const moduleScript = '<script type="module">\nexport const IGNORED = 1;\n</script>';
  const realScript = "<script>\nconst META = {\"week\":1};\nconst RESERVED = ['a','b','c'];\n</script>";
  const html = `<!doctype html><html><body>${realScript}\n${moduleScript}</body></html>`;

  let text = null;
  let thrown = null;
  try { text = declaration(html, 'RESERVED'); } catch (e) { thrown = e; }
  assert.equal(thrown, null, `9：declaration() 不应因文档里有 module 脚本而抛错，实际抛出：${thrown && thrown.message}`);
  assert.equal(text, "const RESERVED = ['a','b','c'];",
    `9：declaration() 应退回纯文本兜底仍找到 RESERVED，实际：${JSON.stringify(text)}`);

  console.log('PASS load_data_ast（9：declaration() 遇到 module 脚本不抛错，退回纯文本兜底仍能找到其它声明）');
}

// ============================================================================
// 10. scriptIndex 口径统一（收口 A，2026-09-11）：script-parse-failed 的 scriptIndex
//    必须恒为「文档里第几个 <script> 标签的原始序号」，不能是「过滤掉非 JS 标签后的
//    数组下标」——用一份第 0 个标签被静默跳过的混合文档，构造两种口径必然给出不同
//    数字的场景：第 0 个标签是 application/json（静默跳过，不进入待解析条目）、
//    第 1 个标签是声明了 META 的正常 <script>（用于通过 loadData 的"缺 META 优先"
//    判定，走到严格通道）、第 2 个标签是含语法错误的 <script>。
//    可解析条目（collectScriptEntries 的返回值）过滤后只剩 2 条：META 脚本
//    （tagIndex=1）、语法损坏脚本（tagIndex=2）——语法损坏脚本在这份"过滤后数组"
//    里的下标是 1，但它在文档里的标签原始序号是 2。断言 scriptIndex===2，就是断言
//    "取的是标签原始序号"；如果有人把 findAllTopLevelDeclarations 里的实现改回
//    "entries 数组下标"（例如 `entries.forEach((entry, i) => ... i ...)`），这里会
//    得到 1 而不是 2，断言失败——该回归的破坏验证见 U1 收口报告（复制 load_data.js
//    副本后临时改回数组下标重跑本文件，实测这条断言从 PASS 变为 AssertionError:
//    scriptIndex 应为 2...实际：1，验证过程未使用 git checkout/stash，改完已用
//    副本还原）。
// ============================================================================
{
  const jsonScript = '<script type="application/json">{"not":"js"}</script>';
  const metaScript = "<script>\nconst META = {\"week\":1};\n</script>";
  const brokenScript = "<script>\nconst SOUNDS = @@NOT-VALID-JS@@;\n</script>";
  const html = `<!doctype html><html><body>${jsonScript}\n${metaScript}\n${brokenScript}</body></html>`;

  // 前提：collectScriptEntries 应该跳过第 0 个 json 标签，可解析条目只剩 2 条，
  // 但它们各自携带的 tagIndex 仍是文档里的原始序号（1、2），不是过滤后重新数的
  // （0、1）。
  const entries = collectScriptEntries(html, true);
  assert.equal(entries.length, 2, '10 前提：application/json 标签应被静默跳过，可解析条目应剩 2 条（META 脚本 + 语法损坏脚本）');
  assert.deepEqual(entries.map(e => e.tagIndex), [1, 2],
    `10 前提：两条可解析条目的 tagIndex 应分别是 1、2（文档里的标签原始序号，第 0 个 json 标签被跳过不占用条目但仍占用计数），实际：${JSON.stringify(entries.map(e => e.tagIndex))}`);

  let caught = null;
  try { loadData(html, true); } catch (e) { caught = e; }
  assert(caught, '10：含语法损坏 <script> 的混合文档应该导致 loadData 抛错');
  assert.equal(caught.code, 'script-parse-failed', `10：错误码应为 script-parse-failed，实际：${caught.code}`);
  assert.equal(caught.scriptIndex, 2,
    `10：scriptIndex 应为标签原始序号 2（若误用"过滤后数组下标"会得到 1，因为语法损坏脚本是可解析条目数组里的第 2 个、下标 1），实际：${caught.scriptIndex}`);

  console.log('PASS load_data_ast（10：scriptIndex 统一取标签原始序号——混合文档里与"过滤后数组下标"口径必然分歧时仍正确）');
}

// ============================================================================
// 11. H-1（必修，2026-09-11）：白名单要覆盖 HTML 规范的 "JavaScript MIME type
//    essence match"——带参数的 type（如 text/javascript;charset=utf-8）截断参数后
//    命中 JS_MIME_TYPES，应被正常收下并加载，不应静默跳过。
//
// 破坏验证：把 scriptTypeAttr 里 `raw.split(';')[0].trim().toLowerCase()` 改回
// `raw.toLowerCase().trim()`（不截断参数），这条用例的 sources.length 会从 2 变成
// 1、box.RESERVED 会变成 undefined，断言从 PASS 变 AssertionError（复制文件副本
// 验证，未使用 git checkout/stash）。
// ============================================================================
{
  const realScript = "<script>\nconst META = {\"week\":1};\n</script>";
  const paramScript = '<script type="text/javascript;charset=utf-8">\nconst RESERVED = [\'real\',\'data\'];\n</script>';
  const html = `<!doctype html><html><body>${realScript}\n${paramScript}</body></html>`;

  const sources = collectScriptSources(html, true);
  assert.equal(sources.length, 2, '11：带 charset 参数的 text/javascript;charset=utf-8 应被识别为 JS 并收下');
  assert(sources.some(s => s.includes("RESERVED = ['real','data']")),
    '11：带参数 type 的 <script> 内容应出现在收集到的来源里');

  const box = loadData(html, true);
  assert.deepEqual([...box.RESERVED], ['real', 'data'],
    `11：loadData 应正确加载带参数 type 的 <script> 里的 RESERVED，实际：${JSON.stringify(box.RESERVED)}`);

  console.log('PASS load_data_ast（11/H-1a：带参数的 JS MIME type 会被正确截断参数后收下并加载）');
}

// ============================================================================
// 12. H-1（必修）：白名单没收录、也不在已知非 JS 清单里的未知 type，应该响亮报错
//    （unsupported-script-type），不是静默跳过——白名单欠收的失败模式必须从
//    "静默漏读"改成"响亮报错"。已知非 JS 类型（application/json）仍静默跳过见
//    用例 6，两条各自独立断言，不合并成一条。
//
// L-6 修复（预筛 low，2026-09-11）：改前本用例只断言 collectScriptSources 这一层
// 抛错，没断言真正的生产入口 loadData() 也抛——collectScriptSources 与 loadData
// 的分类逻辑都委托给同一个 collectScriptEntries，理论上不会不一致，但生产消费者
// （check_data.js/build_course.py 等）走的是 loadData，只测底层函数、不测入口，
// 万一未来 loadData() 在调用 collectScriptEntries 之前/之后加了一层吞错处理，这个
// 回归测不出来。补上对 loadData 的同款断言。
// ============================================================================
{
  const html = '<!doctype html><html><body><script>const META = {"week":1};</script>' +
    '<script type="text/foobar">const RESERVED = [1,2,3];</script></body></html>';

  let caught = null;
  try { collectScriptSources(html, true); } catch (e) { caught = e; }
  assert(caught, '12：未知 script type（text/foobar）应该让 collectScriptSources 抛错，不是静默跳过');
  assert.equal(caught.code, 'unsupported-script-type', `12：错误码应为 unsupported-script-type，实际：${caught.code}`);
  assert.equal(caught.scriptType, 'text/foobar', `12：应带上 scriptType="text/foobar"，实际：${caught.scriptType}`);

  let caughtLoadData = null;
  try { loadData(html, true); } catch (e) { caughtLoadData = e; }
  assert(caughtLoadData, `12/L-6：生产入口 loadData() 遇到同一份文档也应该抛错，不是静默跳过`);
  assert.equal(caughtLoadData.code, 'unsupported-script-type',
    `12/L-6：loadData() 抛出的错误码应为 unsupported-script-type，实际：${caughtLoadData.code}`);
  assert.equal(caughtLoadData.scriptType, 'text/foobar',
    `12/L-6：loadData() 抛出的错误应带上 scriptType="text/foobar"，实际：${caughtLoadData.scriptType}`);

  console.log('PASS load_data_ast（12/H-1b/L-6：未知 script type 响亮报错，不静默跳过——底层 collectScriptSources 与生产入口 loadData 均验证，与已知非 JS 类型的用例 6 对照）');
}

// ============================================================================
// 13. H-2（必修，2026-09-11）：一条语句声明多个 NAMES（`const META = {...},
//    RESERVED = [...];`）时，chunks 不应把同一条语句重复推入——改前会导致 vm 对
//    同一条 const 语句求值两次，触发裸 SyntaxError（"Identifier 'META' has
//    already been declared"）逃逸。
//
// 破坏验证：把 loadData 里按声明节点去重的逻辑（pushedDeclNodes）去掉、还原成
// `if (occ && occ.length === 1) chunks.push(occ[0].text);`，这条用例会从 PASS 变
// 成抛出未包装的 SyntaxError（复制文件副本验证，未使用 git checkout/stash）。
// ============================================================================
{
  const body = [
    "const META = {\"week\":1}, RESERVED = ['a','b','c'];",
    OTHER_NAMES_BODY
  ].join('\n');
  const html = wrapScript(body);

  let caught = null;
  let box = null;
  try { box = loadData(html, true); } catch (e) { caught = e; }
  assert.equal(caught, null,
    `13：一条语句声明多个 NAMES 不应触发裸 SyntaxError，实际抛出：${caught && caught.constructor && caught.constructor.name}: ${caught && caught.message}`);
  assert.equal(box.META && box.META.week, 1, '13：META 应能正确加载');
  assert.deepEqual([...box.RESERVED], ['a', 'b', 'c'], '13：同一条语句里的 RESERVED 应能正确加载');

  console.log('PASS load_data_ast（13/H-2：一条语句声明多个 NAMES 时 chunks 按声明节点去重，不会重复推入导致裸 SyntaxError）');
}

// ============================================================================
// 14. ③ 主会话裁定（第三轮预筛，2026-09-11，取代改前 M-1 的行为）：hasInlineMeta
//    不再对 duplicate-declaration 做任何"缺 META 优先"消歧——即使这份文档整体没有
//    任何顶层 META、重复声明本身又嵌套在函数体内部与 META 毫不相干，现在也统一让
//    duplicate-declaration 直接向上传播，不再误吞成 legacy-html-fallback-rejected。
//
//    有意的口径变更，不是回归：M-1（第二轮）曾经专门为这个场景加了一条文本旁证，
//    把它判定成 legacy-html-fallback-rejected；第三轮预筛证明那条旁证本身无法被
//    正则可靠实现（会被正则字面量/掩码扫描器双向骗倒，见 hasInlineMeta 头注释），
//    js_lex 退役的根因（不识别正则字面量）原样继承到了这条旁证上。裁定不再消歧，
//    duplicate-declaration 优先于"缺 META"判定——这与 loadData() 内对 L-4（module
//    抛错早于 META 判定）的裁定同构：都是结构化错误码、诊断准确（这份文档确实有
//    重复声明）、不是裸异常，B-M1"别让底层解析错误裸泄漏给调用方"的本意没有被
//    破坏（B-M1 真正要防的是裸 SyntaxError/script-parse-failed 这类无法诊断的失败，
//    不是"缺 META 必须是所有判定里优先级最高的那一个"）。
// ============================================================================
{
  const html = '<!doctype html><html><body><script>\n' +
    'var OLD=1;\n' +
    'function f(){ const x=1; const x=2; }\n' +
    '</script></body></html>';

  let caught = null;
  try { loadData(html, true); } catch (e) { caught = e; }
  assert(caught, '14：嵌套重复声明 + 缺 META 的输入应该抛错');
  assert.equal(caught.code, 'duplicate-declaration',
    `14/③：不再做"缺 META 优先"消歧，即使整份文档没有任何顶层 META，嵌套在函数体` +
    `内部的重复声明也应直接报 duplicate-declaration，实际：${caught.code}`);
  assert.equal(caught.declarationName, 'x', `14/③：应从 acorn 报错文本解析出标识符名 x，实际：${caught.declarationName}`);
  assert.equal(caught.scopeUnknown, true, `14/③：同一 script 内的重复声明不知道作用域深度，实际：${caught.scopeUnknown}`);
  assert.equal(caught.nameIsDataConstant, false, `14/③：x 不是 NAMES 清单里的数据常量，实际：${caught.nameIsDataConstant}`);

  console.log('PASS load_data_ast（14/③：hasInlineMeta 不再对 duplicate-declaration 做"缺 META 优先"消歧，即使整份文档缺 META，嵌套重复声明也直接向上传播；用例 5 对照验证真顶层重复声明的场景现在走同一条路径）');
}

// ============================================================================
// 15. L-3（2026-09-11）：SCRIPT_TAG_RE 改前 `<scriptx>` 会被误判成一个属性值为
//    "x" 的 <script> 标签（`[^>]*` 紧跟在 "script" 后不要求分隔符）。改后属性组
//    必须以空白开头，`<scriptx>` 不再被当作 <script> 标签处理。
// ============================================================================
{
  const html = '<!doctype html><html><body><scriptx>const A=1;</script>' +
    '<script>const META = {"week":1};</script></body></html>';

  const entries = collectScriptEntries(html, true);
  assert.equal(entries.length, 1, `15：<scriptx> 不应被当作真正的 <script> 标签收下，应只剩真实的 1 个，实际：${entries.length}`);
  assert(!entries.some(e => e.text.includes('const A=1')),
    '15：<scriptx> 的内容不应混入收集到的 <script> 来源');

  const box = loadData(html, true);
  assert.equal(box.META && box.META.week, 1, '15：真实的 <script> 应正常加载，不受 <scriptx> 干扰');

  console.log('PASS load_data_ast（15/L-3：<scriptx> 不再被误判成 <script> 标签）');
}

// ============================================================================
// 16. L-5（2026-09-11）：findTopLevelSoundsAssignments 放宽收集面后，
//    `SOUNDS.all = buildSounds();` 这类引用了不在 chunks 里的顶层标识符的赋值语句，
//    会让 vm 在执行期抛出原生 ReferenceError——应被转换成结构化的 data-eval-failed
//    错误，不应该无捕获地泄漏原生异常。
// ============================================================================
{
  const body = [
    "const META = {\"week\":1};",
    "const RESERVED = ['a','b','c'];",
    "const SOUNDS = {};",
    "SOUNDS.all = buildSounds();", // buildSounds 不是顶层 const/let/var 声明，不会被收进 chunks
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
  const html = wrapScript(body);

  let caught = null;
  try { loadData(html, true); } catch (e) { caught = e; }
  assert(caught, '16：vm 执行期 ReferenceError 应该被捕获转换，不应该正常返回');
  assert.equal(caught.code, 'data-eval-failed', `16：错误码应为 data-eval-failed，实际：${caught.code}`);
  assert(caught.cause && /buildSounds/.test(caught.cause.message || ''),
    `16：应保留原始错误在 cause 里（提到 buildSounds），实际 cause：${caught.cause && caught.cause.message}`);
  assert.notEqual(caught.constructor && caught.constructor.name, 'ReferenceError',
    `16：不应该是裸的原生 ReferenceError 逃逸出来，实际构造函数：${caught.constructor && caught.constructor.name}`);

  console.log('PASS load_data_ast（16/L-5：vm 执行期 ReferenceError 被转换为结构化的 data-eval-failed，不裸泄漏）');
}

// ============================================================================
// 17. M-2（2026-09-11）：declaration() 的三态区分——解析成功但 name 只存在于函数体
//    内部（不是顶层声明）时，应该直接返回 ''，不应该退回纯文本兜底把这个局部/
//    shadow 声明的文本当"找到了"返回。
//
// 破坏验证：把 declaration() 里 `if (direct.status === 'absent') return '';` 这行
// 删掉（让它继续往下退到 legacyTextDeclaration），这条用例会从返回 '' 变成返回
// 那段局部声明的文本，断言从 PASS 变 AssertionError（复制文件副本验证，未使用
// git checkout/stash）。
// ============================================================================
{
  // 用多行 + 缩进构造（而不是单行版本）：legacyTextDeclaration 的正则
  // `^[ \t]*const\s+RESERVED\s*=`（'m' 标志）要求匹配起点在某一行的行首——单行版
  // "function f(){ const RESERVED = [...]; }" 里 "const RESERVED" 出现在行中间，
  // 这条正则根本不会命中，测不出三态修复的真正效果（即使不修，也会"碰巧"返回
  // ''）。多行版本里 "  const RESERVED = [...];" 独占一行、行首只有空格，改前的
  // legacyTextDeclaration 会命中并返回这段局部声明文本，必须要三态修复才能在
  // "sources.length === 0" 分支提前用 direct.status==='absent' 拦下。
  const source = [
    "function f(){",
    "  const RESERVED = ['local','shadow'];",
    "  return RESERVED;",
    "}"
  ].join('\n');
  const text = declaration(source, 'RESERVED');
  assert.equal(text, '',
    `17：RESERVED 只存在于函数体内部（不是顶层声明），declaration() 应返回 ''，不应该是局部声明的文本，实际：${JSON.stringify(text)}`);

  console.log('PASS load_data_ast（17/M-2a：AST 解析成功但 name 不在顶层时，declaration() 直接返回 \'\'，不退回纯文本兜底劫持局部/shadow 值）');
}

// ============================================================================
// 18. M-2（2026-09-11）：declaration() 的三态区分——脚本真的损坏（存在一个真正
//    unparsable 的 <script>）时，纯文本兜底仍应生效（保住 media_declarations.js /
//    tests/unit/test_baseline.py 依赖的"其它常量不被连累"行为）。
// ============================================================================
{
  const goodPart = "const META = {\"week\":1};\nconst RESERVED = ['a','b','c'];";
  const brokenPart = "const SOUNDS = @@NOT-VALID-JS@@;";
  const html = `<!doctype html><html><body><script>\n${goodPart}\n${brokenPart}\n</script></body></html>`;

  const text = declaration(html, 'RESERVED');
  assert.equal(text, "const RESERVED = ['a','b','c'];",
    `18：同一个 <script> 里存在真正语法损坏的声明（SOUNDS）时，declaration() 仍应退回纯文本兜底找到与之无关的 RESERVED，实际：${JSON.stringify(text)}`);

  console.log('PASS load_data_ast（18/M-2b：脚本真正解析失败时，纯文本兜底仍生效，找到文件里其它写得好好的声明）');
}

// ============================================================================
// 19. H-A（预筛 high，2026-09-11 必修）：与顶层声明同一行、紧随其后的行尾注释应被
//    保留在 declaration()/findTopLevelDeclarations 的返回文本里——改前只切到
//    node.end（分号处），丢掉了 HEAD（js_lex 版本单行分支取 tail.split('\n')[0]
//    整行）原本会保留的行尾说明。真实回归：tools/capture_lesson_media.js 把返回值
//    写回受版本控制的 frontend/src/media/weekNN/<name>.js，行尾的"勿手改"标记/
//    说明文字会被静默删掉，tools/baseline.py 的 skeletonSha256 也会跟着变。43 份
//    真实输入（build/*.html、frontend/src/weeks/*.data.js、
//    frontend/src/media/week0*/*.js、四份 week 模板 + course 模板）逐字节对照
//    HEAD 的验证脚本见 U1 收口报告，本用例只做聚焦的最小回归。
//
// 破坏验证：把 js_ast.js 的 findTopLevelDeclarations 改回 `text:
// text.slice(node.start, node.end)`（不延伸），本用例的 19a 会从 PASS 变
// AssertionError（trailing 注释丢失），复制文件副本验证，未使用 git checkout/stash。
// ============================================================================
{
  const body = [
    "const RESERVED = ['a','b','c'];   /* 周检三词，说明文字 */",
    "const FIRST_TEACH_DAY = {c:1,k:1};   /* c 和 k 同一天教 */",
    "// standalone comment on its own line, must not be attached to any declaration",
    "const META = {\"week\":1};"
  ].join('\n');
  const html = wrapScript(body);

  const reservedText = declaration(html, 'RESERVED');
  assert.equal(reservedText, "const RESERVED = ['a','b','c'];   /* 周检三词，说明文字 */",
    `19a：RESERVED 的抽取文本应包含同一行的行尾注释，实际：${JSON.stringify(reservedText)}`);

  const dayText = declaration(html, 'FIRST_TEACH_DAY');
  assert.equal(dayText, "const FIRST_TEACH_DAY = {c:1,k:1};   /* c 和 k 同一天教 */",
    `19a：FIRST_TEACH_DAY 的抽取文本应包含同一行的行尾注释，实际：${JSON.stringify(dayText)}`);

  const metaText = declaration(html, 'META');
  assert.equal(metaText, "const META = {\"week\":1};",
    `19b：独占一行的注释不应该被相邻声明（META）吞并，META 自身没有行尾注释，实际：${JSON.stringify(metaText)}`);

  const box = loadData(html, true);
  assert.deepEqual([...box.RESERVED], ['a', 'b', 'c'], '19c：带行尾注释的 RESERVED 仍应能被 loadData 正常加载（注释不影响 vm 求值）');

  console.log('PASS load_data_ast（19/H-A：同一行紧随其后的行尾注释被保留，独占一行的注释不被相邻声明吞并，端到端加载不受影响）');
}

// ============================================================================
// 20. H-B（预筛 high，2026-09-11 必修）：scriptTypeAttr 改前的 `\btype\s*=` 在 `-`
//    后同样成立，且不分属性名/属性值地在整个属性串上匹配——`data-type="..."` 会被
//    误当成 `type="..."`（H-1 要消灭的"静默漏读"失败模式的复现），
//    `data-note="type=module"` 会被误当成 `type="module"`（无关属性触发 module 的
//    拒绝逻辑）。改为要求 "type" 前是字符串起始或空白（属性名边界）。
//
// 破坏验证：把 scriptTypeAttr 里的正则改回 `/\btype\s*=\s*.../i`，20a 的
// sources1.length 会从 1 变 0（真实 JS 被误判非 JS 静默跳过），20b 会从不抛错变成
// 抛 unsupported-script-type（scriptType='module'），两条断言均从 PASS 变
// AssertionError（复制文件副本验证，未使用 git checkout/stash）。
// ============================================================================
{
  // ①data-type="application/json" 不应该被误当成 type="application/json"。
  const html1 = '<!doctype html><html><body>' +
    '<script data-type="application/json">const META = {"week":1};const RESERVED=["a","b","c"];</script>' +
    '</body></html>';
  const sources1 = collectScriptSources(html1, true);
  assert.equal(sources1.length, 1,
    `20a：data-type="application/json" 的 <script> 不应被误判为非 JS 而跳过，应作为 JS 来源收下，实际收下 ${sources1.length} 条`);
  const box1 = loadData(html1, true);
  assert.equal(box1.META && box1.META.week, 1, '20a：data-type 属性不应干扰真实 JS 的正常加载（META）');
  assert.deepEqual([...box1.RESERVED], ['a', 'b', 'c'], '20a：data-type 属性不应干扰真实 JS 的正常加载（RESERVED）');

  // ②data-note="type=module" 不应该被误当成 type="module"。
  const html2 = '<!doctype html><html><body>' +
    '<script data-note="type=module">const META = {"week":1};</script>' +
    '</body></html>';
  let caught2 = null;
  try { loadData(html2, true); } catch (e) { caught2 = e; }
  assert.equal(caught2, null,
    `20b：data-note="type=module" 不应触发 module 的拒绝逻辑，实际抛出：${caught2 && caught2.code}: ${caught2 && caught2.message}`);

  console.log('PASS load_data_ast（20/H-B：scriptTypeAttr 只在属性名边界匹配 type，不再被 data-type/data-note 里的同形文本误命中）');
}

// ============================================================================
// 21. M-A（预筛 medium，2026-09-11）：declaration() 的三态修复（M-2）必须在"raw 是
//    完整 HTML、且至少一个 <script> 能正常解析"这条分支（sawUnparsableSource===false
//    的多 <script>/单 <script> HTML 分支）下同样生效，不能只在"raw 本身就是一份
//    独立可解析脚本"（sources.length===0，用例 17）分支下测到——真实消费者
//    media_declarations.js/capture_lesson_media.js 传进来的全是完整 HTML，走的正是
//    这里要补的分支。
//
// 破坏验证：删掉 load_data.js 里 `if (!sawUnparsableSource) return '';` 这一行，
// 本用例会从返回 '' 变成返回那段局部/shadow 声明的文本，断言从 PASS 变
// AssertionError（复制文件副本验证，未使用 git checkout/stash）。
//
// 注：与用例 17 同理，必须用"多行 + 独占一行的缩进声明"构造，不能用单行版本
// `function f(){ const RESERVED = [...]; }`——legacyTextDeclaration 的正则
// `^[ \t]*const\s+RESERVED\s*=`（'m' 标志）要求匹配起点在某一行的行首，单行版里
// "const RESERVED" 出现在行中间根本不会命中，即使不修也会"碰巧"返回 ''，测不出
// M-A 真正要补的效果（首次实现本用例时曾用单行版本，破坏验证跑不红，已改正）。
// ============================================================================
{
  const html = '<!doctype html><html><body><script>\n' +
    'const META = {"week":1};\n' +
    'function f(){\n' +
    "  const RESERVED = ['local','shadow'];\n" +
    '  return RESERVED;\n' +
    '}\n' +
    '</script></body></html>';
  const text = declaration(html, 'RESERVED');
  assert.equal(text, '',
    `21/M-A：RESERVED 只存在于 HTML 内某个 <script> 的函数体内部（不是顶层声明），declaration() 应返回 ''，不应该退回纯文本兜底劫持局部/shadow 值，实际：${JSON.stringify(text)}`);

  console.log('PASS load_data_ast（21/M-A：HTML 输入下 declaration() 的三态修复同样生效——sawUnparsableSource 这一行被真正覆盖）');
}

// ============================================================================
// 22. ③ 主会话裁定（第三轮预筛，2026-09-11，取代改前 M-B 的行为）：hasInlineMeta
//    彻底移除了 META_DECLARATION_RE 文本旁证消歧（见 hasInlineMeta 头注释）——不再
//    有"捕获 duplicate-declaration 后探测有没有 META 存在的痕迹"这一步，块注释/
//    模板字符串里的 "const META = ..." 诱饵因此也不再有机会影响判定。这两份输入
//    改前专门用来验证"掩码能不能把诱饵挡住"，现在正确的期望是duplicate-declaration
//    ——不管诱饵在不在、写成什么形态，结果都应该一致，因为已经没有任何步骤会去看
//    这段文本内容。
// ============================================================================
{
  // ①块注释里的诱饵（改前用于验证掩码能挡住它，机制已移除，诱饵内容不再相关）。
  const html1 = '<!doctype html><html><body><script>\n' +
    '/*\nconst META = {"week":1};\n*/\n' +
    'var OLD=1;\n' +
    'function f(){ const x=1; const x=2; }\n' +
    '</script></body></html>';
  let caught1 = null;
  try { loadData(html1, true); } catch (e) { caught1 = e; }
  assert(caught1, '22a：缺顶层 META + 嵌套重复声明的输入应该抛错');
  assert.equal(caught1.code, 'duplicate-declaration',
    `22a/③：不再做"缺 META 优先"消歧，块注释里的诱饵不应影响结果，应直接报 duplicate-declaration，实际：${caught1.code}`);

  // ②模板字符串里的诱饵，同上——现在的结果应与①一致，证明诱饵内容确实不再被看。
  const html2 = '<!doctype html><html><body><script>\n' +
    'const decoy = `text with const META = {"week":1} embedded inside`;\n' +
    'var OLD=1;\n' +
    'function f(){ const x=1; const x=2; }\n' +
    '</script></body></html>';
  let caught2 = null;
  try { loadData(html2, true); } catch (e) { caught2 = e; }
  assert(caught2, '22b：缺顶层 META + 嵌套重复声明的输入应该抛错');
  assert.equal(caught2.code, 'duplicate-declaration',
    `22b/③：不再做"缺 META 优先"消歧，模板字符串里的诱饵不应影响结果，应直接报 duplicate-declaration，实际：${caught2.code}`);

  console.log('PASS load_data_ast（22/③：移除 META_DECLARATION_RE 文本旁证消歧后，块注释/模板字符串里的诱饵不再有任何影响——两种输入现在都一律报 duplicate-declaration，与用例 14 同构）');
}

// ============================================================================
// 23. M-C（预筛 medium，2026-09-11）：JS_MIME_TYPES/KNOWN_NON_JS_SCRIPT_TYPES 两份
//    清单扩容后逐串覆盖——改前缩回旧清单（JS_MIME_TYPES 只剩三串、
//    KNOWN_NON_JS_SCRIPT_TYPES 只剩 application/json）时，全部既有用例仍然全绿，
//    清单扩容本身没有任何回归覆盖。
//
// 注：这里用的是一份写死的"期望成员清单"（抄自 load_data.js 当前的 JS_MIME_TYPES/
// KNOWN_NON_JS_SCRIPT_TYPES 字面量），逐个去跑 collectScriptSources 的真实行为——
// 不是遍历从 load_data.js 导入的活体 Set 本身。首次实现时图省事直接 `for (const
// type of JS_MIME_TYPES)` 遍历导入的 Set，结果清单缩水时这份遍历也跟着缩水，测试
// "验证"的对象和被改坏的对象是同一份，永远自证通过，沙箱破坏验证证实这条用例
// 完全测不出清单缩水（已改正）。写死清单不是重蹈 H1"两套判据"覆辙——H1 的问题是
// *生产代码*里两条判断路径可能给出不同结论、互相不知道对方存在；这里是*测试*在
// 断言生产 Set 的当前内容是否与预期一致，性质不同：清单真的被缩小时，
// collectScriptSources 对"预期应该是 JS/该被跳过"的具体串给出的真实行为就会变
// （抛错而不是收下/跳过），断言因此会真的失败，不会自证通过。
//
// 破坏验证：把 load_data.js 里 JS_MIME_TYPES 缩回
// `['', 'text/javascript', 'application/javascript']`，或把 KNOWN_NON_JS_SCRIPT_TYPES
// 缩回只剩 'application/json'，本用例对应半边会从 PASS 变 AssertionError（复制文件
// 副本验证，未使用 git checkout/stash）。
// ============================================================================
{
  // 与 load_data.js 里 JS_MIME_TYPES 字面量逐串对应（H-1 收口 C 扩容后的完整清单）。
  const expectedJsTypes = [
    '', 'application/ecmascript', 'application/javascript', 'application/x-ecmascript',
    'application/x-javascript', 'text/ecmascript', 'text/javascript',
    'text/javascript1.0', 'text/javascript1.1', 'text/javascript1.2',
    'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5',
    'text/jscript', 'text/livescript', 'text/x-ecmascript', 'text/x-javascript'
  ];
  // 与 load_data.js 里 KNOWN_NON_JS_SCRIPT_TYPES 字面量逐串对应。
  const expectedNonJsTypes = [
    'application/json', 'application/ld+json', 'text/template', 'text/html',
    'importmap', 'speculationrules'
  ];
  assert.deepEqual([...JS_MIME_TYPES].sort(), [...expectedJsTypes].sort(),
    '23 前提：JS_MIME_TYPES 的实际成员应与本用例写死的期望清单完全一致（清单本身有增减也要同步这里，不是本用例要拦的那类改动）');
  assert.deepEqual([...KNOWN_NON_JS_SCRIPT_TYPES].sort(), [...expectedNonJsTypes].sort(),
    '23 前提：KNOWN_NON_JS_SCRIPT_TYPES 的实际成员应与本用例写死的期望清单完全一致');

  for (const type of expectedJsTypes) {
    const openTag = type === '' ? '<script>' : `<script type="${type}">`;
    const html = `<!doctype html><html><body>${openTag}const META = {"week":1};</script></body></html>`;
    let sources, caught = null;
    try { sources = collectScriptSources(html, true); } catch (e) { caught = e; }
    assert.equal(caught, null, `23a：JS_MIME_TYPES 里的 type="${type}" 不应触发 unsupported-script-type，实际：${caught && caught.message}`);
    assert.equal(sources.length, 1,
      `23a：JS_MIME_TYPES 里的 type="${type}" 应被识别为 JS 并收下，实际收下 ${sources.length} 条`);
  }
  for (const type of expectedNonJsTypes) {
    const html = `<!doctype html><html><body><script type="${type}">not real js, should be skipped</script>` +
      `<script>const META = {"week":1};</script></body></html>`;
    let sources, caught = null;
    try { sources = collectScriptSources(html, true); } catch (e) { caught = e; }
    assert.equal(caught, null, `23b：KNOWN_NON_JS_SCRIPT_TYPES 里的 type="${type}" 不应触发 unsupported-script-type，实际：${caught && caught.message}`);
    assert.equal(sources.length, 1,
      `23b：KNOWN_NON_JS_SCRIPT_TYPES 里的 type="${type}" 应被静默跳过，不计入待解析来源，实际收下 ${sources.length} 条`);
    assert(!sources.some(s => s.includes('not real js')),
      `23b：type="${type}" 的内容不应混入收集到的来源`);
  }

  console.log(`PASS load_data_ast（23/M-C：JS_MIME_TYPES 全部 ${expectedJsTypes.length} 个 type 均被正确收下，KNOWN_NON_JS_SCRIPT_TYPES 全部 ${expectedNonJsTypes.length} 个 type 均被正确跳过——逐串参数化覆盖，且验证了成员数不会静默缩水）`);
}

// ============================================================================
// 24. L-5（预筛 low，2026-09-11）：findTopLevelDeclarations（js_ast.js）本就收
//    const/let/var 三种关键字的顶层声明，hasInlineMeta 的 AST 探测路径
//    （`.declarations.some(d => d.name === 'META')`）应能直接识别顶层
//    `let META`/`var META`，端到端正常加载。
//
//    ③ 主会话裁定（第三轮，2026-09-11）追记：改前这里用"let META + 同一 script 内
//    真实重复声明"的组合场景验证 META_DECLARATION_RE 旁证——hasInlineMeta 现在已经
//    不再有 duplicate-declaration 捕获分支、也不再引用这条正则做任何旁证（见 22/③、
//    hasInlineMeta 头注释），旁证被删除后这个组合场景测的其实只是"duplicate-declaration
//    无条件传播"（用例 5/14/22 已经覆盖），不再是本用例（L-5）本来要验证的东西。
//    改为单独验证 let/var META 在没有任何重复声明干扰时也能被正常识别、正常加载，
//    与用例 5/14/22 的职责互不重叠。
// ============================================================================
{
  const html1 = wrapScript('let META = {"week":1};\nconst RESERVED = ["a","b"];');
  const box1 = loadData(html1, true);
  assert.equal(box1.META && box1.META.week, 1, '24a：顶层 let META 应能被正常加载');

  const html2 = wrapScript('var META = {"week":2};\nconst RESERVED = ["a","b"];');
  const box2 = loadData(html2, true);
  assert.equal(box2.META && box2.META.week, 2, '24b：顶层 var META 应能被正常加载');

  console.log('PASS load_data_ast（24/L-5：let/var META 均被正确加载，与 AST 收 const/let/var 的口径对齐；hasInlineMeta 不再依赖 META_DECLARATION_RE 做任何探测，见用例 22/③）');
}

// ============================================================================
// 25. ① H-D（预筛 high，第三轮，2026-09-11）：scriptTypeAttr 换成按 HTML
//    before-attribute-name 状态逐对扫描的小型属性 tokenizer，替换掉"在整个属性串上
//    用正则搜属性名"的做法——正则搜索天然无法区分"属性名"与"落在属性值引号内容里的
//    同形文本"，这个错误已经以三种形态出现过：`\btype` 命中 `data-type`（H-B，第二轮）；
//    `(?:^|\s)type` 命中引号内空格后的 `type=`（本轮实测：
//    `data-note="see type=application/json for schema"` 里真实 JS 被静默丢弃且不
//    报错）；`<script /type="module">`（HTML 规范 before-attribute-name 态里 `/`
//    被跳过，浏览器仍认 module，但字符串起始不是空白）。穷举覆盖 spec 要求的全部
//    必测形态，逐条独立断言，不合并成一条。
// ============================================================================
{
  const cases = [
    { label: 'data-type 不是 type（值本身不该被当成 type）', attrs: ' data-type="application/json"', expect: '' },
    { label: '值里含 "type=" 的 data-note 不应被当成 type 属性', attrs: ' data-note="see type=application/json for schema"', expect: '' },
    { label: '值里含 "type=module" 的 title 不应被当成 type 属性', attrs: ' title="how to set type=module"', expect: '' },
    { label: '斜杠前缀 /type="module"（HTML 规范 before-attribute-name 跳过 /）', attrs: '/type="module"', expect: 'module' },
    { label: '斜杠前缀且前面带空白（真实 <script /type="module"> 标签里的属性串形态）', attrs: ' /type="module"', expect: 'module' },
    { label: '大小写 TYPE="Text/JavaScript"', attrs: ' TYPE="Text/JavaScript"', expect: 'text/javascript' },
    { label: '制表符/换行分隔属性', attrs: '\tdefer\ntype="module"', expect: 'module' },
    { label: '无引号值 type=text/javascript', attrs: ' type=text/javascript', expect: 'text/javascript' },
    { label: "单引号值 type='module'", attrs: " type='module'", expect: 'module' },
    { label: '重复 type 取第一个（HTML 规范：重复属性以第一个为准）', attrs: ' type="module" type="text/javascript"', expect: 'module' },
    { label: '布尔属性混排 defer type="module"', attrs: ' defer type="module"', expect: 'module' },
    { label: '空属性串', attrs: '', expect: '' },
    { label: 'undefined 属性串（等价于 collectScriptEntries 无捕获组时的实参）', attrs: undefined, expect: '' }
  ];
  for (const c of cases) {
    const got = scriptTypeAttr(c.attrs);
    assert.equal(got, c.expect,
      `25/①：${c.label}——scriptTypeAttr(${JSON.stringify(c.attrs)}) 应为 ${JSON.stringify(c.expect)}，实际：${JSON.stringify(got)}`);
  }

  // 端到端：/type="module" 这个新形态在完整 <script> 标签里也必须被正确识别为
  // module 并响亮拒绝，不是静默跳过或误当成 JS 收下。
  const html = '<!doctype html><html><body><script /type="module">const X=1;</script>' +
    '<script>const META = {"week":1};</script></body></html>';
  let caught = null;
  try { collectScriptSources(html, true); } catch (e) { caught = e; }
  assert(caught, '25：<script /type="module"> 应被识别为 module 并抛错，不应被静默跳过或当成普通 JS 收下');
  assert.equal(caught.code, 'unsupported-script-type', `25：错误码应为 unsupported-script-type，实际：${caught.code}`);
  assert.equal(caught.scriptType, 'module', `25：应带上 scriptType="module"，实际：${caught.scriptType}`);

  // 直接单测 parseStartTagAttributes 本身的返回形状——scriptTypeAttr 只是它的一个
  // 消费者，tokenizer 本身也要能独立验证：保留源码顺序、重复属性名都在数组里（取舍
  // 交给调用方）、布尔属性的 hasValue===false 且 value===''。
  const attrs = parseStartTagAttributes(' defer type="module" type="text/javascript"');
  assert.deepEqual(attrs, [
    { name: 'defer', value: '', hasValue: false },
    { name: 'type', value: 'module', hasValue: true },
    { name: 'type', value: 'text/javascript', hasValue: true }
  ], `25：parseStartTagAttributes 应按源码顺序返回全部属性（含重复的 type），实际：${JSON.stringify(attrs)}`);

  console.log('PASS load_data_ast（25/①/H-D：scriptTypeAttr 换成属性 tokenizer 后，穷举覆盖属性名/属性值边界的全部必测形态，含新增的 /type="module" 斜杠前缀形态；parseStartTagAttributes 本身的返回形状也单独验证）');
}

// ============================================================================
// 26. ② H-C（预筛 high，第三轮，2026-09-11）：extendPastTrailingSameLineComments
//    改前只检查"中间有没有换行"，不是它自己文档承诺的"中间只有空格/制表符"——两者
//    不等价，真实数据声明之间只隔着空格（不隔换行）时，行尾注释延伸会把下一条完整
//    的顶层声明或一次函数调用也一起吞进当前声明的切片。
// ============================================================================
{
  // 26a：`const META=...; const RESERVED=...; /* 说明 */` 改前会把 RESERVED 整条
  // 声明吞进 META 的切片，load_data.js 用这份文本再次求值时报出虚假的
  // duplicate-declaration（"Identifier 'RESERVED' has already been declared"）。
  {
    const body = 'const META={"week":1}; const RESERVED=["a"]; /* 说明 */';
    const html = wrapScript(body);

    const metaText = declaration(html, 'META');
    assert.equal(metaText, 'const META={"week":1};',
      `26a：META 的抽取文本不应吞并紧随其后的 RESERVED 完整声明，实际：${JSON.stringify(metaText)}`);

    let caught = null;
    let box = null;
    try { box = loadData(html, true); } catch (e) { caught = e; }
    assert.equal(caught, null,
      `26a：不应该报出虚假的 duplicate-declaration，实际抛出：${caught && caught.code}: ${caught && caught.message}`);
    assert.equal(box.META && box.META.week, 1, '26a：META 应能正确加载');
    assert.deepEqual([...box.RESERVED], ['a'], '26a：RESERVED 应能正确加载（未被 META 的切片吞并）');
  }

  // 26b：`const META=...; sideEffect(); /*x*/` 改前会把 sideEffect() 这次函数调用
  // 吞进 META 的切片，load_data.js 把这段文本当 META 的声明体塞进 vm chunks，
  // sideEffect() 因而在加载 META 时被真实执行（实测：data-eval-failed:
  // sideEffect is not defined）。
  {
    const body = 'const META={"week":1}; sideEffect(); /*x*/';
    const html = wrapScript(body);

    const metaText = declaration(html, 'META');
    assert.equal(metaText, 'const META={"week":1};',
      `26b：META 的抽取文本不应吞并紧随其后的 sideEffect() 调用，实际：${JSON.stringify(metaText)}`);

    let caught = null;
    let box = null;
    try { box = loadData(html, true); } catch (e) { caught = e; }
    assert.equal(caught, null,
      `26b：sideEffect() 不是顶层声明，不应该被卷入 chunks 并在 vm 里执行，实际抛出：${caught && caught.code}: ${caught && caught.message}`);
    assert.equal(box.META && box.META.week, 1, '26b：META 应能正确加载，sideEffect() 从未被执行');
  }

  // 26c：正向回归——同一行有多个行内注释仍应依次正确延伸，不能因为修复①②而退化。
  {
    const body = "const RESERVED = ['a']; /* first */ /* second */";
    const html = wrapScript(body);
    const text = declaration(html, 'RESERVED');
    assert.equal(text, "const RESERVED = ['a']; /* first */ /* second */",
      `26c：同一行的多个行内注释应依次正确延伸，实际：${JSON.stringify(text)}`);
  }

  // 26d：L1（预筛 low，第三轮，2026-09-11，主会话裁定：选"注释起始于同一行"，见
  // js_ast.js findTopLevelDeclarations 头注释）——块注释本身含换行时
  // （`const A=1; /* line one\nline two */`），延伸后的切片允许跨行，但不应该
  // 吞并紧随其后的下一条独立声明。
  {
    const src = 'const A = 1; /* line one\nline two */\nconst META = {"week":1};';
    const textA = declaration(src, 'A');
    assert(textA.includes('line two'),
      `26d/L1：多行块注释应被完整纳入（选择"注释起始于同一行"口径），实际：${JSON.stringify(textA)}`);
    assert(!textA.includes('const META'),
      `26d/L1：多行块注释的延伸不应吞并紧随其后的下一条声明，实际：${JSON.stringify(textA)}`);
    const textMeta = declaration(src, 'META');
    assert.equal(textMeta, 'const META = {"week":1};',
      `26d/L1：META 自身不应受 A 的多行注释影响，实际：${JSON.stringify(textMeta)}`);
  }

  console.log('PASS load_data_ast（26/②/H-C：extendPastTrailingSameLineComments 改用"中间只有空格/制表符"精确判定后，不再吞并紧随其后的真代码——虚假 duplicate-declaration 与 sideEffect() 被误执行两个真实 bug 均已修复；同行多注释依次延伸、块注释跨行两条既有行为不受影响）');
}

// ============================================================================
// 27. ④ L-4（预筛 low，第三轮，2026-09-11）：导出的 JS_MIME_TYPES/
//    KNOWN_NON_JS_SCRIPT_TYPES 现在是 Object.freeze 过的数组快照，不是内部真实
//    Set——消费者尝试 mutate 它们不应该影响 scriptTypeAttr/collectScriptEntries
//    内部依赖的私有分类 Set。
//    L-4 追记（预筛 low，第四轮，2026-09-11，仅改注释不改断言/代码）：下方两次
//    mutate 尝试之后的 loadData 断言对"是否冻结"没有分辨力，见该断言上方内联注释；
//    真正扛住本用例的是 Array.isArray + Object.isFrozen 两条。
// ============================================================================
{
  assert(Array.isArray(JS_MIME_TYPES), '27：导出的 JS_MIME_TYPES 现在应该是数组，不是 Set');
  assert(Array.isArray(KNOWN_NON_JS_SCRIPT_TYPES), '27：导出的 KNOWN_NON_JS_SCRIPT_TYPES 现在应该是数组，不是 Set');
  assert(Object.isFrozen(JS_MIME_TYPES), '27：导出的 JS_MIME_TYPES 应是冻结数组');
  assert(Object.isFrozen(KNOWN_NON_JS_SCRIPT_TYPES), '27：导出的 KNOWN_NON_JS_SCRIPT_TYPES 应是冻结数组');

  /* L-4 修复（预筛 low，第四轮，2026-09-11，仅改注释、不改代码——补记这两次 mutate
   * 尝试与下面 loadData 断言之间实际没有分辨力）：
   *   - `JS_MIME_TYPES.push(...)`：冻结数组的 Array.prototype.push 内部用 Set 的
   *     "Throw=true" 语义，push 在冻结数组上**必定抛错**（与是否严格模式无关），
   *     下面的 try/catch 把这次抛错吞掉了——这一步从未真正"尝试成功过"。
   *   - `KNOWN_NON_JS_SCRIPT_TYPES.length = 0`：这是一次普通属性赋值，不是方法
   *     调用；本测试文件是 CommonJS 脚本（无 'use strict'），非严格模式下给不可写
   *     属性赋值会**静默失败**（不抛错，也不生效）——`.length` 实际没有被清零。
   * 也就是说下面 `loadData` 仍拒绝 `text/foobar` 这个断言，**在任何实作下都不可能
   * 变红**：不管 JS_MIME_TYPES/KNOWN_NON_JS_SCRIPT_TYPES 导出的是不是冻结数组，
   * `[...JS_MIME_TYPES]` 展开出来的都是与内部私有 Set 完全不同的另一个数组绑定，
   * mutate 导出快照（哪怕真的 mutate 成功了）在物理上就不可能碰到内部 Set——这一步
   * 只是"顺手做了一次形式上的 mutate 尝试"，不是本用例的分辨力所在。真正扛住"27"
   * 这条用例的是上面 `Array.isArray(...)` 与 `Object.isFrozen(...)` 两条断言：只有
   * 它们会在导出从"冻结数组快照"改回"直接导出内部 Set"（或任何未冻结的可变结构）
   * 时真的变红。 */
  try { JS_MIME_TYPES.push('text/foobar'); } catch (e) { /* 冻结数组 push 预期抛错，忽略 */ }
  try { KNOWN_NON_JS_SCRIPT_TYPES.length = 0; } catch (e) { /* 同上 */ }

  const html = '<!doctype html><html><body><script type="text/foobar">const RESERVED=[1];</script>' +
    '<script>const META = {"week":1};</script></body></html>';
  let caught = null;
  try { loadData(html, true); } catch (e) { caught = e; }
  assert(caught, '27：text/foobar 仍应是未知 type 被拒绝（这一步本身对"冻结"没有分辨力，见上方 L-4 注释——导出快照与内部 Set 是两个绑定，mutate 快照物理上就碰不到内部判断，不管快照有没有冻结）');
  assert.equal(caught.code, 'unsupported-script-type', `27：应仍是 unsupported-script-type，实际：${caught.code}`);

  console.log('PASS load_data_ast（27/④/L-4：导出的两份清单是冻结数组快照，mutate 尝试不影响内部真实分类逻辑，内部私有 Set 与导出快照是两份不同的绑定）');
}

// ============================================================================
// 28. ⑤ 预筛 L3（第三轮，2026-09-11）：findTopLevelSoundsAssignments 改前不做行尾
//    注释延伸，与 findTopLevelDeclarations 是两套切片口径——export_data.js 把两个
//    函数的结果拼进同一份 chunks 输出，会出现"const 声明带行尾注释、SOUNDS 赋值
//    不带"的不一致。现在统一复用 js_ast.js 里同一套
//    parseScriptCollectingComments + extendPastTrailingSameLineComments。
// ============================================================================
{
  // 28a：直接单测 js_ast.js 的 findTopLevelSoundsAssignments。
  const body = "const SOUNDS = {};\nSOUNDS.a = {x:1};   /* 音素 a 的注释 */\nconst META = {\"week\":1};";
  const assigns = findTopLevelSoundsAssignments(body);
  assert.equal(assigns.length, 1, '28a 前提：应找到 1 条顶层 SOUNDS 赋值');
  assert.equal(assigns[0].text, 'SOUNDS.a = {x:1};   /* 音素 a 的注释 */',
    `28a：SOUNDS 赋值应与 findTopLevelDeclarations 同款保留同一行紧随其后的行尾注释，实际：${JSON.stringify(assigns[0].text)}`);

  // 28b：端到端——loadData 里的 chunk 拼接不应因为多了行尾注释而受影响（注释不
  // 影响 vm 求值，只是现在也被正确地一并纳入 SOUNDS 赋值的切片）。
  const html = wrapScript([
    'const META = {"week":1};',
    "const RESERVED = ['a'];",
    'const SOUNDS = {};',
    'SOUNDS.a = {x:1};   /* 音素 a 的注释 */'
  ].join('\n'));
  const box = loadData(html, true);
  assert.equal(box.META && box.META.week, 1, '28b：端到端加载不受 SOUNDS 赋值行尾注释影响');
  assert.deepEqual({ ...box.SOUNDS.a }, { x: 1 }, '28b：SOUNDS.a 应正确加载');

  console.log('PASS load_data_ast（28/⑤/L3：findTopLevelSoundsAssignments 与 findTopLevelDeclarations 现在统一复用同一套行尾注释延伸逻辑，不再是两套切片口径）');
}

// ============================================================================
// 29. M-1（预筛 medium，第四轮，2026-09-11）：scriptTypeAttr 改前把"属性缺失/值
//    trim 后为空——按 HTML 规范都应视为 JS"与"属性值非空、但按 `;` 截断参数 + trim
//    后 essence 为空——不是合法 MIME type essence，不是 JS"两种情况都折叠成同一个
//    ''，后者因此被误当 JS 收进待解析来源（方向是"误读"，不是本文件其它地方反复
//    强调的"漏读"——不报错，只是读了一段页面上按规范永远不会执行的数据）。
//    scriptTypeAttr 现在对后一种情况返回 null（不命中 JS_MIME_TYPES 的 '' 项），
//    前一种情况仍返回 ''，两者不再混淆。
//
// 破坏验证（实测，复制文件副本验证，未使用 git checkout/stash）：把 rawScriptType
// 里 `if (raw.trim() === '') return { essence: '', raw };` 这一行删掉（退回"trim
// 后为空"与"截断+trim 后 essence 为空"共用同一条 `raw.split(';')[0].trim()` 路径）
// ——实测最先变红的是 **29a**，不是原以为的 29c/29d：删掉这行后 `essence ===
// '' ? null : essence` 这一步对"trim 后为空"（type=""）与"截断+trim 后为空"
// （;charset=utf-8）两种情况一视同仁地都转成 null，29a 从 AssertionError 报出
// `实际：null`（期望 ''）。29c/29d 本来就期望 null，不受这处删除影响，不是本条
// 破坏验证的分辨点——29a/29b 才是。
// ============================================================================
{
  // 29a/29b：属性缺失、值 trim 后为空——按规范都应按 JS 处理，essence 为 ''。
  assert.equal(scriptTypeAttr(' type=""'), '', `29a：type="" 应按 JS 处理（essence=''），实际：${JSON.stringify(scriptTypeAttr(' type=""'))}`);
  assert.equal(scriptTypeAttr(' type="   "'), '', `29b：type="   "（纯空白）应按 JS 处理（essence=''），实际：${JSON.stringify(scriptTypeAttr(' type="   "'))}`);

  // 29c/29d：属性值非空，但按 `;` 截断参数 + trim 后没有 essence——不是 JS，essence
  // 应为 null，不应与"确实应该按 JS 处理"的 '' 混为一谈。
  assert.equal(scriptTypeAttr(' type=";charset=utf-8"'), null,
    `29c：type=";charset=utf-8" 整串非空但没有合法 essence，应返回 null（不应与 '' 混淆而被当 JS 收下），实际：${JSON.stringify(scriptTypeAttr(' type=";charset=utf-8"'))}`);
  assert.equal(scriptTypeAttr(' type="  ;x"'), null,
    `29d：type="  ;x" 同理，截断参数后 trim 为空，应返回 null，实际：${JSON.stringify(scriptTypeAttr(' type="  ;x"'))}`);

  // 29e：端到端——两条"按 JS 收下"的形态应被正常加载；两条"没有合法 essence"的
  // 形态应让 collectScriptSources/loadData 响亮报错 unsupported-script-type，不是
  // 静默收下也不是静默跳过。
  {
    const htmlOk = '<!doctype html><html><body>' +
      '<script type="">const META = {"week":1};</script>' +
      '<script type="   ">const RESERVED = [\'ok1\',\'ok2\'];</script>' +
      '</body></html>';
    const sourcesOk = collectScriptSources(htmlOk, true);
    assert.equal(sourcesOk.length, 2, `29e：type="" 与 type="   " 都应被正常收下为 JS 来源，实际收下 ${sourcesOk.length} 条`);
    const boxOk = loadData(htmlOk, true);
    assert.equal(boxOk.META && boxOk.META.week, 1, '29e：type="" 的 META 应能正常加载');
    assert.deepEqual([...boxOk.RESERVED], ['ok1', 'ok2'], '29e：type="   " 的 RESERVED 应能正常加载');
  }
  {
    const htmlBad = '<!doctype html><html><body>' +
      '<script>const META = {"week":1};</script>' +
      '<script type=";charset=utf-8">const RESERVED = [\'from\',\'charset\',\'attr\'];</script>' +
      '</body></html>';
    let caught = null;
    try { collectScriptSources(htmlBad, true); } catch (e) { caught = e; }
    assert(caught, '29e：type=";charset=utf-8" 应该让 collectScriptSources 响亮报错，不是静默收下');
    assert.equal(caught.code, 'unsupported-script-type', `29e：错误码应为 unsupported-script-type，实际：${caught.code}`);
    assert.equal(caught.scriptType, ';charset=utf-8',
      `29e：错误应带上原始属性值 scriptType=";charset=utf-8"（展示用户写了什么，不是内部分类结果 null），实际：${caught.scriptType}`);

    let caughtLoadData = null;
    try { loadData(htmlBad, true); } catch (e) { caughtLoadData = e; }
    assert(caughtLoadData, '29e：生产入口 loadData() 同一份文档也应抛错');
    assert.equal(caughtLoadData.code, 'unsupported-script-type', `29e：loadData() 错误码应为 unsupported-script-type，实际：${caughtLoadData.code}`);
  }

  console.log('PASS load_data_ast（29/M-1：scriptTypeAttr 用 null 区分"属性值非空但没有合法 essence"与 ""代表的"确实应该按 JS 处理"，前者不再被误当 JS 静默收下，落到 unsupported-script-type）');
}

// ============================================================================
// 30. M-2（预筛 medium，第四轮，2026-09-11）：SCRIPT_TAG_RE 改前的属性捕获组
//    `(?:\s[^>]*)?`（L-3，第三轮）只放开了"以空白开头"，`<script/type="module">`
//    （"script" 后直接跟 `/`，中间没有空白）仍然整个匹配不上——标签连同内容被整个
//    跳过，连"报错"的机会都没有，比静默漏读更彻底。属性组放宽为
//    `(?:[\s/][^>]*)?` 后，这个真实可达的浏览器形态（HTML 分词器在
//    self-closing-start-tag 状态遇到非 `>` 字符会把 `/` 当解析错误跳过、退回
//    before-attribute-name 状态）现在应被正确识别为一个 module 脚本并响亮拒绝。
//
// 破坏验证：把 SCRIPT_TAG_RE 改回 `/<script((?:\s[^>]*)?)>([\s\S]*?)<\/script>/gi`
// （退回 L-3 第三轮的版本），30a 里 `collectScriptEntries(html, true)` 不再抛错
// （整个 module 标签被静默跳过，扫描直接找到紧随其后的真实 <script>），
// `assert(caught, ...)` 从 PASS 变 AssertionError（复制文件副本验证，未使用
// git checkout/stash）。30b 钉死 L-3 的护栏没有被这次放宽削弱——`<scriptx>` 依旧
// 不被当作 <script> 标签。
// ============================================================================
{
  // 30a：无空白的 `<script/type="module">` 应被识别为一个 module 标签并响亮拒绝，
  // 不应该被整段跳过。
  const html = '<!doctype html><html><body>' +
    '<script/type="module">const X=1;</script>' +
    '<script>const META = {"week":1};</script>' +
    '</body></html>';

  let caught = null;
  try { collectScriptEntries(html, true); } catch (e) { caught = e; }
  assert(caught, '30a：<script/type="module">（无空白斜杠前缀）应被识别为 <script> 标签并因 module 类型报错，不应被整个跳过');
  assert.equal(caught.code, 'unsupported-script-type', `30a：错误码应为 unsupported-script-type，实际：${caught.code}`);
  assert.equal(caught.scriptType, 'module', `30a：应带上 scriptType="module"，实际：${caught.scriptType}`);
  assert.equal(caught.scriptIndex, 0, `30a：module 标签是文档里第 0 个 <script>，实际 scriptIndex：${caught.scriptIndex}`);

  let caughtLoadData = null;
  try { loadData(html, true); } catch (e) { caughtLoadData = e; }
  assert(caughtLoadData, '30a：生产入口 loadData() 同一份文档也应抛错，不应该悄悄把 module 标签跳过后仍正常加载出 META');
  assert.equal(caughtLoadData.code, 'unsupported-script-type', `30a：loadData() 错误码应为 unsupported-script-type，实际：${caughtLoadData.code}`);

  // 30b：护栏回归——L-3（第三轮）要挡的 `<scriptx>` 不应该被这次放宽误判成
  // <script> 标签（"x" 既不是空白也不是 '/'）。
  const htmlGuard = '<!doctype html><html><body><scriptx foo="bar">not a script</scriptx>' +
    '<script>const META = {"week":1};const RESERVED=[\'a\'];</script></body></html>';
  const entriesGuard = collectScriptEntries(htmlGuard, true);
  assert.equal(entriesGuard.length, 1, `30b：<scriptx> 不应被当成 <script> 标签收下，应只收到真正的 1 个 <script>，实际收下 ${entriesGuard.length} 条`);
  const boxGuard = loadData(htmlGuard, true);
  assert.equal(boxGuard.META && boxGuard.META.week, 1, '30b：<scriptx> 干扰下真正的 <script> 仍应正常加载');

  console.log('PASS load_data_ast（30/M-2：SCRIPT_TAG_RE 属性组放宽为 (?:[\\s/][^>]*)? 后，<script/type="module">（无空白斜杠前缀）不再被整段静默跳过，正确识别为 module 并响亮拒绝；L-3 对 <scriptx> 的护栏未被削弱）');
}

// ============================================================================
// 31. L-1（预筛 low，第四轮，2026-09-11）：parseStartTagAttributes 改前的注释
//    写"防御性：理论上不会触发"，但 `<script ="x" type="module">` 是一个真实可达
//    的输入——跳过前导空白后停在 '='，attribute-name 状态因为 '=' 满足终止条件
//    立即结束（nameStart===i），这条分支确实会被走到，且是全函数唯一的防死循环
//    闸门，不是可以安全删掉的死代码。
//
// 破坏验证：把 `if (i === nameStart) { i += 1; continue; }` 改成
// `if (i === nameStart) { continue; }`（去掉 `i += 1`——"按注释所说，这条理论上
// 不会触发，删掉推进逻辑应该没关系"），31a 会挂死（i 永远停在同一个位置，无限
// 循环），不是断言失败——用带超时的独立探针跑这条输入验证会挂死，不放进主测试
// 流程本身（复制文件副本验证，未使用 git checkout/stash）。
// ============================================================================
{
  // 31a：'=' 排在属性名位置的最前面（没有名字），后面紧跟真正的 type="module"——
  // 不应死循环，且应正确跳过这个无法组成属性名的 '='，继续解析出 type=module。
  const got = scriptTypeAttr(' ="x" type="module"');
  assert.equal(got, 'module',
    `31a：'=' 打头的畸形片段不应导致死循环，应被跳过后正确解析出紧随其后的 type="module"，实际：${JSON.stringify(got)}`);

  // 31b：端到端——同一形态出现在真实 <script> 标签属性串里，也应正确识别为 module
  // 并响亮拒绝（不是挂死，也不是把 type 判成别的东西）。
  const html = '<!doctype html><html><body><script ="x" type="module">const X=1;</script>' +
    '<script>const META = {"week":1};</script></body></html>';
  let caught = null;
  try { collectScriptSources(html, true); } catch (e) { caught = e; }
  assert(caught, '31b：<script ="x" type="module"> 应被正确识别为 module 并报错');
  assert.equal(caught.code, 'unsupported-script-type', `31b：错误码应为 unsupported-script-type，实际：${caught.code}`);
  assert.equal(caught.scriptType, 'module', `31b：应带上 scriptType="module"，实际：${caught.scriptType}`);

  console.log('PASS load_data_ast（31/L-1：parseStartTagAttributes 的防死循环闸门是真实可达路径（"=" 打头的畸形属性片段），不是死代码；跳过该字符后能继续正确解析后续的 type="module"）');
}

// ============================================================================
// 32. L-3（预筛 low，第四轮，2026-09-11）：extendPastTrailingSameLineComments 的
//    `^[ \t]*$` 只认 ASCII 空格/制表符，NBSP（U+00A0）落在声明语句末尾与行尾注释
//    之间时会被判定为"非空白"，导致注释延伸提前停止——放宽为 `^[^\S\r\n]*$` 后应
//    正确保留。
//
// 破坏验证：把 js_ast.js extendPastTrailingSameLineComments 里的
// `/^[^\S\r\n]*$/` 改回 `/^[ \t]*$/`，32a 会从"注释被保留"变成"注释丢失"，从
// PASS 变 AssertionError（复制文件副本验证，未使用 git checkout/stash）。
// ============================================================================
{
  // 32a：声明语句末尾与行尾注释之间夹着一个 NBSP（U+00A0），注释应仍被视为"紧随
  // 其后"，完整纳入抽取文本。
  const body = 'const RESERVED = [\'a\']; /* 说明 */';
  const html = wrapScript(body);
  const text = declaration(html, 'RESERVED');
  assert.equal(text, 'const RESERVED = [\'a\']; /* 说明 */',
    `32a：NBSP 分隔的行尾注释应被完整保留，实际：${JSON.stringify(text)}`);

  // 32b：正向回归——真正的换行仍然必须终止延伸，不能因为放宽 Unicode 空白而连
  // 换行也放过（`^[^\S\r\n]*$` 显式排除 \r/\n，与 32a 用的 NBSP 是两类不同字符）。
  const body2 = "const RESERVED = ['a'];\n/* 独立一行的注释，不应被吞并 */";
  const html2 = wrapScript(body2);
  const text2 = declaration(html2, 'RESERVED');
  assert.equal(text2, "const RESERVED = ['a'];",
    `32b：真正的换行仍应终止注释延伸，不应被 Unicode 空白放宽误伤，实际：${JSON.stringify(text2)}`);

  console.log('PASS load_data_ast（32/L-3：extendPastTrailingSameLineComments 放宽为 Unicode 空白类后，NBSP 分隔的行尾注释被正确保留，真正的换行仍然正确终止延伸）');
}

// ============================================================================
// 33. R-1（HIGH·轮 K 外审判定为本次 U1 引入的回归，2026-09-11）：export_data.js
//    改前没有同步 loadData() 自己的 H-2 多声明去重——一条语句声明多个 NAME 时
//    （`const META={...}, RESERVED=[...];`），declaration(raw,'META') 与
//    declaration(raw,'RESERVED') 各自返回整条语句文本，被同一条语句重复推入导出
//    文件的 chunks 两次，导出文件因此含两条相同的 const 语句、无法被 loadData()
//    再次解析。外审明确指出现有测试集完全没有覆盖过导出器本身（用例 13 只检查
//    loadData，即使导出路径一直损坏也会通过）。这里补一条端到端往返回归：真的
//    跑一遍 export_data.js CLI（子进程，与真实调用方 tools/extract_data_layer.py
//    的用法一致），再用 loadData() 加载导出结果，比对数据与原始输入一致。
//
// 破坏验证：把 export_data.js 里 nameToDeclarationText 的调用换回改前的
// `const value=declaration(raw,name); if(value) chunks.push(value);`（不做跨
// NAME 去重），33 前提断言（"const META = ..., RESERVED = ...;" 只应出现 1 次）
// 会从 1 次变 2 次，随后 loadData(exported,false) 会抛出未包装的 SyntaxError
// （"Identifier 'META' has already been declared"），两处均从 PASS 变
// AssertionError（复制文件副本验证，未使用 git checkout/stash）。
// ============================================================================
{
  const declLine = "const META = {\"week\":1}, RESERVED = ['a','b','c'];";
  const body = [declLine, OTHER_NAMES_BODY].join('\n');
  const html = wrapScript(body);

  const tmpDir = os.tmpdir();
  const pid = process.pid;
  const targetPath = path.join(tmpDir, 'test_export_data_target_' + pid + '.html');
  const outPath = path.join(tmpDir, 'test_export_data_out_' + pid + '.js');
  fs.writeFileSync(targetPath, html, 'utf8');
  try {
    const exportScript = path.join(__dirname, '..', '..', 'tools', 'validation', 'export_data.js');
    execFileSync('node', [exportScript, targetPath, outPath], { encoding: 'utf8' });

    const exported = fs.readFileSync(outPath, 'utf8');
    // 33 前提：改前的 bug 会让 exported 里出现两次同一条 const 语句——这里先直接
    // 检查导出文本本身不重复，给出比"loadData 能不能解析"更直接的证据。
    const occurrences = exported.split(declLine).length - 1;
    assert.equal(occurrences, 1,
      `33 前提：导出文件里 "${declLine}" 这条语句应恰好出现 1 次，实际 ${occurrences} 次——导出内容：${JSON.stringify(exported)}`);

    let caught = null;
    let reloaded = null;
    try { reloaded = loadData(exported, false); } catch (e) { caught = e; }
    assert.equal(caught, null,
      `33：导出结果应能被 loadData 正常再次解析（数据层 JS 入口形态，html=false），不应报错，实际抛出：${caught && caught.constructor && caught.constructor.name}: ${caught && caught.message}`);
    assert.equal(reloaded.META && reloaded.META.week, 1, '33：往返后 META 应与原始输入一致');
    assert.deepEqual([...reloaded.RESERVED], ['a', 'b', 'c'], '33：往返后 RESERVED 应与原始输入一致（未被同一条语句的重复推入破坏）');
  } finally {
    fs.unlinkSync(targetPath);
    fs.unlinkSync(outPath);
  }

  console.log('PASS load_data_ast（33/R-1：export_data.js CLI 往返回归——一条语句声明多个 NAME 时不再被重复推入 chunks，导出结果能被 loadData 正常再次解析且数据与原始输入一致）');
}

// ============================================================================
// 34. R-2（MEDIUM·按 HIGH 优先级对待，轮 K 外审，2026-09-11）：属性/标签扫描必须
//    用 HTML 规范的 ASCII 空白集合（TAB/LF/FF/CR/SPACE），不能用 JS 正则的 `\s`
//    ——`\s` 额外匹配 NBSP（U+00A0）等 Unicode 空白，真实浏览器不把 NBSP 当属性
//    分隔符。外审反例：
//      <script data-x="v" type="application/json">const RESERVED=['real'];</script>
//    这里两个属性之间是 NBSP，不是普通空格——真实浏览器认为这里根本不存在一个
//    独立的 "type" 属性，整段标签内容就是普通 JS 会被执行；改前用 `\s` 扫描会把
//    NBSP 误判成分隔符，凭空"切"出一个本不存在的 type="application/json"，命中
//    KNOWN_NON_JS_SCRIPT_TYPES，这份真实 JS 来源因此被整段静默漏读（若文档另有
//    正常 META，loadData 会成功返回但漏掉这个 <script> 里的 RESERVED，不报错——
//    方向是漏读，不是本文件其它地方论证过的"更容易产生一次可见拒绝的安全"）。
//
// 破坏验证：把 parseStartTagAttributes 里的 `[\t\n\f\r ]`/`[\t\n\f\r =\/]` 改回
// `\s`/`[\s=\/]`，34a 的 attrs[1].name 会从一个含 NBSP 的怪异名字变回纯 'type'，
// 34b 的 sources.length 会从 1 变 0、box.RESERVED 会变成 undefined，三处断言均从
// PASS 变 AssertionError（复制文件副本验证，未使用 git checkout/stash）。
// ============================================================================
{
  // 34a：直接单测 parseStartTagAttributes——NBSP 不应被当成属性分隔符，"type" 会
  // 与前面的 NBSP 粘成一个不存在于任何已知属性名的怪异名字，不应该被识别成独立的
  // "type" 属性。
  const attrs = parseStartTagAttributes(' data-x="v" type="application/json"');
  assert.equal(attrs.length, 2,
    `34a：NBSP 不应被当成分隔符，应仍只切出 2 个"属性"（data-x 与被 NBSP 粘住的怪异名字），实际：${JSON.stringify(attrs)}`);
  assert.equal(attrs[0].name, 'data-x', `34a：第一个属性名应为 data-x，实际：${JSON.stringify(attrs)}`);
  assert.notEqual(attrs[1].name, 'type',
    `34a：NBSP 后的 "type" 不应被识别成独立的 type 属性名（真实浏览器不认 NBSP 为分隔符），实际属性名：${JSON.stringify(attrs[1].name)}`);
  assert(attrs.every(a => a.name !== 'type'),
    `34a：全部属性里都不应该存在一个名字恰好是 "type" 的条目，实际：${JSON.stringify(attrs)}`);

  // 34b：端到端——含 NBSP 的 <script> 应被当成真实 JS 来源收下并正常加载，不应被
  // 误判成 application/json 而静默跳过、漏读其中的 RESERVED。
  const html = '<!doctype html><html><body>' +
    '<script data-x="v" type="application/json">const META = {"week":1};const RESERVED=[\'real\'];</script>' +
    '</body></html>';
  const sources = collectScriptSources(html, true);
  assert.equal(sources.length, 1,
    `34b：含 NBSP 的 <script> 不应被误判为 application/json 而跳过，应作为 JS 来源收下，实际收下 ${sources.length} 条`);
  const box = loadData(html, true);
  assert.equal(box.META && box.META.week, 1, '34b：META 应能正常加载');
  assert.deepEqual([...box.RESERVED], ['real'],
    `34b：NBSP 不应导致 RESERVED 被静默漏读，实际：${JSON.stringify(box.RESERVED)}`);

  console.log('PASS load_data_ast（34/R-2：属性/标签扫描改用 HTML 规范的 ASCII 空白集合后，NBSP 不再被误判成属性分隔符——不会凭空切出一个不存在的 type 属性，真实 JS 来源不再被静默漏读）');
}

// ============================================================================
// 35. R-3（MEDIUM，轮 K 外审，2026-09-11）：declaration() 在 direct.status===
//    'absent'（raw 本身作为一份独立脚本解析成功、只是没有这个顶层声明）时必须
//    立即返回 ''，不能继续尝试把 raw 当 HTML 用正则扫描——外审反例：
//      const template = "<script>const RESERVED=['fake'];</script>";
//    这是一份能成功解析的纯 JS（顶层只有 template 一个声明），但 raw 本身含有
//    一段"看起来像 <script> 标签"的文本（藏在字符串字面量*内容*里）。改前的实现
//    只在 sources.length===0 分支里检查 direct.status==='absent'，而这份输入的
//    collectScriptSources(raw,true) 会用正则从字符串内容里"提取"出一个虚假来源
//    （sources.length===1，不是 0），那条 absent 短路完全没有机会被执行到，后面
//    的 for 循环会真的解析这份假来源，把假的 RESERVED 声明当真返回——这条旁路不
//    经过 legacyTextDeclaration，现有用例 17、21 都没覆盖。模板字符串是同一类
//    问题的另一种写法，一并覆盖。
//
// 破坏验证：把 declaration() 里新提前的 `if (direct.status === 'absent')
// return '';` 挪回原位置（只留在 sources.length===0 分支内），35a/35b 会从返回
// '' 变成返回假来源里的 "const RESERVED=['fake'];"，断言从 PASS 变
// AssertionError（复制文件副本验证，未使用 git checkout/stash）。
// ============================================================================
{
  // 35a：纯 JS 字符串字面量里藏着一段假 <script> 标签文本。
  const source1 = "const template = \"<script>const RESERVED=['fake'];</script>\";";
  const text1 = declaration(source1, 'RESERVED');
  assert.equal(text1, '',
    `35a：RESERVED 只出现在字符串字面量*内容*里的假 <script> 标签内，declaration() 应返回 ''，不应该把这段假声明当真返回，实际：${JSON.stringify(text1)}`);

  // 35b：模板字符串同理，是同一类问题的另一种写法。
  const source2 = "const template = `<script>const RESERVED=['fake'];</script>`;";
  const text2 = declaration(source2, 'RESERVED');
  assert.equal(text2, '',
    `35b：模板字符串里的假 <script> 标签同理不应被当真，declaration() 应返回 ''，实际：${JSON.stringify(text2)}`);

  console.log('PASS load_data_ast（35/R-3：direct.status===\'absent\' 时 declaration() 立即短路返回 \'\'，不再尝试把 raw 当 HTML 扫描——字符串/模板字符串字面量内容里的假 <script> 标签不再被误当真实声明来源）');
}

// ==============================================================================
// 36. R-5（LOW，轮 K 外审，2026-09-11）：extendPastTrailingSameLineComments 的间隙
//    判据改前只显式排除了回车与换行这两个字符，但 U+2028（行分隔符）
//    与 U+2029（段分隔符）同样是 ECMA-262 定义的真正行终止符，与回车/
//    换行同等地位，却仍然会被改前的判据当成"普通空白"放过——
//    声明语句与紧随其后的注释之间如果只隔着 U+2028，本该被当成
//    "下一行"的独立注释会被错误并入声明的切片。声明与 SOUNDS 赋值
//    两条路径共用同一个 extendPastTrailingSameLineComments 实现
//    （见 js_ast.js 用例 28 的背景），这里各自补一条边界测试。
//
// 破坏验证：把 js_ast.js 里的判据改回去掉对这两个码点的排除（36a/36c 会从
// "注释不被并入"变成"注释被并入"，断言从 PASS 变 AssertionError
// （复制文件副本验证，未使用 git checkout/stash）。
// ==============================================================================
{
  // 36a：声明路径——U+2028 之后的注释不应被并入 RESERVED 的抽取文本。
  const bodyDecl = "const RESERVED=['a'];" + "\u2028" + "/* 独立注释，只隔着 U+2028 */";
  const htmlDecl = wrapScript(bodyDecl);
  const textDecl = declaration(htmlDecl, 'RESERVED');
  assert.equal(textDecl, "const RESERVED=['a'];",
    `36a：U+2028 之后的注释不应被并入声明的抽取文本，实际：${JSON.stringify(textDecl)}`);

  // 36b：U+2029 同理。
  const bodyDecl2 = "const RESERVED=['a'];" + "\u2029" + "/* 独立注释，只隔着 U+2029 */";
  const htmlDecl2 = wrapScript(bodyDecl2);
  const textDecl2 = declaration(htmlDecl2, 'RESERVED');
  assert.equal(textDecl2, "const RESERVED=['a'];",
    `36b：U+2029 之后的注释同样不应被并入声明的抽取文本，实际：${JSON.stringify(textDecl2)}`);

  // 36c：SOUNDS 赋值路径——两条路径共用同一个 extendPastTrailingSameLineComments
  // 实现，这里独立覆盖，不依赖声明路径已经测过就默认它也对。
  const bodySounds = "const SOUNDS = {}; SOUNDS.a = {x:1};" + "\u2028" + "/* 独立注释，只隔着 U+2028 */";
  const assignsSounds = findTopLevelSoundsAssignments(bodySounds);
  assert.equal(assignsSounds.length, 1, '36c 前提：应找到 1 条顶层 SOUNDS 赋值');
  assert.equal(assignsSounds[0].text, 'SOUNDS.a = {x:1};',
    `36c：SOUNDS 赋值路径下，U+2028 之后的注释同样不应被并入抽取文本，实际：${JSON.stringify(assignsSounds[0].text)}`);

  console.log('PASS load_data_ast（36/R-5：extendPastTrailingSameLineComments 的间隙判据同时排除 U+2028/U+2029 后，这两个真正的 JS 行终止符不再被误当"同一行的空白"——声明与 SOUNDS 赋值两条路径均已覆盖）');
}

console.log('PASS load_data_ast：全部用例通过');
