const vm = require('node:vm');
const NAMES = 'META RESERVED SOUNDS W WALL_HINT BOOK FIRST_TEACH_DAY G1_ROUNDS G1_THEME G3_PAIRS G4_WORDS G5_WHITELIST DAYS RESERVED_RETEST PROBE_A PROBE_B GLOBAL_RESERVED ASSESS_TEXT ASSESSMENT_WORDS TAUGHT_SIGHT ANNUAL_DECODING'.split(' ');
function declaration(raw, name) {
  const re = new RegExp('^const ' + name + ' = ', 'm');
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
/* META_DECLARATION_RE：与 declaration() 内部探测同一形态的正则（^const META = ，
 * 多行模式）——现役构建产物（tools/build_lessons.py 生成）唯一真实存在过的内联
 * 形态，不是另外猜一个新正则。两处共用同一条正则常量，避免"探测用的正则"与
 * "真正截取声明用的正则"各写一份、日后改动其中一份而另一份没跟着改。 */
const META_DECLARATION_RE = /^const META = /m;

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
   * 根本不进入 vm.runInNewContext。 */
  if (html && !META_DECLARATION_RE.test(raw)) {
    throwLegacyHtmlFallbackRejected();
  }
  const chunks = NAMES.map(n => declaration(raw, n)).filter(Boolean);
  chunks.push(...(raw.match(/^SOUNDS\.\w+ = Object\.assign\(.*?\);$/gm) || []));
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
module.exports = {loadData, declaration, NAMES};
