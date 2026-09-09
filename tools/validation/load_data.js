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
function loadData(raw, html = true) {
  const chunks = NAMES.map(n => declaration(raw, n)).filter(Boolean);
  chunks.push(...(raw.match(/^SOUNDS\.\w+ = Object\.assign\(.*?\);$/gm) || []));
  const box = {};
  vm.runInNewContext(chunks.join('\n') + '\n' + NAMES.map(n => `if(typeof ${n} !== 'undefined') result.${n} = ${n};`).join('\n'), {result:box}, {timeout:1000});
  if (!box.META && html) {
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
  return box;
}
module.exports = {loadData, declaration, NAMES};
