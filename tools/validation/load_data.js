const vm = require('node:vm');
const { findTopLevelDeclarations, findTopLevelSoundsAssignments } = require('./js_ast');
/* ③ 主会话裁定（第三轮预筛，2026-09-11）：本文件不再引用 tools/validation/js_lex.js。
 * 改前这里借它的 maskStringsAndComments 给 hasInlineMeta 的 META_DECLARATION_RE 文本
 * 旁证做注释/字符串掩码（M-B 修复，第二轮）——第三轮实测这条旁证被正则字面量与
 * 掩码扫描器双向骗倒（反引号让掩码提前配对、诱饵原样留下→假阳性；反向构造把 META
 * 之后整份文本抹成空格→假阴性），js_lex 退役的理由（不识别正则字面量）原样继承到
 * 了这条旁证上。裁定不再消歧、直接让 duplicate-declaration 向上传播，见 hasInlineMeta
 * 头注释——旁证被删除后本文件不再需要 maskStringsAndComments，js_lex.js 在本文件侧
 * 零消费者（grep 确认，见 U2 收口报告），它现在唯一的消费者是
 * tools/validation/migration_audit.js 的 scanState。 */
const NAMES = 'META RESERVED SOUNDS W WALL_HINT BOOK FIRST_TEACH_DAY G1_ROUNDS G1_THEME G3_PAIRS G4_WORDS G5_WHITELIST DAYS RESERVED_RETEST PROBE_A PROBE_B GLOBAL_RESERVED ASSESS_TEXT ASSESSMENT_WORDS TAUGHT_SIGHT ANNUAL_DECODING'.split(' ');

/* ============================================================================
 * 段 4 U1（2026-09-11）：顶层声明发现/抽取全面改走 AST（tools/validation/js_ast.js，
 * 底层是 vendor 的 acorn，见 tools/vendor/README.md）。退役 tools/validation/js_lex.js
 * 的正则 + 括号深度近似方案——它不再被本文件引用，退役说明见该文件头注释。
 *
 * 根治的问题（轮 J 外审 high H1，2026-09-10）：改前 countDeclarationOccurrences()
 * （计数，括号深度感知）与 declaration()（抽取，纯文本第一次匹配）是两套独立实现，
 * 对同一份输入可能给出不一致的判断——某个辅助函数内部的局部同名 const 若排在真实
 * 顶层声明*之前*，计数说"只有 1 个顶层声明"（判断正确，局部的不算数），抽取却选中
 * 了排在前面的那个局部声明（只看文本顺序，不看是不是真的顶层）——loadData() 因而
 * 会静默返回错误数据。现有回归测试只断言"不抛错"，没有断言返回值，这个 bug 曾经
 * 被放行（见 tests/unit/test_grapheme_migration.js 的 H1 复现用例）。
 *
 * 另两条根因（轮 J 外审 medium）：js_lex 的状态机不识别正则字面量（`/\{/` 这类合法
 * 正则里的未配对括号会让括号深度统计永久漂移，正则里的引号/反引号会让扫描器误入
 * 字符串状态）；"顶层声明必须单行分号结尾或顶格 `};`/`];` 结尾"这条格式契约依赖
 * 换行/缩进形态，容易被未来的自动格式化或人工改写打破。AST 不依赖这两条脆弱假设——
 * acorn 是完整的 ES 解析器，正则字面量、任意缩进/换行都是它的常规输入。
 *
 * 架构决定：loadData() 逐个 <script> 分别解析，不拼接后再解析。
 *   ① 保留逐脚本独立的解析边界，使每个 <script> 内部的语法错误与声明位置都能被
 *      独立定位到原始文档里的具体标签，不会因为拼接而报出"拼接后大文本第几行"
 *      这种脱离原始文档结构的坐标。跨脚本的同名顶层声明该不该算重复，交给应用层
 *      （findAllTopLevelDeclarations 的 Map 归并）统一检测、统一报告结构化的
 *      duplicate-declaration 错误码，不靠拼接后让 JS 引擎自己去发现冲突。
 *      （R-4 修复，轮 K 外审，2026-09-11：这一条改前的理由是错的——原文写"两个
 *      script 各自声明一个同名 `let x` 本来完全合法"、"每个 <script> 是独立顶层
 *      作用域"。事实并非如此：普通经典脚本虽然各自解析为独立的 Program，但在浏览器
 *      里共享同一个页面级全局环境，后执行的脚本再次声明同名顶层 `let`/`const` 会
 *      触发真实的声明冲突（SyntaxError），不是"完全合法"。这里已删除这条错误理由，
 *      换成上面"保留独立解析边界，让错误定位与重复检测各司其职"这条站得住的理由——
 *      逐脚本解析的实现本身没有错，错的只是原来给它编的那条理由。）
 *   ② acorn 遇到同一作用域内重复 `const` 会直接抛 SyntaxError——拼接后解析会把
 *      "跨 script 同名声明"这件我们正要检测并报 duplicate-declaration 的事，变成
 *      一个语法错误，错误码就对不上契约了（与①同一件事的另一面：我们自己的结构化
 *      错误分类职责，不该外包给 JS 引擎的原生报错机制）。
 * 因此 loadData() 按 collectScriptSources() 拿到的每个 <script> 分别喂给 js_ast，
 * 用 Map（findAllTopLevelDeclarations）在应用层归并"哪个 NAME 在哪些 script 里各
 * 出现了几次"，不靠"拼一份大文本、让 JS 引擎自己去发现冲突"这种取巧方式。
 * ============================================================================ */

/* ============================================================================
 * 已知限制（轮 K 外审 2026-09-11，转下段处理，用户拍板不在本轮修复）：以下三条是
 * 外审指出、明确保留到下一段处理的既有行为，写在这里是为了不被误读成"没发现"或
 * "忘了修"——本轮只做了记录，没有改动对应的实现。
 *
 * 1. 加载器与导出器的执行顺序不一致。loadData() 先按 NAMES 顺序把全部声明推入
 *    chunks，再把全部 <script> 里的顶层 SOUNDS 赋值统一追加在最后（本文件下方
 *    loadData() 内"收口 B"注释处）；export_data.js 则是在按 NAMES 顺序处理到
 *    SOUNDS 这一项时，立即把该脚本的 SOUNDS 赋值插入到 SOUNDS 声明紧后面。两者对
 *    "声明与赋值的相对顺序会不会影响最终求值结果"这件事可能给出不同答案，触发
 *    输入：`const META={}; const SOUNDS={}; SOUNDS.a=1; const W=SOUNDS.a;`——
 *    原始脚本按源码顺序执行，W 的值是 1；loadData() 里 SOUNDS.a=1 被移到 W 的声明
 *    *之后* 才执行，W 是 undefined；export_data.js 导出的文件里 SOUNDS.a=1 仍在
 *    SOUNDS 声明后紧跟着（还在 W 之前），求值结果又与原始脚本一致——三者可能互不
 *    相同，是静默的值差异，不报错。这是既有行为（改前 loadData 就把 SOUNDS 赋值
 *    追加在最后、export_data 就在 SOUNDS 声明后立即插入，本轮 R-1 的修复没有触碰
 *    这个顺序），不是本轮引入的新问题。彻底修法是按源码位置把声明与 SOUNDS 赋值
 *    组装成同一个执行序列，加载器与导出器共用同一份组装逻辑，不是两边各自维护一套
 *    顺序规则。
 *
 * 2. 外层仍然用正则（SCRIPT_TAG_RE）在整份原始文本上扫描 <script> 标签，不理解
 *    HTML 注释、不理解带引号属性值内部的字符、也不区分源码位置。触发输入：
 *    `<!-- <script>const META={week:99};</script> --><script>const RESERVED=['a'];</script>`
 *    ——注释里的假 <script> 标签会被当成一份真实的数据来源，META 会被这份注释里
 *    的假声明覆盖，而不是被当成"整段都在注释里，不该参与扫描"。开始标签属性值里
 *    带引号的 `>`、合法但结束标签内部带空白的 `</script >`，这条正则同样没有正确
 *    处理。这也是既有行为（改前同样用正则扫整份 HTML，不是本轮引入的回归）。彻底
 *    修法是引入一个能保留源码位置信息的 HTML 解析器，或者实现一套引号感知的边界
 *    扫描器，对不支持的形态显式拒绝而不是给出一个看似合理、实际错误的结果。
 *
 * 3. AST 切片只保证抽取到的文本是一条完整合法的语句，不保证这条语句除了给 NAMES
 *    里的名字赋值之外，不会顺带执行别的东西。触发输入：
 *    `const META={week:1}, extra=(()=>{META.week=99;})();`——META 与 extra 是同一
 *    条 VariableDeclaration 语句里的两个 declarator，NAMES 只关心 META，但因为
 *    META 被选中，整条语句（含 extra 那个立即执行的箭头函数，它会把 META.week
 *    改写成 99）都会被原样推入 chunks 交给 vm 执行。这个加载器的前置条件是"输入
 *    必须可信"（它读的是自家构建产物，不是任意用户输入）——不要把"AST 切片保证
 *    语句边界完整"或"vm.runInNewContext 带 timeout"当成对不可信输入的安全隔离
 *    证明，这两者从来没有打算提供这种保证。
 * ============================================================================ */

/* declaration(raw, name) -> string（导出 API，找不到返回 ''）
 *
 * 调用方既有传入"纯 JS 脚本文本"（frontend/src/weeks/week0N.data.js、
 * gen_segments.js 处理的数据文件、frontend/src/media/weekNN/*.js 媒体快照），也有
 * 传入"完整构建产物 weekNN.html"（media_declarations.js、capture_lesson_media.js、
 * tests/unit/test_media.js）——旧实现用纯文本正则，天然不区分这两种输入，直接在
 * 整份文本上找 "const NAME = " 字面量。AST 版本要保留"不管传进来的是纯 JS 还是
 * 完整 HTML 都能用"这个行为，但 acorn 不能把一份完整 HTML 文档当 JS 解析（开头
 * `<!doctype html>` 就会直接语法错误）——先按"raw 本身就是一份可独立解析的脚本"
 * 尝试；只有这一步解析失败，才退回"把 raw 当 HTML，按 <script> 标签逐个提取后再
 * 逐个尝试"这条路径。两条路径都用同一套 js_ast 语义，不是另起一套近似判断。
 *
 * 重复检测由 loadData() 负责（它知道完整的 NAMES 清单与 html 语境），declaration()
 * 只负责按顶层语义抽取——多处顶层同名时返回按脚本文档顺序找到的第一处，不报错、
 * 不去猜哪一份是"真的"（与旧实现"取第一次文本匹配"的宽容度一致，只是判定"是不是
 * 顶层"的手段从括号深度换成了 AST）。
 *
 * 契约（H-A 修复，预筛 high，2026-09-11）：返回文本包含与该声明**同一行、紧随其后**
 * 的行尾注释（js_ast.js findTopLevelDeclarations 用 acorn 的 onComment 收集，不是
 * 文本启发式），这不是可有可无的细节——tools/capture_lesson_media.js 会把
 * declaration() 的返回值原样写回受版本控制的 frontend/src/media/weekNN/<name>.js
 * 媒体快照文件，embed_assets.py 注入在那几份文件里的"勿手改"标记、以及数据层
 * week02/03.data.js 里 RESERVED、FIRST_TEACH_DAY 的行尾说明，都要靠这条行尾注释
 * 才不会在下一次媒体重采集时被静默删掉。
 *
 * 对任何解析失败一律宽容处理（跳过、继续尝试下一个来源，不抛错）——这是一个尽力
 * 而为的抽取工具，不是 loadData() 那样的入口把关，找不到就是找不到，不是本函数的
 * 职责去区分"为什么找不到"。**这条"不抛错"契约指的是"不因解析失败抛错"**：下方
 * legacyTextDeclaration 这条纯文本兜底路径，在遇到"找到了声明起始但缺闭合括号"
 * 这种真正损坏的输入时，仍会抛出 `Unterminated data declaration`（L-3 修复，
 * 2026-09-11：改前这里写"一律宽容处理……不抛错"，与该行为自相矛盾——那不是一次
 * "解析失败"，是纯文本兜底自己诊断出输入损坏到无法给出任何结果，抛错是它仅剩的
 * 诚实选项）。
 * ⛔ 安全级判定（顶层性判定、重复声明检测）一律走 loadData()，不要用本函数。本函数
 * 含一条纯文本启发式兜底路径（legacyTextDeclaration），在 AST 完全解析不了的输入
 * 上仍会尽力返回结果，那条路径的分辨力天然弱于 AST（缩进变体/正则字面量/模板字符串
 * 里的假收尾都可能骗过它）——这是给构建期工具"在已经损坏的文件里定位某个具体常量"
 * 用的，不是给校验器判断"这份数据能不能信"用的。
 *
 * 收口 A 附带修复（2026-09-11）：collectScriptSources 现在遇到未知 <script type="...">
 * （含但不限于 module，H-1 收口 C 把这个处置面从"仅 module"扩到"任何未知 type"，
 * 见下方 REJECTED_SCRIPT_TYPES/collectScriptEntries 头注释）会抛 unsupported-script-type
 * （见该函数注释），这与本函数"对任何解析失败一律宽容处理、不抛错"的自身契约矛盾
 * ——declaration() 不做安全判定，不该因为文档里某处有个不相干的未知 type 脚本，就
 * 连累到本来在别处能找到的 name 也抛错。这里捕获该错误码，按"这条 AST 路径这次拿
 * 不到来源列表"处理，继续走到下面的 legacyTextDeclaration 纯文本兜底（它不区分
 * <script> 标签的 type，只在整份原文上找文本）。
 *
 * M-2 修复（2026-09-11）：extractTopLevelDeclarationText 改前只返回 string|null，
 * null 同时代表两种含义不同的情况——"这份 source 解析失败，看不出任何顶层声明"
 * （unparsable）与"这份 source 解析成功，就是没有叫这个名字的顶层声明"（absent，
 * name 可能存在，只是嵌套在某个函数体/块内部，不是顶层）。declaration() 改前把
 * 两种 null 一视同仁，都允许退回下面的 legacyTextDeclaration 纯文本兜底——但
 * "absent"根本不是异常输入，是 AST 已经把话说完的正常结果，纯文本兜底完全可能在
 * 这种情况下找到那个嵌套/shadow 的同名声明并把它当真返回（实测：
 * `function f(){ const RESERVED = ['local','shadow']; }` 这种纯 JS 输入，
 * declaration(raw,'RESERVED') 会把这段局部声明的文本当"找到了"返回，而它的真实
 * 消费者之一 gen_segments.js:314 是拿这个结果去*改写文件*的）。现在
 * extractTopLevelDeclarationText 返回三态（found/absent/unparsable），
 * declaration() 只有在真的遇到过 unparsable 时才允许退回纯文本兜底；全程都是
 * "解析成功但没有这个顶层声明"（absent）时直接返回 ''，不再假装没看清楚。 */
function declaration(raw, name) {
  const direct = extractTopLevelDeclarationText(raw, name);
  if (direct.status === 'found') return direct.text;
  /* R-3 修复（轮 K 外审，2026-09-11）：direct.status === 'absent' 必须在这里立即
   * 返回 ''，不能像改前那样只写在下面 "sources.length === 0" 分支里——'absent' 只
   * 表示"raw 本身作为一份独立脚本解析成功、只是没有这个顶层声明"，不代表 raw 不含
   * 任何看起来像 <script> 标签的文本。外审反例：
   *   const template = "<script>const RESERVED=['fake'];</script>";
   * 这本身是一份能成功解析的纯 JS（direct.status==='absent'，顶层只有 template 一
   * 个声明），但下面 collectScriptSources(raw, true) 是纯正则扫描整份原始文本、不
   * 理解字符串字面量的边界，会从这个字符串*内容*里"提取"出一个虚假的 <script> 来
   * 源——sources.length 因此是 1，根本进不了 "sources.length === 0" 分支，改前那句
   * "if (direct.status === 'absent') return '';" 完全没有机会被执行到，后面的 for
   * 循环会真的去解析这份假来源，找到假的 RESERVED 声明并当真返回（外审用它证明这
   * 条旁路不经过 legacyTextDeclaration，现有用例 17、21 也没覆盖到 sources.length>0
   * 的这种场景）。现在提前到这里短路：raw 本身已经用 AST 从头到尾解析成功、确认过
   * 没有这个顶层声明时，根本不再尝试把 raw 当 HTML 扫描——'unparsable'（raw 本身不
   * 是一份可独立解析的脚本，比如真实 HTML 文档）才是唯一允许继续往下试 HTML 路径
   * 的状态。 */
  if (direct.status === 'absent') return '';
  let sources;
  try {
    sources = collectScriptSources(raw, true);
  } catch (e) {
    if (!e || e.code !== 'unsupported-script-type') throw e;
    sources = [];
  }
  if (sources.length === 0) {
    /* 到这里 direct.status 恒为 'unparsable'——'found'/'absent' 都已经在上面提前
     * 返回，raw 既不是一份可独立解析的脚本，也不含任何 <script> 标签，没有更多
     * 信息可用，退回纯文本兜底。 */
    return legacyTextDeclaration(raw, name);
  }
  /* direct 对"把整份 raw 当一份独立脚本解析"这一步，遇到真实 HTML 文档几乎总会
   * 失败（开头 `<!doctype html>` 就不是合法 JS）——这个失败只说明"raw 是 HTML
   * 不是裸脚本"，没有任何信息量，不计入下面"要不要退回纯文本兜底"的判断。真正
   * 有信息量的是逐个 <script> 标签各自的解析结果。 */
  let sawUnparsableSource = false;
  for (const source of sources) {
    const found = extractTopLevelDeclarationText(source, name);
    if (found.status === 'found') return found.text;
    if (found.status === 'unparsable') sawUnparsableSource = true;
  }
  if (!sawUnparsableSource) return ''; // 全部 <script> 都解析成功，就是没有这个顶层声明
  /* 段 4 U1 追加（2026-09-11，实测 tests/unit/test_baseline.py 通过 media_declarations.js
   * 暴露）：AST 解析是整份脚本级别的——脚本里任何一处语法问题（另一个不相干的常量
   * 声明重复、缺闭合括号）都会让*整份脚本*解析失败，连带这份脚本里其它原本完好无损
   * 的顶层声明也一并找不到。declaration() 的定位是"定位某一个具体常量"的独立工具
   * 函数（真实消费者：media_declarations.js / capture_lesson_media.js /
   * export_data.js / gen_segments.js，往往在真正执行提取前会先各自做自己的合法性
   * 检查，具体到"是这一个常量"的问题），不应该因为文件里与 name 无关的地方出问题、
   * 就连累到 name 自己明明写得好好的声明也被判"找不到"——那样反而会让调用方看到
   * 一个文不对题的"declaration not found"，掩盖了真正的问题所在（真正的问题可能是
   * 另一个常量重复声明，或另一个常量没写完，不是这个 name 本身）。
   * 兜底：退回改前的纯文本启发式（找到 "const NAME =" 后，单行以分号收尾，或多行
   * 则找下一处顶格 "};"/"];" 收尾）——只在至少一个 <script> 确实解析失败
   * （unparsable）时才用到，分辨力天然弱于 AST（缩进变体/正则字面量/模板字符串
   * 里的假收尾都可能骗过它），但这条路径本来就只覆盖"文件其它地方已经出了问题"
   * 这一种已经不正常的输入，不是现役产物的正常路径（四周现役产物整体可解析，走不
   * 到这里，见 U1 报告的实测）。 */
  return legacyTextDeclaration(raw, name);
}

/* legacyTextDeclaration(raw, name)：AST 途径均失败时的最后一道兜底，逻辑与本文件
 * AST 化之前的 declaration() 完全一致——纯文本正则定位 + "单行分号或顶格 };/];
 * 收尾"的启发式，不依赖 js_ast，也不依赖已退役的 js_lex。找不到该常量名返回 ''；
 * 找到了但没有可辨认的收尾（数据声明缺闭合括号）时抛出 Error（与改前行为一致，
 * 不是 loadData() 用的那几个带 code 字段的结构化错误——这条兜底路径本就是在
 * "已经不正常"的输入上尽力而为，调用方历来把这类异常当"提取失败"处理）。 */
function legacyTextDeclaration(raw, name) {
  const re = new RegExp('^[ \\t]*const\\s+' + name + '\\s*=', 'm');
  const m = re.exec(raw);
  if (!m) return '';
  const tail = raw.slice(m.index);
  const first = tail.split('\n')[0];
  if (/;/.test(first)) return first;
  const end = /^\s*[}\]];/m.exec(tail);
  if (!end) throw new Error(`Unterminated data declaration: ${name}`);
  return tail.slice(0, end.index + end[0].length);
}

/* extractTopLevelDeclarationText(source, name) -> {status: 'found', text} |
 *   {status: 'absent'} | {status: 'unparsable'}
 * M-2 修复（2026-09-11）：改前返回 string|null，null 混淆了"解析失败"
 * （unparsable）与"解析成功但没有这个顶层声明"（absent）两种含义不同的情况，
 * 调用方 declaration() 曾经把两者一视同仁地允许退回纯文本兜底。三态由调用方
 * （declaration()）区分处理，见其头注释。 */
function extractTopLevelDeclarationText(source, name) {
  let decls;
  try {
    decls = findTopLevelDeclarations(source);
  } catch (e) {
    if (e && e.code === 'script-parse-failed') return { status: 'unparsable' };
    throw e;
  }
  const found = decls.find(d => d.name === name);
  return found ? { status: 'found', text: found.text } : { status: 'absent' };
}

/* META_DECLARATION_RE：⚠️ 测试专用 / 历史保留——不再被 loadData() 内部使用（探测已
 * 改走 AST，见下方 hasInlineMeta），保留导出只是因为 tests/unit/test_grapheme_migration.js
 * 的 M1/M2 两节直接 `.test(extractScriptContents(html))` 使用它作为独立于 loadData
 * 的正则探测断言（grep 确认全仓库唯一消费者）。这是一份"只为测试而活的生产导出"
 * （L-5 修复，预筛 low，第四轮，2026-09-11：明确标注，避免读者把它误当成生产读取
 * 路径的一部分——真正的 META 探测口径见 hasInlineMeta 头注释，与这条正则的判定
 * 逻辑已经分道扬镳，不保证同步）。
 *
 * L-5 修复（预筛 low，2026-09-11）：findTopLevelDeclarations（js_ast.js）收
 * const/let/var 三种关键字的顶层声明（`var META = {...}` 现在能被正常加载，HEAD
 * 版本会报 legacy-html-fallback-rejected），但这条正则改前只认 `const`——放宽为
 * `(?:const|let|var)`，与抽取路径（declaration()/findAllTopLevelDeclarations 走
 * AST，天然认 const/let/var）口径一致。
 * ③ 主会话裁定（第三轮预筛，2026-09-11）追记：上一段"hasInlineMeta 走到
 * duplicate-declaration 捕获分支时用这条正则探测"的原始动机已经不成立——
 * hasInlineMeta 不再有 duplicate-declaration 捕获分支、也不再引用这条正则做任何
 * 旁证（见 hasInlineMeta 头注释）。这条正则的 const/let/var 放宽本身仍然是对的
 * （与 AST 抽取口径一致这件事没有变），只是不再有 hasInlineMeta 这个内部消费者，
 * 现在纯粹为上面提到的外部测试断言而保留。 */
const META_DECLARATION_RE = /(?:^|\n)[ \t]*(?:const|let|var)\s+META\s*=/;

/* extractScriptContents(raw) -> string：⚠️ 测试专用 / 历史保留——拼接 HTML 里全部
 * `<script>...</script>` 标签内的文本。不再被 loadData() 内部使用（拼接会制造跨
 * script 的虚假重复/语法冲突，见本文件顶部架构说明），保留导出只是因为
 * tests/unit/test_grapheme_migration.js 的多节测试直接调用它作为独立工具函数验证。
 * 实现与大小写不敏感的标签匹配保持不变，**不**同步 SCRIPT_TAG_RE 的 M-2 放宽
 * （见该常量头注释）——这是一份历史保留的生产导出，不是生产读取路径的一部分（L-5
 * 修复，预筛 low，第四轮，2026-09-11：明确标注，避免读者误以为它与 loadData() 的
 * 实际 <script> 收集口径保持同步）。 */
function extractScriptContents(raw) {
  const scripts = [];
  const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(raw))) scripts.push(m[1]);
  return scripts.join('\n');
}

/* SCRIPT_TAG_RE（L-3 修复，第三轮，2026-09-11）：改前 `/<script([^>]*)>.../` 的属性
 * 捕获组 `[^>]*` 紧跟在字面量 "script" 后面，不要求中间有分隔符——`<scriptx>` 里的
 * "x" 会被当成"属性"收下，把一个根本不是 <script> 标签的东西（标签名其实是
 * "scriptx"）误判成一个属性值为 "x" 的 <script> 标签。改成属性组必须以空白开头
 * （`(?:\s[^>]*)?`），与 extractScriptContents 的匹配口径统一：`<script>`/
 * `<script ...>` 才算数，`<scriptx>` 不算——回归见 tests/unit/test_load_data_ast.js
 * 「L-3」。
 *
 * M-2 修复（预筛 medium，第四轮，2026-09-11，属性组再放宽为 `(?:[\s/][^>]*)?`）：
 * 上面这条 L-3 修复只放开了"以空白开头"，但 `<script/type="module">`（"script" 后
 * 直接跟 `/`，中间没有空白）仍然不满足 `(?:\s[^>]*)?`——正则连这个开始标签本身都
 * 匹配不上，整段 `<script/type="module">...</script>` 会被**整个跳过**，标签内容
 * 从未进入 entries、也从未走到 scriptTypeAttr 的 module 判定，直接静默消失，比
 * H-1/H-D 要消灭的"静默漏读"更彻底——这次连"报错"的机会都没有。
 * 真实浏览器怎么处理这个形态：HTML 分词器读完标签名 "script" 后，遇到 `/` 会先进入
 * self-closing-start-tag 状态；由于下一个字符不是 `>`（这里是 "t"），判一次
 * "unexpected-solidus-in-tag" 解析错误，然后**重新以 before-attribute-name 状态
 * 处理这同一个字符**——也就是说这个 `/` 实际上被静默跳过，分词器紧接着正常读出
 * `type="module"` 属性。这正是 H-D 的 parseStartTagAttributes 已经在做的事（见其
 * before-attribute-name 状态里 `s[i] === '/'` 的跳过分支）——问题不在属性
 * tokenizer，而在更外层的 SCRIPT_TAG_RE 从一开始就没能把这个标签识别成
 * "<script ...>"。
 * 属性捕获组放宽为 `(?:[\s/][^>]*)?`（在原来"以空白开头"的基础上，"以 `/` 开头"也
 * 算），与浏览器"标签名后紧跟 `/` 或空白都进入属性扫描"的行为对齐，且不影响 L-3
 * 要挡的 `<scriptx>`——"x" 既不是空白也不是 `/`，属性组仍然匹配失败，退回要求标签名
 * 后立即是 `>`，`<scriptx>` 依旧不被当作 <script> 标签（回归见
 * tests/unit/test_load_data_ast.js「M-2」，同时钉死这条护栏没有被削弱）。
 * extractScriptContents 的独立正则**不**同步这条放宽——见该函数头注释，它是专为
 * test_grapheme_migration.js 保留的历史行为，不参与生产读取路径。
 *
 * R-2 修复（轮 K 外审 MEDIUM·按 HIGH 优先级对待，2026-09-11）：属性捕获组里的分隔
 * 字符类改前用的是 JS 正则的 `\s`（`[\s/]`），下面 parseStartTagAttributes 头注释
 * 「R-2 修复」一节详细说明了为什么这是错的——`\s` 比 HTML 规范定义的属性分隔空白
 * 宽，会把 NBSP（U+00A0）这类字符误判成分隔符，从而"切"出一个真实浏览器根本不
 * 认为存在的属性、掩盖标签后面真正的 JS 内容，方向是静默漏读，不是本文件其它地方
 * 反复论证过的"方向安全"（那条论证本身是错的，同一节详细说明）。改为 HTML 规范的
 * ASCII 空白字符类 `[\t\n\f\r ]`（TAB/LF/FF/CR/SPACE，**不含**垂直制表符 `\v`，也
 * 不含 NBSP、全角空格等 Unicode 空白）。`([\s\S]*?)` 这个捕获 <script> 标签内容的
 * 分组是"任意字符"的惯用写法，与"空白字符"无关，不受这条修复影响。 */
const SCRIPT_TAG_RE = /<script((?:[\t\n\f\r /][^>]*)?)>([\s\S]*?)<\/script>/gi;

/* JS_MIME_TYPES / KNOWN_NON_JS_SCRIPT_TYPES（H-1 修复，2026-09-11，收口 C）：
 * 改前的 ALLOWED_SCRIPT_TYPES 只有三个精确串 `''`/`text/javascript`/
 * `application/javascript`，落选者一律静默跳过——但浏览器按 HTML 规范的
 * "JavaScript MIME type essence match" 会先剥掉 `;` 之后的参数再比对，
 * `type="text/javascript;charset=utf-8"` 这类带参数的写法同样会被当成 JS 执行。
 * 白名单三个精确串收不全，就会把本该正常加载的真实 JS 来源静默漏读——这正是本文件
 * 别处（REJECTED_SCRIPT_TYPES 头注释）已经点名的"漏读比报错危险得多"。
 * 修法是把默认方向反过来：
 *   - JS_MIME_TYPES：HTML 规范定义的 "JavaScript MIME type essence" 全集（含空
 *     字符串——无 type 属性按规范视为 JS）→ 收，作为待解析来源。
 *   - KNOWN_NON_JS_SCRIPT_TYPES：显式列出的、明确不是 JS 的 type → 静默跳过。
 *   - 其余任何 type（含 module、含任何不在上面两份清单里的未知串）→ 一律响亮
 *     报错（unsupported-script-type），不静默跳过。白名单欠收的失败模式由此从
 *     "静默漏读"变成"响亮报错"，与 REJECTED_SCRIPT_TYPES 头注释里"漏读比报错
 *     危险得多"这条自己定下的设计理由保持一致——不管是白名单漏收了真实的 JS type，
 *     还是黑名单没跟上某个新出现的非 JS type，现在都表现为可见的报错而不是悄悄
 *     丢数据。 */
const JS_MIME_TYPES = new Set([
  '',
  'application/ecmascript', 'application/javascript', 'application/x-ecmascript',
  'application/x-javascript', 'text/ecmascript', 'text/javascript',
  'text/javascript1.0', 'text/javascript1.1', 'text/javascript1.2',
  'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5',
  'text/jscript', 'text/livescript', 'text/x-ecmascript', 'text/x-javascript'
]);
/* L-2 修复（预筛 low，2026-09-11）：改前这里另起一个 `ALLOWED_SCRIPT_TYPES =
 * JS_MIME_TYPES` 别名，全仓库/全文档只有 collectScriptEntries 里那一处判断用
 * `ALLOWED_SCRIPT_TYPES`，其余注释与说明通篇都写 `JS_MIME_TYPES`——一个死别名，
 * 删掉，下方判断直接用 JS_MIME_TYPES。 */
const KNOWN_NON_JS_SCRIPT_TYPES = new Set([
  'application/json', 'application/ld+json', 'text/template', 'text/html',
  'importmap', 'speculationrules'
]);
/* REJECTED_SCRIPT_TYPES：明确是 JS、但本加载器不支持的 script type——目前只有
 * 'module'。收口 A（2026-09-11，段 4 U1 收口）：module 曾经在当时叫
 * ALLOWED_SCRIPT_TYPES 的白名单里（L-2 修复已把这个死别名删掉，现在是
 * JS_MIME_TYPES），但 collectScriptSources 只返回 string[]（丢弃 type），实际仍按 sourceType:
 * 'script' 喂给 acorn 解析——这是"声明的能力大于实作"：白名单列了 module 就等于
 * 对外宣称支持，但从未真正支持过。
 * 不选"真正实现 module 解析"：module 里 `export const X = ...` 在 AST 里是
 * ExportNamedDeclaration 包着 VariableDeclaration，findTopLevelDeclarations 现在
 * 找不到它；module 还是严格模式、顶层 this 语义也不同，而 loadData 最后要把声明
 * 文本拼起来喂 vm.runInNewContext（script 语境）——真正支持 module 要连带设计这些，
 * 范围远超本次收口。
 * 不选"静默跳过"：collectScriptSources 对 application/json / text/template 之类
 * 明确不是 JS 的 type 静默跳过是对的；module 是 JS，跳过它就是漏掉真实的数据来源，
 * 而 loadData 是校验器的数据入口，漏读比报错危险得多——所以遇到 module 直接抛错，
 * 不静默跳过。module 之外任何未知 type 现在也是同一处置（H-1 收口 C），module 单独
 * 留一份专属的详细错误消息，是因为它是唯一一个"我们知道它是什么、且明确知道为什么
 * 不支持"的类型，其它未知 type 连"它是什么"都不知道，只能给通用消息。 */
const REJECTED_SCRIPT_TYPES = new Set(['module']);

/* parseStartTagAttributes(attrs) -> [{name, value, hasValue}]（H-D 修复，预筛 high，
 * 第三轮，2026-09-11，换掉整个实现，不是再补一条正则）：
 *
 * 改前 scriptTypeAttr 用一条正则在整个属性串上搜属性名，这个设计从根上就无法区分
 * "属性名"与"落在属性值内容里的同形文本"——同一个错误已经以三种形态出现过：
 *   ① `\btype\s*=` 的 `\b` 在 `-` 后同样成立，命中 `data-type="..."` 里的 "type"
 *      （H-B 修复，第二轮抓到）；
 *   ② `(?:^|\s)type\s*=` 要求 "type" 前是空白，但引号内部的空白同样满足这个条件——
 *      `<script data-note="see type=application/json for schema">` 这类值里含
 *      "空格+type=" 的属性，真实 JS 因此被静默丢弃且不报错（第三轮实测抓到）；
 *   ③ `<script /type="module">`——HTML 规范的 before-attribute-name 状态里 `/` 会
 *      被跳过，浏览器仍然认 `type="module"`，但字符串起始不是空白、`/` 也不满足
 *      `(?:^|\s)`，这个形态会被 ② 的正则漏判。
 * 再补一条正则只会有第四种形态——正则本身就不具备"属性名 vs 属性值内容"的分辨力。
 * 换成按 HTML 规范 before-attribute-name 状态逐对扫描的小型属性 tokenizer：跳过
 * 空白与 `/`（对应③）→ 读属性名（遇到 `=`/空白/`/`/串尾即止，不会跨进引号内部，
 * 对应①②天然被挡住——名字段只在等号之前，值字段的内容永远不会被当成下一个属性名
 * 扫描）→ 若紧跟 `=` 则读属性值（双引号/单引号/无引号三种形态，引号内的内容一律是
 * 值本身，不参与属性名判定）→ 否则是空值的布尔属性。返回值数组保留源码顺序，重复
 * 属性名（如两次 `type=`）都在数组里，取舍交给调用方（scriptTypeAttr 取第一个，
 * 符合 HTML 规范"重复属性以第一个为准"）。
 * 单独导出（下方 module.exports），供测试直接喂属性串做穷举覆盖，不必每次都拼一份
 * 完整 <script> 标签。
 *
 * R-2 修复（轮 K 外审 MEDIUM·按 HIGH 优先级对待，2026-09-11，取代并更正改前的
 * L-2 修复）：改前这里的判断是"方向是安全的：本函数只会比真实浏览器多切出一次
 * '新属性'……不会导致真实 JS 被静默漏读"——这个论证是错的，外审给出了反例：
 *   <script data-x="v" type="application/json">const RESERVED=['real'];</script>
 * 两个属性之间是 NBSP（U+00A0），不是普通空格。真实浏览器不把 NBSP 当属性分隔
 * 空白，所以这里根本不存在一个独立的 "type" 属性，整段标签内容就是普通 JS，会被
 * 执行。但改前用 JS 正则的 `\s`（HTML 规范 before-attribute-name 状态定义的空白
 * ——TAB/LF/FF/CR/SPACE——的**超集**，额外匹配 NBSP、全角空格等 Unicode 空白/
 * 分隔符）扫描属性串时，会把这个 NBSP 误判成分隔符，凭空"切"出一个本不存在的
 * `type="application/json"` 属性，命中 KNOWN_NON_JS_SCRIPT_TYPES，走进"已知非 JS
 * → 静默跳过"分支——这份真实 JS 来源因此被整段静默漏读，不会报错，若文档另有正常
 * META，loadData() 会成功返回但漏掉这个 <script> 里的 RESERVED。方向不是"更容易
 * 产生一次可见拒绝的安全"，是"静默漏读"，与本文件"漏读比报错危险得多"的一贯取向
 * 正相反。修法：标签与属性扫描统一改用 HTML 规范定义的 ASCII 空白字符集合
 * `[\t\n\f\r ]`（TAB/LF/FF/CR/SPACE，**不含**垂直制表符 `\v`，也不含 NBSP、全角
 * 空格等 Unicode 空白），不再用 JS 正则的 `\s`——下面函数体内全部空白判定，以及
 * 上方 SCRIPT_TAG_RE 的属性捕获组（见该常量「R-2 修复」一节），均已同步改用这个
 * 字符类。`[\s\S]` 那种"任意字符"惯用法（SCRIPT_TAG_RE 捕获标签内容的分组）与
 * "空白字符"判定无关，不在这条修复范围内。 */
function parseStartTagAttributes(attrs) {
  const s = attrs || '';
  const n = s.length;
  const out = [];
  let i = 0;
  while (i < n) {
    // before-attribute-name 状态：跳过空白与 '/'（③ 的斜杠前缀在这里被吞掉）。
    while (i < n && (/[\t\n\f\r ]/.test(s[i]) || s[i] === '/')) i++;
    if (i >= n) break;
    const nameStart = i;
    // attribute-name 状态：名字段在遇到 '='、空白、'/' 或串尾时结束——引号是值
    // 字段的事，名字段扫描根本不会跨进引号内部去看引号里的内容。
    while (i < n && !/[\t\n\f\r =\/]/.test(s[i])) i++;
    /* L-1 修复（预筛 low，第四轮，2026-09-11）：改前这里写"防御性：理论上不会触发"，
     * 但实测会触发——跳过空白/'/' 后唯一能让名字段零宽（nameStart===i）的字符是
     * '='（它不满足上面 while 的跳过条件，也满足下面 attribute-name 状态的终止
     * 条件，会让 while 循环一次都不执行）。`<script ="x" type="module">` 就是一个
     * 真实可达的输入：before-attribute-name 跳过前导空白后停在 '='，attribute-name
     * 状态立即终止（i===nameStart），若不消耗这个字符直接 continue，i 永远停在
     * 同一个位置，是死循环。这里 `i += 1` 跳过这个无法组成属性名的 '=' 字符，再继续
     * 扫描后面的内容——是全函数唯一的防死循环闸门，不是可以安全删掉的死代码
     * （回归见 tests/unit/test_load_data_ast.js「L-1」，实测
     * scriptTypeAttr(' ="foo" type="module"') 会精确走到这一步）。 */
    if (i === nameStart) { i += 1; continue; }
    const name = s.slice(nameStart, i).toLowerCase();
    let j = i;
    while (j < n && /[\t\n\f\r ]/.test(s[j])) j++;
    if (j < n && s[j] === '=') {
      j++;
      while (j < n && /[\t\n\f\r ]/.test(s[j])) j++;
      let value = '';
      if (j < n && (s[j] === '"' || s[j] === "'")) {
        const quote = s[j];
        j++;
        const valStart = j;
        while (j < n && s[j] !== quote) j++;
        value = s.slice(valStart, j);
        if (j < n) j++; // 跳过闭合引号
      } else {
        const valStart = j;
        while (j < n && !/[\t\n\f\r ]/.test(s[j])) j++;
        value = s.slice(valStart, j);
      }
      out.push({ name: name, value: value, hasValue: true });
      i = j;
    } else {
      out.push({ name: name, value: '', hasValue: false }); // 布尔属性，无值
      i = j;
    }
  }
  return out;
}

/* rawScriptType(attrs) -> {essence, raw}（M-1 修复，预筛 medium，第四轮，2026-09-11）
 *
 * 改前 scriptTypeAttr 把"属性缺失/属性值 trim 后为空——按 HTML 规范都应视为 JS"与
 * "属性值非空、但按 `;` 截断参数并 trim 后 essence 为空——不是合法 MIME type
 * essence，不是 JS"两种语义不同的情况都折叠成同一个 `''`：`type=";charset=utf-8"`
 * 这类值整体非空、但 `split(';')[0]` 恰好切出空串，与"无 type 属性"落进同一个 `''`
 * 分支，被 collectScriptEntries 误判为 JS 收进待解析来源——按 HTML 规范，这串
 * MIME 语法本身就解析失败（不含合法的 `type/subtype`），essence 是 undefined，不是
 * JavaScript MIME type essence match，浏览器把它当 data block **不执行**，校验器
 * 因此会去读一段页面上永远不生效的数据（方向是"误读"，不是本文件其它地方反复强调
 * 的"漏读"——更难发现，因为它不报错，只是读了不该读的东西）。
 *
 * 现在返回 {essence, raw} 两态分明：
 *   - essence === ''：确实应该按 JS 处理（无 type 属性，或属性值 trim 后为空——两者
 *     都符合 HTML 规范），与 JS_MIME_TYPES 里的 '' 项对应。
 *   - essence === null：属性值非空，但按 `;` 截断参数 + trim 后没有 essence——不是
 *     JS，也不是任何已知非 JS 类型，不会命中 JS_MIME_TYPES 或
 *     KNOWN_NON_JS_SCRIPT_TYPES 的任何项，自然落进 collectScriptEntries 的"响亮
 *     报错"分支（unsupported-script-type）。
 *   - 否则 essence 是截断参数 + trim + 小写后的真实 MIME type essence 字符串。
 * raw 保留属性的原始值（未按 `;` 截断，未 trim），无 type 属性时为 null——只在需要
 * 在报错信息里展示"用户到底写了什么"时使用，分类判断只看 essence。
 * scriptTypeAttr(attrs) -> essence|''：对外导出的窄接口，供既有调用方与测试按原有
 * 字符串契约使用（`''` 仍代表"按 JS 处理"，不代表"这就是全部信息"——需要展示原始
 * 属性值的调用方应改用 rawScriptType）。 */
function rawScriptType(attrs) {
  const typeAttr = parseStartTagAttributes(attrs).find(a => a.name === 'type');
  if (!typeAttr) return { essence: '', raw: null };
  const raw = typeAttr.value;
  if (raw.trim() === '') return { essence: '', raw };
  /* H-1 修复（2026-09-11）：HTML 规范的 "JavaScript MIME type essence match" 先按
   * `;` 截断参数（如 charset=utf-8）、trim 首尾空白，再转小写比对——改前直接对
   * 整串（含参数）做精确匹配，带参数的合法 JS type 会落进白名单之外被静默跳过。 */
  const essence = raw.split(';')[0].trim().toLowerCase();
  return { essence: essence === '' ? null : essence, raw };
}

function scriptTypeAttr(attrs) {
  return rawScriptType(attrs).essence;
}

/* ============================================================================
 * scriptIndex 口径统一（收口 A，2026-09-11）：本文件里凡是对外暴露的 scriptIndex——
 * unsupported-script-type / script-parse-failed 抛出的错误对象上的字段，以及
 * findAllTopLevelDeclarations 归并进 Map 的每条记录里的 scriptIndex——恒为同一个
 * 含义：「这份 HTML 文档里第几个 <script> 标签，从 0 开始数，含被静默跳过的非 JS
 * 标签（如 application/json）在内」。这就是下面 collectScriptEntries 里 tagIndex
 * 计数器的值：它在遇到每一个匹配到的 <script> 标签时立即自增，早于"这个标签是不是
 * JS、要不要收下"的判断，所以无论一个标签最终被收下、被静默跳过、还是导致抛错，它
 * 在文档里的原始序号都稳定不变。
 * 拿到 scriptIndex 的人要做的事是「去 HTML 里数到第几个 <script> 标签」，这个数法
 * 只能有一种——不能在"标签原始序号"和"过滤掉非 JS 标签之后的数组下标"之间切换：
 * 混合文档里（比如第 0 个标签是被跳过的 application/json）两种数法会给出不同数字，
 * 后者会把人指向错误的标签。改前 findAllTopLevelDeclarations 曾用 sources 数组下标
 * 充当 scriptIndex，与 unsupported-script-type 用的标签原始序号是两套口径，本次
 * 收口统一改为 collectScriptEntries 产出的 tagIndex，两者天然一致（回归见
 * tests/unit/test_load_data_ast.js「10」）。
 * ============================================================================ */

/* collectScriptEntries(raw, html) -> [{text, tagIndex}]
 * html===false：raw 本身就是一份脚本文本（数据层 JS 入口，没有 <script> 包裹），
 *   原样返回单元素数组，tagIndex 固定为 0。
 * html===true：抓取全部 `<script ...>...</script>` 标签，按 type 属性分三类处理
 *   （大小写不敏感，先按 `;` 截断参数再比对，见 scriptTypeAttr）：
 *     - type 命中 JS_MIME_TYPES（含无 type / 空 type）→ 收，作为待解析的 JS 来源。
 *     - type 命中 KNOWN_NON_JS_SCRIPT_TYPES（application/json、text/template 等，
 *       明确不是 JS）→ 静默跳过，不计入待解析来源，也不报错。
 *     - 其余任何 type（module，以及不在上面两份清单里的任何未知串）→ 一律直接
 *       抛错（见下方 unsupported-script-type）——**不是**跳过。module 有专属的
 *       详细错误消息（见 REJECTED_SCRIPT_TYPES 头注释），其它未知 type 用通用
 *       消息（H-1 收口 C，2026-09-11：白名单欠收时的失败模式必须是"响亮报错"，
 *       不能是"静默跳过"，否则白名单没收全的真实 JS 来源会被悄悄漏读）。
 *   四周现役产物的 <script> 标签目前全部无 type 属性（实测确认），上面的分类
 *   当前都不改变现役路径的行为，是给未来构建工具往 HTML 里加其它 <script> 形态
 *   留的防御。
 * 每个收下的 <script> 标签内容作为独立元素返回，不拼接——loadData() 靠这一点在
 * 应用层（Map 归并）而不是让 JS 引擎（拼接后解析）去发现"跨 script 同名声明"，
 * 见本文件顶部架构说明。每条记录额外带 tagIndex（该标签在文档里的原始序号，见
 * 上方 scriptIndex 口径说明），与 unsupported-script-type 抛错时用的是同一个
 * 计数器，两者天然一致。 */
function collectScriptEntries(raw, html) {
  if (!html) return [{ text: raw, tagIndex: 0 }];
  const entries = [];
  const re = new RegExp(SCRIPT_TAG_RE.source, SCRIPT_TAG_RE.flags);
  let m;
  let tagIndex = -1;
  while ((m = re.exec(raw))) {
    tagIndex++;
    const { essence: type, raw: rawType } = rawScriptType(m[1]);
    if (JS_MIME_TYPES.has(type)) {
      entries.push({ text: m[2], tagIndex });
      continue;
    }
    if (KNOWN_NON_JS_SCRIPT_TYPES.has(type)) continue;
    // 其余情况一律响亮报错，不静默跳过——见上方 collectScriptEntries 头注释与
    // H-1 收口 C 的说明。module 用专属详细消息，其它未知 type 用通用消息。
    const isModule = REJECTED_SCRIPT_TYPES.has(type);
    /* M-1 修复（预筛 medium，第四轮，2026-09-11）：type 在这里可能是 null——
     * rawScriptType 对"属性值非空但没有合法 essence"（如 ";charset=utf-8"）返回
     * essence=null，不会命中上面任何一个 Set，自然落到这里。错误消息该展示的是
     * "用户到底写了什么"，不是内部分类结果 null——用 rawType（原始属性值，未按
     * `;` 截断）展示；type 非 null 的其它分支（module、普通未知 type）展示 type
     * 本身即可，两者用同一个 displayType 变量统一处理，不分叉写两套消息模板。 */
    const displayType = type === null ? rawType : type;
    const err = new Error(
      isModule
        ? `loadData: 第 ${tagIndex} 个 <script> 的 type="${displayType}" 不受支持。本加载器按 ` +
          'script 语境解析并用 vm 拼接执行顶层声明，module 有独立模块作用域与 export ' +
          '包装形态，两者语义不同；当前四周课件产物不产生 module 脚本（实测全部 <script> ' +
          '无 type 属性），若将来构建工具开始输出 module 脚本，需要先设计 module 顶层声明的' +
          '读取与执行语义再支持——现在明确不支持，而不是静默跳过导致漏读数据。'
        : `loadData: 第 ${tagIndex} 个 <script> 的 type="${displayType}" 既不在已知的 JS MIME ` +
          'type 清单（JS_MIME_TYPES）里，也不在已知的非 JS 类型清单' +
          '（KNOWN_NON_JS_SCRIPT_TYPES）里。H-1 修复（2026-09-11）把默认方向从"白名单没收录' +
          '就静默跳过"改成"白名单没收录就响亮报错"：未知类型也可能是白名单欠收的真实 JS，' +
          '静默跳过会漏读数据，报错至少能被看见。如果确认这是一种明确不是 JS 的新 script ' +
          'type，把它加进 KNOWN_NON_JS_SCRIPT_TYPES 白名单；如果这是一个语法上不合法的 MIME ' +
          'type（如以 ";" 开头），按 HTML 规范它本就不会被浏览器当 JS 执行，检查这个 type 属性' +
          '是不是写错了。'
    );
    err.code = 'unsupported-script-type';
    err.scriptType = displayType;
    err.scriptIndex = tagIndex;
    throw err;
  }
  return entries;
}

/* collectScriptSources(raw, html) -> string[]：collectScriptEntries 的薄包装，只
 * 保留 text，丢弃 tagIndex——本次 AST 迁移新增的导出 API（L-1 修复，2026-09-11：
 * 改前这里写"declaration() 与既有测试都按 string[] 签名在用"，但
 * `git show HEAD:tools/validation/load_data.js` 里根本不存在 collectScriptSources，
 * 它是本 commit 才引入的，"既有测试"这个说法是错的），declaration() 与本次新增
 * 的测试按 string[] 使用，语义（module/未知 type 抛错、json/template 等已知非
 * JS 类型静默跳过）全部委托给 collectScriptEntries，不重复实现一遍。 */
function collectScriptSources(raw, html) {
  return collectScriptEntries(raw, html).map(e => e.text);
}

const DUPLICATE_IDENTIFIER_RE = /Identifier '([^']+)' has already been declared/;

/* tryFindTopLevelDeclarations(source) -> {declarations, error}
 * 对单个 script 源码调用 js_ast.findTopLevelDeclarations 的容错包装：
 *   - 解析成功：{declarations: [...], error: null}。
 *   - 解析失败且能从 acorn 的报错文本里识别出"同一作用域内标识符已被声明"
 *     （`Identifier 'x' has already been declared`）：这类失败本身就是一个具体、
 *     应该被报告的问题（同一个 <script> 内两次 `const NAME = ...`），不属于"这个
 *     script 解析不了、姑且当作没有声明"这条宽容策略的适用范围——直接抛出
 *     duplicate-declaration（不返回，调用方不应该把这种失败当成"空"悄悄吞掉）。
 *     count 固定为 2：acorn 一遇到第二次声明就报错并停止解析，拿不到"总共重复了
 *     几次"这个精确数字，2 是可以确定的下限（至少两次）。
 *   - 其他任何解析失败（如注入的随意字符）：{declarations: [], error}——不知道这个
 *     script 里有什么顶层声明，但也不是"重复声明"这个可以直接下结论的具体问题，
 *     留给调用方决定要不要容忍（hasInlineMeta 的"缺 META 优先判定"场景会容忍；
 *     findAllTopLevelDeclarations 的严格通道不会容忍，会把这个 error 重新抛出）。 */
function tryFindTopLevelDeclarations(source) {
  try {
    return { declarations: findTopLevelDeclarations(source), error: null };
  } catch (e) {
    if (!e || e.code !== 'script-parse-failed') throw e;
    const dup = DUPLICATE_IDENTIFIER_RE.exec(e.message);
    if (dup) {
      /* M-1 修复（2026-09-11）：消息里不再写"顶层"——acorn 的报错文本本身不带
       * 作用域深度信息，同一个 <script> 内任何一层作用域（顶层、函数体、块）的
       * 重复声明都会触发同一句 "Identifier ... has already been declared"，这里
       * 没有能力（也不该假装有能力）分辨这次重复到底发生在哪一层，"顶层常量"
       * 这个措辞对嵌套在函数体内的重复声明是错的。 */
      const err = new Error(
        `loadData: 常量 "${dup[1]}" 在同一个 <script> 内被重复声明` +
        `（JS 引擎级作用域冲突，无法判定该声明位于哪一层作用域）：${e.message}`
      );
      err.code = 'duplicate-declaration';
      err.declarationName = dup[1];
      /* L-4 修复（预筛 low，2026-09-11）：declarationName 在这条路径上不保证是
       * NAMES 清单里的数据常量——dup[1] 直接来自 acorn 报错文本里的标识符名，可以是
       * 任意标识符（实测：`function f(){ const x=1; const x=2; }` 会给出
       * declarationName='x'，x 不是数据常量）。与 err.countIsLowerBound /
       * err.scopeUnknown 同理，显式标记，不能让消费者凭字段名本身猜测语义；跨
       * script 那条路径（loadData 内 Map 归并，见下方）里 declarationName 恒为
       * NAMES 之一，显式设 nameIsDataConstant=true。 */
      err.nameIsDataConstant = false;
      err.count = 2;
      /* 收口 B（2026-09-11）：这条路径上的 count 是下限不是精确值——acorn 遇到第二次
       * 声明就停，拿不到"总共重复了几次"。同一个 err.count 字段，跨 script 那条路径
       * （findAllTopLevelDeclarations 里的 duplicate 分支，见下方 loadData 内）是精确
       * 值（Map 条目数，occ.length），对消费者来说无法仅凭字段本身区分是精确还是下限
       * ——显式标记，不留隐含假设。 */
      err.countIsLowerBound = true;
      /* M-1 修复（2026-09-11）：与 err.countIsLowerBound 同理，显式标记这条路径的
       * 作用域是"不知道"——不去反查 acorn 的 pos 猜作用域深度（解析已经失败，没有
       * AST 可查，诚实降级比假装知道好）。跨 script 那条路径（loadData 内 Map
       * 归并出的重复声明，每条记录都已确认是真顶层声明）会显式设 scopeUnknown=false，
       * 两者不能只看字段名区分，必须显式设置。 */
      err.scopeUnknown = true;
      err.cause = e;
      throw err;
    }
    return { declarations: [], error: e };
  }
}

/* hasInlineMeta(entries) -> boolean（entries：collectScriptEntries 的返回值）
 * B-M1（外审 medium，2026-09-10，段 3）明确要求：即使某个 <script> 因为其他声明
 * 语法不兼容而整体解析失败，只要没有任何 script 能确认存在顶层 META，就必须统一
 * 判定为"缺内联 META"（legacy-html-fallback-rejected），不能把底层的解析错误直接
 * 泄漏给调用方（见 tests/unit/test_grapheme_migration.js 的 B-M1 fixture：真实历史
 * 产物删除 META 后，往仍存在的 SOUNDS 声明里注入语法不兼容 token，期望的错误码
 * 仍是 legacy-html-fallback-rejected，不是裸 SyntaxError 或 script-parse-failed——
 * 这份 fixture 的故障是"语法 token 损坏"，不是"重复声明"，不受下面这条裁定影响，
 * 详见该处注释）。用 tryFindTopLevelDeclarations 的宽容版本而不是 js_ast 的裸函数：
 * 对"无法明确诊断成因"的解析失败一律当作"这个 script 没有可用的顶层声明信息"处理，
 * 不提前下结论、返回 false，交给其它 entry 或"缺 META 优先"规则判定。
 *
 * ③ 主会话裁定（第三轮预筛，2026-09-11，取代改前 M-1/M-B 两轮修复）：不再对
 * duplicate-declaration 做任何消歧处理，让它像其它无法诊断的解析失败一样自然向上
 * 传播（回到 M-1 修复之前的传播行为）——duplicate-declaration 优先于"缺 META"判定。
 *
 * 取舍历史（为什么这里改了两次又改回来）：M-1 修复（第二轮）曾经引入一条"文本旁证"
 * ——捕获 duplicate-declaration 后，用 META_DECLARATION_RE 在这个 script 的原始
 * 文本上探测"有没有 META 存在的痕迹"，探测到就不捕获、如实抛出 duplicate-declaration
 * （保住用例 5：同一 <script> 内 META 与 RESERVED 都是真顶层声明、RESERVED 重复两次
 * 的场景，不能被误吞成 legacy-html-fallback-rejected）；没探测到就捕获、返回 false
 * （修复真实 bug：嵌套在函数体内部、与 META 毫不相干的局部重复声明，会让整个 script
 * 解析失败，不做区分时这类输入会被误报成 duplicate-declaration，而不是 B-M1 契约
 * 要求的 legacy-html-fallback-rejected）。M-B 修复（第二轮）又给这条旁证加了一层
 * maskStringsAndComments 掩码，防止块注释/模板字符串里的 "const META = " 诱饵骗过
 * 探测。第三轮实测证明这条旁证本身无法被正则可靠实现——它被双向骗倒：正则字面量
 * 里的反引号（如 `` const re = /`/; ``）会让掩码的模板字符串扫描提前配对，诱饵
 * "const META = ..." 原样留在掩码结果里未被抹除，产生假阳性；反向构造一个把 META
 * 声明之后整份文本都吞进模板字符串里的输入，则会让掩码把真实存在的 META 一起抹成
 * 空格，产生假阴性。js_lex.js 退役声明里点名的那条根因——"不识别正则字面量"——原样
 * 继承到了这条建立在它之上的旁证身上，不是这条旁证独有的新缺陷。
 *
 * 裁定不再消歧、承认 duplicate-declaration 优先于"缺 META"判定：这与本文件 loadData()
 * 内对 L-4（module 抛错早于 META 判定，见该处 "L-4（预筛 low..." 注释）的裁定同构——
 * 两处都是"一个结构化错误码，先于缺 META 判定被抛出，顺序上像是绕过了 B-M1"，两处
 * 的论证也相同：unsupported-script-type / duplicate-declaration 都是带 code 字段的
 * 结构化错误，不是裸异常；诊断都准确（module 真的不受支持、这份文档真的有重复声明）；
 * B-M1"别让底层解析错误裸泄漏给调用方"的本意——不是"缺 META 必须是所有判定里优先级
 * 最高的那一个"——没有被破坏。用例 5（同一 script 内真顶层 META + 真顶层重复
 * RESERVED）现在也统一交给 findAllTopLevelDeclarations 的严格通道处理：hasInlineMeta
 * 对这个 entry 调 tryFindTopLevelDeclarations 时会直接抛出 duplicate-declaration
 * （不再捕获），原样向上传播出 hasInlineMeta，用例 5 的断言不受影响（同一个错误码/
 * 字段组合，只是不再经过"捕获后重新解析一遍"这一道多余的弯路）。
 *
 * M-3（预筛 medium，2026-09-11，主会话裁定：保持收窄，不改行为，仅补记取舍）：
 * 这里"顶层"严格等于 acorn 语义的 ast.body——IIFE（如
 * `(function(){ const META = {...}; })();`）内部的 META 不算顶层声明，不会被这里
 * 探测到。改前（HEAD，js_lex 版本）用纯文本正则 `(?:^|\n)[ \t]*const\s+META\s*=`
 * 探测、declaration() 也用纯文本正则抽取，两者一致宽容，能找到 IIFE 内部的 META；
 * 现在探测严格改走 AST 语义后，探测收窄了，抽取（declaration()/
 * findAllTopLevelDeclarations）也没有被要求放宽去兼容 IIFE——这是有意的一致收窄，
 * 不是 AST 迁移的意外副作用：IIFE 内的 META 在浏览器语义下就不是页面级顶层声明，
 * loadData 的 vm 拼接执行路径本来也只收顶层声明文本，不会把非顶层的 META 当数据
 * 源用。旧实现是"探测宽 + 抽取也宽"的一致宽容，现在是"探测严 + 抽取也严"的一致
 * 严格，两者各自自洽，但严格版本更接近这个函数该有的语义。影响：改前能加载出
 * IIFE 内 META 的输入，现在会被判定为"缺 META"（legacy-html-fallback-rejected）
 * ——四周现役产物的 META 均为页面级顶层声明，不受影响。 */
function hasInlineMeta(entries) {
  return entries.some(entry => tryFindTopLevelDeclarations(entry.text).declarations.some(d => d.name === 'META'));
}

/* findAllTopLevelDeclarations(entries) -> Map<name, Array<{text, scriptIndex, start}>>
 * （L-1 修复，预筛 low，2026-09-11：改前这里写的类型是 Array<{text, scriptIndex}>，
 * 少了 start 字段——下方每条记录实际 push 的是 {text, scriptIndex, start} 三元组，
 * start 是 H-2 去重的关键字段：loadData() 组装 chunks 时靠 "scriptIndex + start"
 * 识别"这其实是同一条声明语句"（`const A=1, B=2;` 这种一条语句声明多个 NAME 的
 * 写法，A、B 的 start 相同），避免同一条语句被重复推入 chunks 两次触发裸
 * SyntaxError，见下方 loadData() 内 H-2 修复的说明）。
 * entries：collectScriptEntries 的返回值（[{text, tagIndex}]）。
 * 严格通道：逐个 entry 解析，按 name 归并——这正是 H1 的根治点：计数（Map 里
 * 某个 name 的条目数）与抽取（Map 里该条目的 text）现在物理上是同一份数据，不存在
 * "两条路径各自维护一份、可能互相不一致"的旁路。
 * 单个 entry 解析失败：
 *   - 能诊断为同一作用域内重复声明：tryFindTopLevelDeclarations 已经抛出
 *     duplicate-declaration，这里不用再处理，自然向上传播。
 *   - 其他解析失败：不静默跳过（课件 script 都是自家构建产物，解析不了说明真有
 *     问题），包装成 script-parse-failed 并带上 scriptIndex 再抛出。
 * scriptIndex 一律取 entry.tagIndex（该 <script> 标签在文档里的原始序号），不用
 * entries 数组下标——两者在混合文档里（有标签被静默跳过）会不一致，口径统一说明见
 * 本文件 collectScriptEntries 之前的注释块（收口 A，2026-09-11）。 */
function findAllTopLevelDeclarations(entries) {
  const map = new Map();
  entries.forEach(({ text, tagIndex }) => {
    const { declarations, error } = tryFindTopLevelDeclarations(text);
    if (error) {
      const err = new Error(
        `loadData: 第 ${tagIndex} 个 <script> 解析失败，无法判定其中的顶层声明：${error.message}`
      );
      err.code = 'script-parse-failed';
      err.scriptIndex = tagIndex;
      err.cause = error;
      throw err;
    }
    for (const d of declarations) {
      if (!map.has(d.name)) map.set(d.name, []);
      // H-2 修复（2026-09-11）：附带 d.start——同一条 VariableDeclaration 语句声明
      // 多个 NAME（`const A = 1, B = 2;`）时，A、B 各收一条记录，但 text 相同（都是
      // 整条语句的源码切片，见 js_ast.js findTopLevelDeclarations 头注释）。start
      // 是这条语句在其 script 内的字符偏移，同一条语句的所有 declarator 记录 start
      // 相同——loadData() 组装 chunks 时靠 "scriptIndex + start" 识别"这其实是同一
      // 条声明语句"，避免同一条语句被当成不同声明重复推入 chunks。
      map.get(d.name).push({ text: d.text, scriptIndex: tagIndex, start: d.start });
    }
  });
  return map;
}

function throwLegacyHtmlFallbackRejected() {
  /* 里程碑 2 第 8 步（方案 §3.8）：此处曾在缺内联 META 时用正则从旧版 HTML 结构
   * 里重建 rackG4/rackG5/wallLetters——三审 M-9 指出这是"两条入口拒绝旧格式"判据
   * 留的一条后门：重建出的是**字符串**（`racks[0]`/`racks[1]` 直接取正则捕获组，
   * wallLetters 缺 wall 正则命中时甚至退化成 `Object.keys(FIRST_TEACH_DAY).join('')`），
   * 一旦 SOUNDS 里出现多字母字位（如 'ai'），`join('')` 会把键拼成 'aij' 这类无法
   * 反解析回原键集合的字符串——这正是里程碑 2 要消灭的旧形态。
   * 处置（四审 M-6 写死，不留二选一）：拒绝，不重建。四周现役产物（build/*.html）
   * 都内联了 META（declaration() 能找到 `const META = {...};`），这条拒绝不影响
   * 任何现役路径——见 tests/unit/test_grapheme_migration.js「M5：load_data HTML
   * 反解析拒绝旧格式」一节的回归证明。 */
  const err = new Error(
    'loadData: 输入 HTML 缺少内联的 META 声明（未找到 "const META = ...;"）。' +
      '里程碑 2 第 8 步已移除从旧版 HTML 结构正则重建 META 的兼容兜底（方案 §3.8）：' +
      '那条兜底重建出的 rackG4/rackG5/wallLetters 是字符串，字位 ID 含多字母时' +
      '（如 "ai"）会被拆成单字符或拼接成无法反解析的字符串。请确认输入的 HTML 由' +
      '当前构建工具（tools/build_lessons.py）生成，且内联了 META。'
  );
  err.code = 'legacy-html-fallback-rejected';
  throw err;
}

/* nameToDeclarationText(decls, name, pushedDeclNodes) -> string|null（导出 API，
 * R-1 修复，轮 K 外审 HIGH，2026-09-11）
 *
 * decls：findAllTopLevelDeclarations() 的返回值。
 * pushedDeclNodes：调用方在"组装一份 chunks"的整个过程里共享的同一个 Set——跨
 *   NAME 去重必须共享同一把 Set 才有意义，本函数不持有任何模块级状态，每次调用
 *   只读写调用方传进来的这个 Set。
 *
 * 返回该 NAME 对应的顶层声明文本（顶层只出现一次时）；顶层没有这个声明，或者
 * 有但对应的语句节点已经被同一条语句的另一个 NAME 消费过（`const META = {...},
 * RESERVED = [...];` 这种一条语句声明多个 NAME 的写法，两个 NAME 的 occ[0] 指向
 * 同一个语句节点，text 完全相同），均返回 null——调用方不需要（也不应该）区分
 * 这两种 null 的成因，两种情况都不该把这段文本再推入 chunks 一次。
 *
 * 这是 loadData() 自己的 H-2 修复（"一条语句声明多个 NAMES 时不应把同一条语句
 * 重复推入 chunks，否则 vm 对同一条 const 语句求值两次会触发裸 SyntaxError"）与
 * tools/validation/export_data.js 共用的唯一实现——export_data.js 改前直接对每个
 * NAME 调用 declaration(raw,name) 各自取值，没有这层跨 NAME 去重：外审反例
 * `<script>const META={week:1}, RESERVED=['a'];</script>` 能通过 loadData（H-2
 * 已经在 loadData 内部去重），但导出时 declaration(raw,'META') 与
 * declaration(raw,'RESERVED') 各自返回整条语句文本、被同一条语句重复推入导出
 * 文件的 chunks 两次，导出文件因此含两条相同的 const 语句、无法被 loadData()
 * 再次解析——用例 13 只检查 loadData 本身，即使导出路径一直损坏也会通过。现在两边
 * 都改走同一个 decls Map + 同一把去重 Set 语义，不在两处各写一份"scriptIndex+start
 * 去重"判据（这正是本项目反复栽跟头的"两套判据互不知道对方存在"的形态）。 */
function nameToDeclarationText(decls, name, pushedDeclNodes) {
  const occ = decls.get(name);
  if (!occ || occ.length !== 1) return null;
  const node = occ[0];
  const nodeKey = node.scriptIndex + ':' + node.start;
  if (pushedDeclNodes.has(nodeKey)) return null;
  pushedDeclNodes.add(nodeKey);
  return node.text;
}

function loadData(raw, html = true) {
  /* L-4（预筛 low，2026-09-11，主会话裁定：不改，仅记录取舍）：collectScriptEntries
   * 这一步一旦遇到 module（或任何未知）script type 会立即抛
   * unsupported-script-type——这发生在下面"缺 META 优先"判定（B-M1 契约）之前：
   * 如果文档既缺 META、又含一个 module 脚本，调用方拿到的是
   * unsupported-script-type 而不是 B-M1 承诺的 legacy-html-fallback-rejected，
   * 顺序上像是"绕过"了 B-M1。这里刻意不改：unsupported-script-type 是一种文档
   * 形态问题（这份文档里有本加载器不支持/不认识的 <script> 标签），先于数据内容
   * 判定（有没有 META）是合理的优先级；而且它本身就是带 code 字段的结构化错误，
   * 不是裸异常，B-M1 真正要防的"底层异常裸泄漏给调用方"没有被破坏。 */
  const entries = collectScriptEntries(raw, html);
  /* html===true 时先做"缺 META 优先"判定（B-M1，见 hasInlineMeta 头注释）：不进入
   * 下面的严格通道之前，先用宽容版本确认"有没有任何 script 顶层声明了 META"——
   * 这一步会容忍无法归类的解析失败（当作没找到），但不会容忍"同一作用域内重复
   * 声明"这类可以明确诊断的失败（会直接抛 duplicate-declaration，跳过缺 META
   * 判定）。html===false（数据层 JS 入口）不需要这一步，与改前行为一致。 */
  if (html && !hasInlineMeta(entries)) {
    throwLegacyHtmlFallbackRejected();
  }
  /* 严格通道：到这里要么 html===false，要么已确认至少有一个 script 顶层声明了
   * META——任何 entry 解析失败（包括缺 META 判定阶段被"宽容"跳过的那些）都会在
   * 这里被重新触发并如实抛出（script-parse-failed 或 duplicate-declaration），不
   * 会被静默吞掉。 */
  const decls = findAllTopLevelDeclarations(entries);
  /* L2/I-M2 根治（轮 D 复审第三轮 low + 段 3 第九批 medium，2026-09-10）：跨 script
   * 同名顶层声明——不去猜哪一份是"真的"，把决定权交还给人工核实数据源头。 */
  for (const n of NAMES) {
    const occ = decls.get(n);
    if (occ && occ.length > 1) {
      const err = new Error(
        `loadData: 顶层常量 "${n}" 在 <script> 范围内出现了 ${occ.length} 次声明（预期至多 1 次）——` +
        '可能是前置 <script> 里的伪声明与真实数据声明重名，也可能是数据本身手滑重复声明。' +
        '拒绝加载，不猜哪份是真的，请先核实数据源头。'
      );
      err.code = 'duplicate-declaration';
      err.declarationName = n;
      // L-4 修复（预筛 low，2026-09-11）：n 来自 NAMES 数组的 for..of，恒为数据常量
      // 清单里的一个——与 tryFindTopLevelDeclarations 那条路径（declarationName 可以
      // 是任意标识符，见该处 nameIsDataConstant=false 的说明）显式区分开。
      err.nameIsDataConstant = true;
      err.count = occ.length;
      /* 收口 B（2026-09-11）：这条路径的 count 是精确值——occ 是 findAllTopLevelDeclarations
       * 用 Map 归并出的完整清单（每个 script 各贡献至多一条，逐个都实际解析成功过），
       * occ.length 就是真实出现次数，不是下限。与 tryFindTopLevelDeclarations 里
       * 同名字段的语义（那条路径是下限）区分开，不能只看字段名。 */
      err.countIsLowerBound = false;
      // M-1 修复（2026-09-11）：这里的重复声明来自 findAllTopLevelDeclarations 的
      // Map——每条记录都已经过 AST 确认是真顶层声明，作用域是确定的顶层，不是
      // "不知道"，与 tryFindTopLevelDeclarations 里 scopeUnknown=true 的那条路径
      // （同一 script 内的重复，acorn 报错不带作用域深度信息）区分开。
      err.scopeUnknown = false;
      throw err;
    }
  }
  const chunks = [];
  /* H-2 修复（2026-09-11）：一条语句声明多个 NAMES 时（`const META = {...},
   * RESERVED = [...];`），findTopLevelDeclarations 对每个 declarator 各收一条
   * 记录，但 text 都取整条 VariableDeclaration 语句的源码切片（同一份文本，见
   * js_ast.js 头注释）——META 与 RESERVED 各自的 occ[0].text 因此完全相同。改前
   * 按 NAMES 逐个 push occ[0].text，会把同一条语句重复推入 chunks 两次，vm 执行
   * 时对同一条 const 语句求值两次，触发裸 SyntaxError（"Identifier 'META' has
   * already been declared"）逃逸。
   * R-1 修复（轮 K 外审 HIGH，2026-09-11）：按声明节点去重这一步抽成了下方独立
   * 导出的 nameToDeclarationText（key 用 "scriptIndex + ':' + start"，同一条语句
   * 的所有 declarator 记录 start 相同，见 findAllTopLevelDeclarations 里的说明），
   * 供本函数与 tools/validation/export_data.js 共用——export_data.js 改前直接对
   * 每个 NAME 调用 declaration(raw,name) 各自取值，没有这层跨 NAME 去重，一条语句
   * 声明多个 NAME 时会被同一条语句重复推入导出文件的 chunks 两次，无法被 loadData()
   * 再次解析（外审复现用例：`<script>const META={week:1}, RESERVED=['a'];</script>`
   * 能通过 loadData，导出后却是一份无法解析的文件）。该函数头注释有完整说明。 */
  const pushedDeclNodes = new Set();
  for (const n of NAMES) {
    const text = nameToDeclarationText(decls, n, pushedDeclNodes);
    if (text) chunks.push(text);
  }
  /* 收口 B（2026-09-11）：下面对每个 entry.text 再跑一次 findTopLevelSoundsAssignments，
   * 是同一份脚本文本的第二次 acorn 解析——上面 findAllTopLevelDeclarations 已经用
   * tryFindTopLevelDeclarations → findTopLevelDeclarations → parseScript 解析过一次。
   * 这是有意接受的重复解析，不是遗漏：acorn 解析课件这个量级脚本的耗时可忽略不计
   * （四周现役产物里最大的 week03 也在毫秒级），换来的是 findTopLevelDeclarations 与
   * findTopLevelSoundsAssignments 两个函数各自独立求值、互不依赖——js_ast 的公开接口
   * 保持"传文本进、拿数据出"，调用方（本文件）不需要在两次调用之间传递 AST 对象。
   * 不做"一次解析、复用同一份 AST"的重构：那会把 js_ast 的接口形状从"传文本"改成
   * "传 AST"，调用方需要理解 acorn AST 结构才能用，牵动面（js_ast.js 的公开契约、
   * 所有调用方）比省下的这点解析耗时大得多，不划算。 */
  for (const entry of entries) {
    chunks.push(...findTopLevelSoundsAssignments(entry.text).map(x => x.text));
  }
  const box = {};
  /* L-5 修复（2026-09-11）：findTopLevelSoundsAssignments 放宽收集面后（只要形状
   * 是"给 SOUNDS 的某个属性赋值"就收，不再限定右侧必须是 Object.assign(...)），
   * 类似 `SOUNDS.all = buildSounds();` 这种引用了"不在 chunks 里的顶层标识符"
   * （buildSounds 若是顶层函数声明，findTopLevelDeclarations 只收 VariableDeclaration，
   * 不收 FunctionDeclaration，不会被收进 chunks）的赋值语句，会让 vm 在*执行期*
   * 抛出未包装的原生 ReferenceError——这类问题 AST 阶段的静态检查（找声明、找
   * SOUNDS 赋值）都发现不了，只有真正执行到这一行才会暴露。不收回
   * findTopLevelSoundsAssignments 的放宽（语义更正确，见该函数头注释），而是把
   * 整个执行包一层 try/catch，转成结构化错误，不让原生异常裸泄漏给调用方——这
   * 同时也给 H-2 那类"理论上已经去重、但万一还有别的执行期冲突"的失败模式兜了
   * 底，但不能因此就不修 H-2 的根因（chunks 去重）。 */
  try {
    vm.runInNewContext(chunks.join('\n') + '\n' + NAMES.map(n => `if(typeof ${n} !== 'undefined') result.${n} = ${n};`).join('\n'), {result:box}, {timeout:1000});
  } catch (e) {
    const err = new Error(
      `loadData: 拼接后的顶层声明在 vm 中执行失败：${e && e.message}。这些声明各自解析时` +
      '都是合法的顶层语句，但拼接后一起执行才会暴露的问题（比如引用了一个不在本次 chunks' +
      '里的顶层标识符）不会被 AST 阶段的静态检查发现。'
    );
    err.code = 'data-eval-failed';
    err.cause = e;
    throw err;
  }
  if (!box.META && html) {
    // 防御性兜底：上面的 hasInlineMeta 探测理论上已经保证至少有一处顶层 META
    // 声明、vm 执行后 box.META 应当有值——这里保留同一固定错误码只是双保险，
    // 不引入新的失败形态，也不应该在正常路径上被触发到。
    throwLegacyHtmlFallbackRejected();
  }
  return box;
}
/* M-C 修复（预筛 medium，2026-09-11）：导出 JS_MIME_TYPES/KNOWN_NON_JS_SCRIPT_TYPES
 * 供测试断言（tests/unit/test_load_data_ast.js「23」）——改前两份清单各自扩容
 * （H-1 收口 C）后没有任何用例逐串覆盖，缩回旧清单时既有用例仍全绿。
 *
 * ④ 主会话裁定（第三轮预筛，2026-09-11，更正上一版这段注释与实际测试写法的矛盾）：
 * 用例 23 做的是两层比对，**不是**直接遍历这里导出的值再喂给自己。第一层是拿一份
 * **写死**在测试文件里的期望成员清单（expectedJsTypes/expectedNonJsTypes 字面量，
 * 抄自这两份清单当前内容）与这里导出的值做 deepEqual，专门拦"清单本身被静默缩水
 * /误改"；第二层再把期望清单里的每个 type 逐个真的喂给 collectScriptSources，
 * 验证分类行为本身没有跟着漂移（R-6 修复，轮 K 外审，2026-09-11：本段改前这里写
 * "喂给 collectScriptSources/loadData"，但用例 23 的两个 for 循环实际只调用了
 * collectScriptSources，全用例没有任何一处调用 loadData——这个 "/loadData" 是过期
 * 描述，已删除；"验证分类行为本身没有跟着漂移"这句结论本身没有变，只是执行手段
 * 只有 collectScriptSources 这一层，不是两层）。**不能**把第一层改成"直接遍历这里导出
 * 的值，再拿它去跑第二层"——那样测试"验证"的对象和被改坏的对象是同一份，清单
 * 缩水时两层会一起缩水，永远自证通过，是 H1"两套判据互不知道对方存在"在测试层面
 * 的翻版（上一版这段注释把这件事写反了：写着"不是在测试里另起一份硬编码副本"，
 * 但用例 23 的实作恰恰就是写死的期望清单——那是用例 23 自己上一轮的自我纠正成果
 * ——按上一版注释的说法去"修正"测试，会把这里想拦住的分辨力又改回去）。
 *
 * L-4 修复（预筛 low，第三轮，2026-09-11）：导出的不是内部这两个 Set 本身，而是
 * `Object.freeze(数组快照)`——Set 没有原生冻结手段（`Object.freeze` 对 Set 不生效，
 * 冻结后 `.add()/.delete()` 仍会成功执行），若直接导出内部 Set，消费者调用
 * `.add()/.delete()` 会真的改变 scriptTypeAttr/collectScriptEntries 内部依赖同一个
 * Set 做的分类判断——是货真价实的全局共享可变状态。内部分类逻辑仍然用 Set（要的是
 * `.has()` 的判定，不是数组遍历），只是导出给外部的快照换成不可变数组，两者是
 * 两份不同的绑定，内部私有 Set 从不对外暴露。 */
module.exports = {
  loadData, declaration, NAMES, META_DECLARATION_RE, extractScriptContents,
  collectScriptSources, collectScriptEntries, findAllTopLevelDeclarations,
  nameToDeclarationText, scriptTypeAttr, parseStartTagAttributes,
  JS_MIME_TYPES: Object.freeze([...JS_MIME_TYPES]),
  KNOWN_NON_JS_SCRIPT_TYPES: Object.freeze([...KNOWN_NON_JS_SCRIPT_TYPES])
};
