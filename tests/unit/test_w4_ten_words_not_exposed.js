/* M4（轮 D 复审第二轮，外审 medium，2026-09-10，"最重要的一条"）：P16 把 RESERVED
 * 五词（dab/nag/nod/sob/rot）与 RESERVED_RETEST 五词（gab/gal/hub/rib/sod）补进
 * W4 的 W 词典后，需要独立核实这十词不会因为"W 被某个消费者整体枚举"而意外出现在
 * 孩子可见的界面（词卡墙/游戏题面/小书/闪卡）或音频清单里。
 *
 * 全仓 W 枚举点审计结论（本文件头注释即审计记录，逐条列出）：
 *   - tools/validation/check_data.js:511 `Object.keys(W).forEach(w => assertPlainTextField(...))`
 *     —— 校验器逐键检查 zh 字段不含 HTML 标签，不产出任何可见 DOM，不展示。
 *   - tools/validation/migration_audit.js:296 `Object.keys(W).forEach(k => wKeysByLower.set(...))`
 *     —— 审计工具建小写归一化查找表，只读不产出可见界面，不展示。
 *   - tools/validation/gen_segments.js:155 `const words = Object.keys(box.W)`
 *     —— 离线开发者工具，给多解词生成 segments 建议供人工复核，写回的是数据结构化
 *        字段（segments），不是渲染内容，不展示；十词全单字母字位，天然无歧义，
 *        这个工具实际上根本不会为它们生成任何建议。
 *   - tests/browser/smoke_w3_browser.py:224 `Object.keys(W)` —— 测试脚本自己的
 *     断言辅助（判断小书句子里的 -s 屈折形式是否是已教词的变形），不产出可见界面，
 *     不展示，且只在测试进程里跑，不是生产代码路径。
 *   - tools/embed_assets.py:88 `set(ART_RE.findall(slice_const(html, "W")))` —— 正则
 *     扫描 W 常量文本里全部 `art:'非空值'` 引用，用于判断哪些插画需要嵌入。这是
 *     唯一一处会因为"新词进了 W"而可能产生级联效果的枚举点：如果新词的 art 字段
 *     是非空字符串，这个正则会把它当成"需要嵌入的插画键"处理。**十词的 art 字段
 *     全部显式声明为 `null`**（frontend/src/weeks/week04.data.js），`art:\s*'([A-Za-z0-9_]+)'`
 *     这条正则只匹配带引号的非空字符串，`art:null` 不会被匹配，此工具对这十词
 *     是彻底的空操作，不会尝试嵌入任何插画，不展示。
 *   - frontend/src/shared/render-blocks.js:437-439（exam 块的 weekly 回退分支
 *     `RESERVED.map(w=>...W[w].zh...)`）—— 这是**周检块本身**（按 RESERVED 数组
 *     取词，不是枚举整个 W），且只在 `typeof RESERVED_RETEST === 'undefined'`
 *     （即 W1-W3 weekly 周）时才走这条分支；W4 起 RESERVED_RETEST 已定义，
 *     实际走的是 assessment.js 的 assessmentHTML('exam')，那里按 assessmentPool
 *     （同样是 RESERVED/RESERVED_RETEST 数组，不是 W）取词，且需要家长先点击
 *     "开始周检/复测"才会把词渲染进 DOM（渐进式揭示，不是访问即见）——这是
 *     测评功能本身，不是"泄漏"，但确认了它按"课程引用取词"（RESERVED/
 *     RESERVED_RETEST 数组），不是"枚举 W"。
 * 全部枚举点逐条核实完毕：没有发现任何消费者会把 W 的全部键当作"可展示词表"
 * 遍历渲染。唯一有级联风险的 embed_assets.py 因为十词 art:null 而天然免疫。
 *
 * 下面①②③三项是**结构化数据层**的负向测试，从真实 W4 构建产物（build/week04.html，
 * 需要先跑一次 `python tools/project.py build`）验证上面的审计结论：
 *   ① 十词不出现在 WORD_AUDIO（音频清单期望项）的键里；
 *   ② 十词不出现在 WORD_ILL（词卡插画）的键里；
 *   ③ 十词不出现在 word_consumers.js 共享抽取器枚举出的任何结构化教学消费记录里
 *      （DAYS 各类块 + BOOK.pages + G1_ROUNDS + G3_PAIRS + G4_WORDS + G5_WHITELIST +
 *      WALL_HINT，15 类来源）。
 *      ⚠️ 原设计是"整份构建产物文本挖掉四处已知声明后做全文正则扫描"，实测
 *      被 WORD_AUDIO/PHONEME_AUDIO 等 base64 音频数据里偶然出现的三字母巧合
 *      子串（例如某段 base64 里连续出现 "dAB"，大小写不敏感匹配下命中
 *      "dab"）污染出假阳性——base64 字母表覆盖范围广，几 MB 的音频数据里出现
 *      任意三到四字母巧合子串的概率不低。改用结构化的 collectWordConsumption
 *      枚举（在解析后的 box 对象上按字段取值，不做文本正则扫描），从机制上
 *      不会被二进制数据的文本巧合污染。
 *
 * H-H1（段 3 第九批，外审 high，2026-09-10）：①②③只查"结构化记录"这一层——如果
 * 渲染代码本身（render-blocks.js/games.js）用了一种不经过任何"离散词条目"的方式
 * 派生出包含十词的文本（比如某处直接对 `Object.keys(W)` 做字符串拼接后塞进
 * DOM——审计结论里确认了当前代码没有这种写法，但①②③本身测不出来，全靠人工审计
 * 结论撑着），①②③一个都抓不到；且改前 build/week04.html 缺失时直接 SKIP（exit
 * 0），这个文件级别的验证在 build/ 还没跑过、或被误删时会悄悄"总是绿"，不是真的
 * 验证过。两处都改：
 *   - build/week04.html 或 week04.template.html 缺失时改为 FAIL（非零退出），不再
 *     SKIP——"这道测试没跑起来"不该看起来和"跑过了、没问题"一样。
 *   - 新增④~⑥三项**渲染级**验证：用 tools/build_lessons.py 同一套 @include 展开
 *     逻辑 + vm 沙箱，把 W4 模板的两段 <script> 按真实浏览器顺序跑起来（与
 *     test_render_smoke.js 同一套技术手段——该文件是可执行的测试脚本、不是可
 *     import 的库模块，这里按同一手法独立实现一份精简版，不 require 那个文件，
 *     避免把它的全部测试当成"引入一个模块"的副作用一起跑一遍）：
 *       ④ 首页 + 点亮墙：renderHome() 是模板结尾自动调用的真实入口，读取
 *          document.getElementById('app').innerHTML，逐词断言十词均不以独立词元
 *          形式出现在渲染出的首页/墙文本或属性里。
 *       ⑤ 三个游戏初始化（W4 实际用到 g1/g4/g5，逐一核实过 week04.data.js 的块
 *          类型分布）：对 DAYS 里全部块（exam/assessment/retest/baseline/probe
 *          这类"测评渐进式揭示"入口按审计结论排除，不算泄漏）逐个调用真实
 *          `blockHTML(b, ctx)`，扫描渲染出的 HTML 文本。
 *       ⑥ 小书：对 BOOK.pages 逐页调用真实的 `colorPlainText(line, wordColorCtx())`
 *          （渲染小书正文用的同一个生产函数，initBook() 的 draw() 内部调用的正是
 *          它）+ 原样 zh 译文 + `bookArt(art)`，扫描渲染出的 HTML/文本。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadData } = require('../../tools/validation/load_data');

const ROOT = path.resolve(__dirname, '..', '..');
const BUILD_PATH = path.join(ROOT, 'build', 'week04.html');
const TEMPLATE_PATH = path.join(ROOT, 'frontend', 'src', 'weeks', 'week04.template.html');
const SRC = path.join(ROOT, 'frontend', 'src');

// H-H1：build/week04.html 缺失时 FAIL，不再 SKIP——"这道测试没跑起来"不该看起来
// 和"跑过了、没问题"一样。
assert(fs.existsSync(BUILD_PATH),
  `test_w4_ten_words_not_exposed：${BUILD_PATH} 不存在，请先跑 python tools/project.py build ` +
  '再运行本测试（改前这里 SKIP+exit 0，会让"没跑过"和"跑过没问题"看起来一样——现在显式 FAIL）');
assert(fs.existsSync(TEMPLATE_PATH),
  `test_w4_ten_words_not_exposed：${TEMPLATE_PATH} 不存在——④~⑥渲染级验证需要这份模板源文件`);

const raw = fs.readFileSync(BUILD_PATH, 'utf8');
const box = loadData(raw, true);

const TEN_WORDS = [...box.RESERVED, ...(box.RESERVED_RETEST || [])];
assert.equal(TEN_WORDS.length, 10, `真实 W4 构建产物的 RESERVED+RESERVED_RETEST 应恰好 10 词，实际 ${TEN_WORDS.length}：${JSON.stringify(TEN_WORDS)}`);
// 逐词的独立词元正则（不用子串匹配，避免 "rot" 命中 "rotate" 这类无关词的假阳性）。
const WORD_BOUNDARY_RE = new Map(TEN_WORDS.map(w => [w, new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')]));
// stripBase64DataUris：渲染出的 HTML 里内嵌了大量 `data:image/...;base64,XXXX`
// 图片数据（词卡插画的 base64 编码）——这类二进制数据的文本表示字母表覆盖广，
// 几十/上百 KB 的 base64 里出现任意三到四字母巧合子串的概率不低（本文件头注释
// 早就点名过这类假阳性：`dAB` 会撞上 "dab"；实测时这里也真的撞上了一次
// "sob"）。①②③已经改走结构化枚举规避了这个问题，④⑤⑥是渲染级 DOM 文本扫描，
// 绕不开 blockHTML() 真实产出里内嵌的 base64——用同一个思路处理：扫描前先把
// base64 数据段整体挖掉，只留下真正的文本内容。
function stripBase64DataUris(html) {
  return String(html || '').replace(/base64,[A-Za-z0-9+/=]+/g, 'base64,STRIPPED');
}
function findLeakedWords(text) {
  const hay = stripBase64DataUris(text);
  return TEN_WORDS.filter(w => WORD_BOUNDARY_RE.get(w).test(hay));
}

// ① WORD_AUDIO 期望项不含十词
{
  const m = /const WORD_AUDIO = (\{[\s\S]*?\});/.exec(raw);
  assert(m, '真实构建产物应能找到 const WORD_AUDIO = {...}; 声明');
  const audioKeys = Object.keys(JSON.parse(m[1]));
  const overlap = TEN_WORDS.filter(w => audioKeys.includes(w));
  assert.deepEqual(overlap, [], `WORD_AUDIO 的音频清单期望项不应包含任何一个测评词，实际重叠：${JSON.stringify(overlap)}`);
  console.log(`PASS M4 ①：WORD_AUDIO（${audioKeys.length} 条音频期望项）不含任何一个测评词`);
}

// ② WORD_ILL（词卡插画）键不含十词
{
  const m = /const WORD_ILL = (\{[\s\S]*?\});/.exec(raw);
  assert(m, '真实构建产物应能找到 const WORD_ILL = {...}; 声明');
  const illKeys = Object.keys(JSON.parse(m[1]));
  const overlap = TEN_WORDS.filter(w => illKeys.includes(w));
  assert.deepEqual(overlap, [], `WORD_ILL 词卡插画的键不应包含任何一个测评词，实际重叠：${JSON.stringify(overlap)}`);
  console.log(`PASS M4 ②：WORD_ILL（${illKeys.length} 条词卡插画）不含任何一个测评词`);
}

// ③ 用共享抽取器 collectWordConsumption（word_consumers.js，check_data.js ③ 同源，
// 但这里是独立调用、独立断言，不复用 check_data.js 的 pass/fail 逻辑本身）枚举
// 真实 W4 box 里全部结构化教学消费记录（DAYS 各类块 + BOOK.pages + G1_ROUNDS +
// G3_PAIRS + G4_WORDS + G5_WHITELIST + WALL_HINT，15 类来源），核实十词一个都不
// 在这份消费清单里——这是精确的结构化核验，不会像纯文本正则扫描那样被
// WORD_AUDIO/PHONEME_AUDIO/WORD_ILL 等 base64 音频·图片数据里偶然出现的三字母
// 巧合子串（比如某段 base64 里恰好连续出现 "dAB"）污染。
{
  const { collectWordConsumption } = require('../../tools/validation/word_consumers');
  const records = collectWordConsumption(box);
  for (const w of TEN_WORDS) {
    const hits = records.filter(r => r.word.toLowerCase() === w.toLowerCase());
    assert.deepEqual(hits, [],
      `测评词 "${w}" 不应出现在任何结构化教学消费记录里（游戏题面/小书/闪卡/词卡墙/换头造词等），` +
      `实际命中来源：${JSON.stringify(hits.map(h => h.kind))}`);
  }
  console.log(`PASS M4 ③：真实 W4 box 的全部结构化教学消费记录（word_consumers.js 15 类来源，共 ${records.length} 条）里不含任何一个测评词`);
}

// ============================================================================
// H-H1：④⑤⑥ 渲染级验证——真正把数据跑过一遍生产渲染代码，不只查结构化记录。
// ============================================================================

// 与 tools/build_lessons.py 的 expand() / test_render_smoke.js 的 expand() 同一条
// 正则、同一套递归展开语义（逐字对照：只认 [a-zA-Z0-9_./-] 字符集的相对路径，禁止
// 跳出 SRC，禁止自引用循环）。这里独立实现一份精简版而不是 require
// test_render_smoke.js——那是一份"跑起来就有副作用（直接执行全部测试）"的脚本，
// 不是可安全 require 的库模块，require 它会把它的整套测试当成本文件的副作用一起
// 跑一遍，不是引入一个函数。
const INCLUDE = /<!-- @include ([a-zA-Z0-9_./-]+) -->/g;
function expand(text, ancestors) {
  ancestors = ancestors || [];
  return text.replace(INCLUDE, (match, rel) => {
    const resolved = path.resolve(SRC, rel);
    if (!resolved.startsWith(SRC + path.sep) || ancestors.includes(resolved)) {
      throw new Error('Invalid or recursive include: ' + rel);
    }
    const content = expand(fs.readFileSync(resolved, 'utf8'), [...ancestors, resolved]);
    return `/* SOURCE: ${rel} */\n${content}\n/* END SOURCE: ${rel} */`;
  });
}
function extractScripts(expandedHtml) {
  const scripts = [];
  const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(expandedHtml))) scripts.push(m[1]);
  if (scripts.length === 0) throw new Error('expanded template 里没有找到任何 <script> 块');
  return scripts;
}
function runScriptsInOrder(sandbox, segments, filenameBase) {
  segments.forEach((code, i) => {
    new vm.Script(code, { filename: `${filenameBase}#script${i}` }).runInContext(sandbox);
  });
}
function makeFakeElement(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(), dataset: {}, style: {}, children: [], attrs: new Map(),
    _text: '', _html: '',
    classList: { _set: new Set(), add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute(k, v) { this.attrs.set(k, String(v)); },
    getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; },
    removeAttribute(k) { this.attrs.delete(k); },
    appendChild(child) { this.children.push(child); return child; },
    remove() {}, addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; }, focus() {},
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; },
    get textContent() { return this._text; }, set textContent(v) { this._text = v; },
    value: '', hidden: false, disabled: false
  };
  return el;
}
function makeSandbox() {
  const elementsById = new Map();
  const localStorageStore = new Map();
  const document = {
    documentElement: makeFakeElement('html'), body: makeFakeElement('body'), head: makeFakeElement('head'),
    hidden: false, fonts: { load() {} },
    getElementById(id) { if (!elementsById.has(id)) elementsById.set(id, makeFakeElement('div')); return elementsById.get(id); },
    createElement(tag) { return makeFakeElement(tag); },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {}
  };
  const localStorage = {
    getItem(k) { return localStorageStore.has(k) ? localStorageStore.get(k) : null; },
    setItem(k, v) { localStorageStore.set(k, String(v)); },
    removeItem(k) { localStorageStore.delete(k); }
  };
  class MutationObserver { observe() {} disconnect() {} }
  const sandbox = {
    document, localStorage, MutationObserver, console,
    setTimeout() { return 0; }, clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    Promise, Set, Map, Array, Object, JSON, Math, Date, RegExp, Error, String, Number, Boolean,
    URL: { createObjectURL() { return ''; } }, Blob: function Blob() {},
    Audio: function Audio() { return { play() { return Promise.resolve(); }, pause() {} }; },
    navigator: { language: 'en-US' }
  };
  sandbox.window = sandbox;
  sandbox.window.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} });
  sandbox.window.scrollTo = () => {};
  sandbox.window.addEventListener = () => {};
  sandbox.window.removeEventListener = () => {};
  vm.createContext(sandbox);
  return sandbox;
}

const expanded = expand(fs.readFileSync(TEMPLATE_PATH, 'utf8'), []);
const segments = extractScripts(expanded);
const sandbox = makeSandbox();
runScriptsInOrder(sandbox, segments, TEMPLATE_PATH); // renderHome()/initDateSchedule() 在模板结尾自动调用

// ④ 首页 + 点亮墙：renderHome() 已在上面自动跑过，直接读取渲染结果。
{
  const appHTML = sandbox.document.getElementById('app').innerHTML;
  const leaked = findLeakedWords(appHTML);
  assert.deepEqual(leaked, [], `H-H1 ④：首页/点亮墙渲染出的 DOM（document#app.innerHTML）不应含任何一个测评词，实际命中：${JSON.stringify(leaked)}`);
  console.log('PASS H-H1 ④：真实 renderHome() 渲染出的首页 + 点亮墙 DOM 文本/属性不含任何一个测评词');
}

// ⑤ 三个游戏初始化（W4 实际用到 g1/g4/g5，见文件头审计）：对全部 DAYS 块逐个调用
// 真实 blockHTML(b, ctx)，测评类块（exam/assessment/retest/baseline/probe）按文件
// 头审计结论排除——那是测评渐进式揭示的合法展示路径，不是"泄漏"。
{
  const blockHTML = sandbox.blockHTML;
  assert.equal(typeof blockHTML, 'function', 'blockHTML 应该是共享函数（render-blocks.js 顶层声明）');
  const EXCLUDED_BLOCK_TYPES = new Set(['exam', 'assessment', 'retest', 'baseline', 'probe']);
  const DAYS = box.DAYS;
  assert(Array.isArray(DAYS) && DAYS.length > 0, 'W4 box.DAYS 应该是非空数组');
  const renderedBlockTypes = new Set();
  const g1g4g5Count = { g1: 0, g4: 0, g5: 0 };
  let totalRendered = 0;
  for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
    const d = DAYS[dayIdx];
    const n = dayIdx + 1;
    for (let si = 0; si < (d.steps || []).length; si++) {
      const step = d.steps[si];
      const ctx = { day: n, uid: 0, stepIdx: si };
      for (let bi = 0; bi < (step.blocks || []).length; bi++) {
        const b = step.blocks[bi];
        if (EXCLUDED_BLOCK_TYPES.has(b.b)) continue;
        let html;
        try {
          html = blockHTML(b, ctx);
        } catch (e) {
          throw new Error(`H-H1 ⑤：渲染第 ${n} 天 step${si} block#${bi}（${b.b}）失败：${e.message}`);
        }
        renderedBlockTypes.add(b.b);
        if (b.b === 'g1' || b.b === 'g4' || b.b === 'g5') g1g4g5Count[b.b]++;
        totalRendered++;
        const leaked = findLeakedWords(html);
        assert.deepEqual(leaked, [],
          `H-H1 ⑤：第 ${n} 天 step${si} block#${bi}（${b.b}）渲染出的 HTML 不应含任何一个测评词，实际命中：${JSON.stringify(leaked)}`);
      }
    }
  }
  assert(g1g4g5Count.g1 > 0 && g1g4g5Count.g4 > 0 && g1g4g5Count.g5 > 0,
    `H-H1 ⑤ 前提：W4 应该实际用到 g1/g4/g5 三个游戏块，实际计数：${JSON.stringify(g1g4g5Count)}——若变了需要重新核对本条覆盖的是不是仍然是"三个游戏"`);
  console.log(`PASS H-H1 ⑤：真实 blockHTML() 渲染 W4 全部 ${totalRendered} 个非测评块（含 g1×${g1g4g5Count.g1}/g4×${g1g4g5Count.g4}/g5×${g1g4g5Count.g5} 三个游戏，块类型覆盖：${[...renderedBlockTypes].sort().join(',')}），均不含任何一个测评词`);
}

// ⑥ 小书：对 BOOK.pages 逐页调用真实的 colorPlainText(line, wordColorCtx()) ——
// initBook() 的 draw() 内部渲染正文用的同一个生产函数，不是重新写一份文本处理。
{
  // colorPlainText/wordColorCtx 是顶层 function 声明，classic script 语义下会
  // 变成 sandbox 全局对象的自有属性，可以直接 sandbox.xxx 访问；bookArt 是顶层
  // `const bookArt = key => bookArtHTML(key);`（懒引用，见 week04.template.html
  // 头部注释）——const/let 绑定不会变成全局对象自有属性，需要一段桥接脚本
  // （不带 var/let/const 的裸赋值，sloppy 模式下等价于隐式全局属性赋值）先把它
  // 挂到 sandbox 自身上，与 test_render_smoke.js 桥接 DAYS/WordAudio/BOOK 同一手法。
  new vm.Script('__BRIDGE_BOOK_ART = bookArt;', { filename: TEMPLATE_PATH + ' (bookArt bridge)' }).runInContext(sandbox);
  const colorPlainText = sandbox.colorPlainText;
  const wordColorCtx = sandbox.wordColorCtx;
  const bookArt = sandbox.__BRIDGE_BOOK_ART;
  assert.equal(typeof colorPlainText, 'function', 'colorPlainText 应该是共享函数（graphemes.js 顶层声明）');
  assert.equal(typeof wordColorCtx, 'function', 'wordColorCtx 应该是共享函数（render-blocks.js 顶层声明）');
  assert.equal(typeof bookArt, 'function', 'bookArt 应该是模板内声明的懒引用函数');
  const pages = box.BOOK.pages;
  assert(Array.isArray(pages) && pages.length > 0, 'W4 box.BOOK.pages 应该是非空数组');
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const lineHTML = colorPlainText(p.line, wordColorCtx());
    const artHTML = bookArt(p.art);
    const leaked = findLeakedWords(lineHTML + ' ' + String(p.zh || '') + ' ' + artHTML);
    assert.deepEqual(leaked, [],
      `H-H1 ⑥：小书第 ${i + 1} 页（真实 colorPlainText/bookArt 渲染）不应含任何一个测评词，实际命中：${JSON.stringify(leaked)}`);
  }
  console.log(`PASS H-H1 ⑥：真实 colorPlainText()/bookArt() 渲染 W4 小书全部 ${pages.length} 页，均不含任何一个测评词`);
}

console.log('PASS M4+H-H1 全部六项负向测试（结构化①②③ + 渲染级④⑤⑥）：W4 的 RESERVED/RESERVED_RETEST 十词未出现在音频清单、词卡插画、任何非测评源码位置，也未出现在首页/点亮墙/三个游戏初始化/小书的真实渲染产物里');
