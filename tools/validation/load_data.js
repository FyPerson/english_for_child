const vm = require('node:vm');
const { maskStringsAndComments, bracketDepthAt } = require('./js_lex');
const NAMES = 'META RESERVED SOUNDS W WALL_HINT BOOK FIRST_TEACH_DAY G1_ROUNDS G1_THEME G3_PAIRS G4_WORDS G5_WHITELIST DAYS RESERVED_RETEST PROBE_A PROBE_B GLOBAL_RESERVED ASSESS_TEXT ASSESSMENT_WORDS TAUGHT_SIGHT ANNUAL_DECODING'.split(' ');
function declaration(raw, name) {
  // M2（外审 medium，2026-09-10）：与 META_DECLARATION_RE 同步放宽——改前要求行首
  // 恰好是字面量 "const NAME = "（零缩进、等号两侧各恰一个空格），真实构建产物目前
  // 都是这个形态，但这比"这是不是一处顶层声明"该有的宽容度更严。放宽为允许行首
  // 缩进（`[ \t]*`）与等号两侧任意空白含无空格/换行（`\s*`），不改变对现有精确
  // 格式声明的匹配结果（现有格式是这条更宽正则的一个特例），后续基于 m.index 的
  // 单行/配对括号提取逻辑不受影响（提取内容含不含缩进不影响其作为 JS 语句的合法性）。
  const re = new RegExp('^[ \\t]*const\\s+' + name + '\\s*=', 'm');
  const m = re.exec(raw);
  if (!m) return '';
  // Data declarations terminate at a top-level closing brace/bracket, or on one line.
  const tail = raw.slice(m.index);
  const first = tail.split('\n')[0];
  if (/;/.test(first)) return first;
  const end = /^\s*[}\]];/m.exec(tail);
  if (!end) throw new Error(`Unterminated data declaration: ${name}`);
  return tail.slice(0, end.index + end[0].length);
}
/* META_DECLARATION_RE（M2，外审 medium，2026-09-10 放宽）：改前只认行首字面量
 * "const META = "（恰一个空格、等号后必须紧跟内容）——真实构建产物目前恰好都是
 * 这个形态，但这条正则比"探测是否存在内联 META 声明"这件事本身该有的宽容度更严：
 * 缩进（比如被嵌进某个 IIFE 里）、`const META=`（等号两边没有空格）、
 * `const META =\n{`（等号后换行）都是合法 JS，也都表达"这里有一个 META 声明"，
 * 不该被误判成"缺 META"。放宽为 `const\s+META\s*=`（用 \s+ 容纳多个空格/缩进，
 * \s* 容纳等号两侧任意空白含换行），仍然不需要贪婪匹配声明体本身——探测只关心
 * "有没有这么一句"，真正截取声明体是 declaration() 的职责。
 *
 * 限定到 <script> 内容再探测（避免正文伪声明假阳性）：HTML 正文里如果出现字面量
 * "const META = {...}"（比如课程页面自己展示一段代码示例、或教学材料里刚好有这
 * 几个词连在一起），改前的探测直接在整份 raw HTML 上跑正则，会把这类正文内容
 * 误判成"找到了内联 META"，进而把探测这一步的价值架空。extractScriptContents 把
 * 全部 `<script>...</script>` 标签内的文本拼起来，只在这部分文本上探测；
 * html=false（数据层 JS 入口，没有 <script> 包裹）时 raw 本身就是"脚本内容"，
 * 不需要再抽取。 */
const META_DECLARATION_RE = /(?:^|\n)[ \t]*const\s+META\s*=/;

/* extractScriptContents(raw) -> string：拼接 HTML 里全部 <script>...</script> 标签
 * 内的文本，供 META_DECLARATION_RE 探测使用（见上方头注释「限定到 <script> 内容
 * 再探测」）。找不到任何 <script> 标签时返回空字符串——那本身就该被判定为
 * "没有内联 META"，不需要特殊处理。 */
/* M2（轮 D 复审，外审 medium，2026-09-10）：改前正则没有 `i` 标志——`<SCRIPT>`、
 * `<Script>` 这类大小写混排的标签会被漏收（HTML 标签名本身大小写不敏感，浏览器
 * 一样会把它们当脚本执行，但这里的正则会当成普通文本一起漏进"探测/抽取"两处的
 * 结果之外，等价于"这份 HTML 里没有 script"）。加 `i` 标志后恢复大小写不敏感匹配。
 * 范围说明：属性值（如 `type="..."`）里含 `>` 字符的写法（如 `<script data-x="a>b">`）
 * 现有四份模板与全部构建产物都不会产生这种写法（`@include` 展开的 `<script>` 标签
 * 要么无属性要么只带简单不含 `>` 的属性），这条正则沿用"遇到第一个 `>` 就当标签
 * 结束"的简化假设，不做完整 HTML 属性解析——若未来引入含 `>` 的属性值，需要另外
 * 升级为真正的 HTML tokenizer，不在本次范围内。 */
function extractScriptContents(raw) {
  const scripts = [];
  const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(raw))) scripts.push(m[1]);
  return scripts.join('\n');
}

/* countDeclarationOccurrences(raw, name) -> number（L2，轮 D 复审第三轮，外审 low，
 * 2026-09-10；I-M2，段 3 第九批，外审 medium，2026-09-10 收紧为只数顶层声明）：与
 * declaration()/META_DECLARATION_RE 同一条探测正则的全局版本，数某个顶层常量名在
 * 文本里一共出现过几次**顶层**（Program 层级，不嵌套在任何 `{`/`(`/`[` 内部）声明。
 *
 * 背景：extractScriptContents 把 HTML 里全部 `<script>` 标签的内容拼接成一份文本
 * （`scripts.join('\n')`），declaration() 在这份拼接后的文本上做**第一次匹配**——
 * 如果排在前面的 `<script>` 标签（比如某个与课程数据无关的前置脚本）恰好在行首
 * 出现一句 `const RESERVED = [...]`（哪怕只是巧合同名，或是历史遗留的调试代码），
 * declaration('RESERVED') 会抢先匹配到那一处，而不是后面真正的课程数据声明——
 * 与"正文伪声明"是同一类问题（M1 已经处理过"正文 vs <script>"这一层），这里是
 * "<script> 与 <script> 之间"的下一层：探测/抽取的范围已经限定到 <script> 内容，
 * 但没有进一步确认"这个名字在 <script> 范围内是不是唯一声明过一次"。
 *
 * I-M2（外审 medium，2026-09-10）：改前的正则 `^[ \t]*const\s+NAME\s*=`（'mg' 标志）
 * 只按"行首"匹配，不看这一行本身嵌套在多深的 `{}`/`()`/`[]` 里——某个辅助函数体内部
 * 若手滑写了一个同名局部 `const RESERVED = [...]`（哪怕缩进再深也满足"行首 + 可选
 * 缩进"这条判据），会被误计成"又一次顶层声明"，触发不该触发的 duplicate-declaration
 * 拒绝。改法：先用 maskStringsAndComments 把字符串/模板字符串/注释里的同形文本盖成
 * 空格（避免它们的内容干扰下面的括号深度统计——比如某个字符串字面量里恰好含花括号），
 * 再对每个匹配位置调用 bracketDepthAt 确认括号深度恰为 0（真正的 Program 顶层），
 * 深度不为 0 的匹配（嵌套在函数体/对象字面量/数组内部）不计入。 */
function countDeclarationOccurrences(raw, name) {
  const masked = maskStringsAndComments(raw);
  const re = new RegExp('^[ \\t]*const\\s+' + name + '\\s*=', 'mg');
  let count = 0;
  let m;
  while ((m = re.exec(masked))) {
    if (bracketDepthAt(masked, m.index) === 0) count++;
  }
  return count;
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

function loadData(raw, html = true) {
  /* B-M1（外审 medium，2026-09-10）：改前只在 vm.runInNewContext 执行完全部提取出
   * 的声明、且事后发现 box.META 仍是 undefined 时才抛 legacy-html-fallback-rejected——
   * 契约承诺的是"缺内联 META 时给出这个固定错误码"，但真实旧版 HTML（声明重复、
   * 语法与当前提取逻辑不兼容、变量互相引用缺失等）会先在 vm 执行阶段抛出原生的
   * SyntaxError/ReferenceError，调用方收到的是这些未包装的异常，不是契约承诺的
   * 固定错误码，与契约不符。
   * 改法：在执行任何提取出的声明之前，先用 META_DECLARATION_RE 探测 HTML 是否含
   * 内联 META——不靠另外拍脑袋写的正则去猜"旧 HTML 大概长什么样"，用的就是
   * declaration() 自己截取声明时依赖的同一条判据。探测不通过，立即抛固定错误码，
   * 根本不进入 vm.runInNewContext。
   *
   * M1（轮 D 复审，外审 medium，2026-09-10）：M2 只把**探测**（META_DECLARATION_RE
   * 那一次 .test()）限定到了 <script> 内容，下面真正**抽取**声明体的
   * `declaration(raw, n)` 调用一直传的是整份 `raw`（未经 extractScriptContents
   * 过滤）——HTML 正文如果碰巧在行首出现字面量 `const RESERVED = [...]`（比如
   * 页面自己展示一段代码示例，或教学材料里恰好连着写出这几个词），declaration()
   * 的正则会在整份文档里匹配到**第一个**出现的声明，可能是正文里的伪声明，不是
   * <script> 里那份真实数据——探测通过了（<script> 里确实有 META），但抽取到的
   * 其他常量（RESERVED/W/SOUNDS 等）却可能来自正文，是探测限定了范围、抽取却没有
   * 跟进的两处不一致。改法：`html===true` 时，抽取也改用同一份
   * `extractScriptContents(raw)` 结果（只算一次，探测与抽取共用，不重复扫描、
   * 也不会让两次调用各自看到不同的"脚本内容"），`html===false`（数据层 JS 入口，
   * 没有 <script> 包裹）时 raw 本身就是"脚本内容"，逻辑不变。 */
  const searchText = html ? extractScriptContents(raw) : raw;
  if (html && !META_DECLARATION_RE.test(searchText)) {
    throwLegacyHtmlFallbackRejected();
  }
  /* L2（轮 D 复审第三轮，外审 low，2026-09-10）：declaration() 在多个 <script>
   * 拼接后的文本上只取"第一次匹配"——如果同一个常量名在 <script> 范围内被声明了
   * 不止一次（前置脚本的伪声明 + 后置脚本的真实声明，或者数据本身手滑重复声明），
   * 静默取第一次匹配可能选到错误的那一份，且完全没有任何信号提示"其实有两份"。
   * 这里在抽取之前先做一轮"每个 NAME 是否唯一声明过一次"的普查，多于一次就显式
   * 拒绝——不去猜哪一份才是"真的"，把决定权交还给人工核实数据源头。 */
  for (const n of NAMES) {
    const count = countDeclarationOccurrences(searchText, n);
    if (count > 1) {
      const err = new Error(
        `loadData: 顶层常量 "${n}" 在 <script> 范围内出现了 ${count} 次声明（预期至多 1 次）——` +
        '可能是前置 <script> 里的伪声明与真实数据声明重名，declaration() 只取第一次匹配会悄悄选到' +
        '错误的那一份。拒绝加载，不猜哪份是真的，请先核实数据源头。'
      );
      err.code = 'duplicate-declaration';
      err.declarationName = n;
      err.count = count;
      throw err;
    }
  }
  const chunks = NAMES.map(n => declaration(searchText, n)).filter(Boolean);
  chunks.push(...(searchText.match(/^SOUNDS\.\w+ = Object\.assign\(.*?\);$/gm) || []));
  const box = {};
  vm.runInNewContext(chunks.join('\n') + '\n' + NAMES.map(n => `if(typeof ${n} !== 'undefined') result.${n} = ${n};`).join('\n'), {result:box}, {timeout:1000});
  if (!box.META && html) {
    // 防御性兜底：上面的前置探测理论上已经保证 declaration(raw,'META') 能截出
    // 声明文本、vm 执行后 box.META 应当有值——这里保留同一固定错误码只是双保险，
    // 不引入新的失败形态，也不应该在正常路径上被触发到。
    throwLegacyHtmlFallbackRejected();
  }
  return box;
}
module.exports = {loadData, declaration, NAMES, META_DECLARATION_RE, extractScriptContents, countDeclarationOccurrences};
