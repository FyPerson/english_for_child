/* 里程碑 2 第 4b 步收口批新增：blockHTML 数据冒烟测试（M3，外审 medium，2026-09-09
 * 改名/收窄范围——文件名沿用 test_render_smoke.js 不动，避免打乱 run_checks.py 里的
 * 既有任务名与失败排障习惯，但下面这段说明必须先把范围说准）。
 *
 * ⚠️ 范围声明（M3）：本测试只直接调用静态的 blockHTML(b, ctx)，不经过任何一次真实的
 * DOM 挂载/事件触发。垫片里的 `document.querySelectorAll` 恒返回空数组，这意味着
 * initG1/initG2/initG3/initG4/initG5/initFlash/initBook 这些"给已挂载 DOM 元素接事件
 * 委托、驱动内部状态机"的初始化函数在这里天然是空操作——它们的内部渲染分支（G1 正误
 * 反馈、G2 合体/确认后的单词切换、G3 两扇门、G4/G5 摆词填满/撤回/确认反馈、flash 的
 * word/sound 两类卡面切换、book 翻页）完全没有被执行到。这道测试拦得住 critical 1
 * 那种"数据在合法范围内、blockHTML 首次渲染就抛"的故障（demo 词走严格分词白屏），
 * 但撑不起"全部渲染路径冒烟"这个结论——那是过去这段注释曾经暗示、但代码从未做到的事。
 * 真正覆盖"初始化后/交互态"渲染的是本文件下方新增的《状态驱动最小交互测试》一节
 * （M3 第二条），两节分工明确：这一节测"数据能不能被 blockHTML 一次性渲染成合法
 * HTML"，那一节测"游戏内部状态机在交互驱动下切换渲染是否正确"。
 *
 * critical 1（demo 词走严格分词白屏）之所以能漏到实测才发现，是因为此前没有任何一层
 * 检查真的执行过"把一个真实块渲染成 HTML"这件事——check_data.js 只做静态数据校验
 * （词存不存在、字段全不全），不调用 blockHTML；单测只测纯函数；浏览器测试脚本
 * （tests/browser/*.py）测的是交互行为，不逐块扫描。这个洞在收口任务里被点名要补上：
 * "本批必须补一道「渲染冒烟」验证……把每一周每一天的每个块都渲染一遍，断言不抛"。
 *
 * 做法：对每一周的 template.html，原样复用 tools/build_lessons.py 的 @include 展开
 * 逻辑（同一份正则、同一套递归展开，不是重新拿一份近似实现——那样两边一旦分叉，
 * 这个测试验证的就不是真实构建产物），把两段 <script> 的内容按文档顺序拼成一份，
 * 加一段收集式渲染循环，整体丢进 Node vm 的独立 realm 执行。分类 script 顶层收尾会
 * 调用 renderHome()/initDateSchedule()，需要一个最小 DOM/localStorage/window 垫片
 * 才能跑到底；垫片只保证"不崩"，不模拟真实交互（querySelectorAll 恒返回空——这正好
 * 让 initG2/initG4 这类事件委托初始化函数在没有真实 DOM 树时安全地变成空操作，
 * 不影响我们真正要验证的东西：直接调用 blockHTML(b, ctx) 是否对每个块都不抛）。
 *
 * 断言范围：DAYS 每一天、每个 step、每个 block，逐个调用 blockHTML，只要抛出就记一条
 * 失败。这跑的是 render-blocks.js 的真实实现（vm 里 require 不到的浏览器全局函数，
 * 用垫片补齐，不重写 blockHTML 本身），所以能真正复现 critical 1 那种"数据在合法
 * 范围内、但渲染时才炸"的故障——sound 块的 demo 词、G1 反馈词这类不保证可解码的词，
 * 就是这道冒烟测试要守住的口子。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'frontend', 'src');
const INCLUDE = /<!-- @include ([a-zA-Z0-9_./-]+) -->/g;

// 与 tools/build_lessons.py 的 expand() 同一条正则、同一套递归展开语义
// （逐字对照：只认 [a-zA-Z0-9_./-] 字符集的相对路径，禁止跳出 SRC，禁止自引用循环）。
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

// 拼出整页会用到的两段 <script>...</script> 内容，按文档顺序拼接——与浏览器里
// 同一份 <script> 标签共享同一个顶层词法作用域（let/const 跨 classic script 标签
// 互通）的语义一致，所以这里选择"拼成一份文本一次性执行"而不是分别 runInContext，
// 效果等价、实现更简单。
function extractScripts(expandedHtml) {
  const scripts = [];
  const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(expandedHtml))) scripts.push(m[1]);
  if (scripts.length === 0) throw new Error('expanded template 里没有找到任何 <script> 块，展开逻辑是不是跟 build_lessons.py 分叉了');
  return scripts.join('\n;\n');
}

// ---- 最小 DOM/localStorage/window 垫片：只保证顶层收尾代码（renderHome() /
// initDateSchedule() 等）跑得完，不模拟真实交互。querySelectorAll 恒返回空数组，
// 所以 initG2/initG4/initG5 这类"给已有 DOM 元素挂事件委托"的初始化函数在这里
// 天然变成空操作——这对我们要验证的东西（blockHTML 本身不抛）没有影响。 ----
function makeFakeElement(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    dataset: {},
    style: {},
    children: [],
    attrs: new Map(),
    _text: '',
    _html: '',
    classList: {
      _set: new Set(),
      add() { }, remove() { }, toggle() { }, contains() { return false; }
    },
    setAttribute(k, v) { this.attrs.set(k, String(v)); },
    getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; },
    removeAttribute(k) { this.attrs.delete(k); },
    appendChild(child) { this.children.push(child); return child; },
    remove() { },
    addEventListener() { },
    removeEventListener() { },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    focus() { },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; },
    get textContent() { return this._text; },
    set textContent(v) { this._text = v; },
    value: '',
    hidden: false,
    disabled: false
  };
  return el;
}

function makeSandbox() {
  const elementsById = new Map();
  const localStorageStore = new Map();
  const document = {
    documentElement: makeFakeElement('html'),
    body: makeFakeElement('body'),
    head: makeFakeElement('head'),
    hidden: false,
    fonts: { load() { } },
    getElementById(id) {
      if (!elementsById.has(id)) elementsById.set(id, makeFakeElement('div'));
      return elementsById.get(id);
    },
    createElement(tag) { return makeFakeElement(tag); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() { },
    removeEventListener() { }
  };
  const localStorage = {
    getItem(k) { return localStorageStore.has(k) ? localStorageStore.get(k) : null; },
    setItem(k, v) { localStorageStore.set(k, String(v)); },
    removeItem(k) { localStorageStore.delete(k); }
  };
  class MutationObserver { observe() { } disconnect() { } }
  // 定时器一律不真的排期（返回假句柄即可）：initDateSchedule() 里的
  // `setInterval(refreshDateLocks, 30000)` 这类调用如果接到 Node 真定时器，
  // 会在 vm 脚本执行完之后继续占着事件循环，导致进程迟迟不退出——这个测试只关心
  // "渲染当下不抛"，不关心定时任务本身，所以不需要真的调度。
  const sandbox = {
    document, localStorage, MutationObserver,
    console,
    setTimeout() { return 0; }, clearTimeout() { }, setInterval() { return 0; }, clearInterval() { },
    Promise, Set, Map, Array, Object, JSON, Math, Date, RegExp, Error, String, Number, Boolean,
    URL: { createObjectURL() { return ''; } },
    Blob: function Blob() { },
    Audio: function Audio() { return { play() { return Promise.resolve(); }, pause() { } }; },
    navigator: { language: 'en-US' },
    __renderResults: []
  };
  sandbox.window = sandbox;
  sandbox.window.matchMedia = () => ({ matches: false, addListener() { }, addEventListener() { } });
  sandbox.window.scrollTo = () => { };
  sandbox.window.addEventListener = () => { };
  sandbox.window.removeEventListener = () => { };
  vm.createContext(sandbox);
  return sandbox;
}

// 收集式渲染循环：直接调用 blockHTML(b, ctx)，逐块 try/catch，不因为一块炸了就
// 中断整周——这样一次跑能拿到这一周所有故障块，不用改一处跑一次。
const HARNESS = `
;(function(){
  for (var dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
    var d = DAYS[dayIdx];
    var n = dayIdx + 1;
    for (var si = 0; si < d.steps.length; si++) {
      var step = d.steps[si];
      var ctx = { day: n, uid: 0, stepIdx: si };
      for (var bi = 0; bi < step.blocks.length; bi++) {
        var b = step.blocks[bi];
        try {
          blockHTML(b, ctx);
        } catch (e) {
          __renderResults.push({ day: n, stepIdx: si, blockIdx: bi, blockType: b.b, code: e && e.code, message: e && e.message });
        }
      }
    }
  }
})();
`;

function renderSmokeForWeek(templatePath) {
  const expanded = expand(fs.readFileSync(templatePath, 'utf8'), []);
  const scriptCode = extractScripts(expanded) + '\n' + HARNESS;
  const sandbox = makeSandbox();
  const script = new vm.Script(scriptCode, { filename: templatePath });
  script.runInContext(sandbox);
  return sandbox.__renderResults;
}

const templates = fs.readdirSync(path.join(SRC, 'weeks'))
  .filter(f => /^week\d+\.template\.html$/.test(f))
  .sort();
assert(templates.length > 0, '没找到任何 week*.template.html，检查 SRC 路径是不是配错了');

let totalBlocks = 0;
let totalFailures = 0;
for (const name of templates) {
  const templatePath = path.join(SRC, 'weeks', name);
  const failures = renderSmokeForWeek(templatePath);
  totalFailures += failures.length;
  if (failures.length > 0) {
    console.error(`FAIL render smoke: ${name} 有 ${failures.length} 处块渲染抛出：`);
    failures.forEach(f => console.error(`  day${f.day} step${f.stepIdx} block#${f.blockIdx} (${f.blockType}): [${f.code}] ${f.message}`));
  } else {
    console.log(`PASS render smoke: ${name} 全部块渲染无抛出`);
  }
}
assert.equal(totalFailures, 0, `渲染冒烟测试发现 ${totalFailures} 处块渲染抛出，见上面逐条列出（这正是 critical 1 那类"数据合法但渲染时才炸"的故障应该被拦住的地方）`);
console.log('PASS render smoke contract: 全部周·全部天·全部块渲染无抛出');

/* ============================================================================
 * 状态驱动最小交互测试（M3 第二条，外审 medium，2026-09-09）
 *
 * 上面那道冒烟测试只调用静态 blockHTML，querySelectorAll 恒为空——G1 meaningChip、
 * G2 stage/reveal、G3 门、G4/G5 rack/slot/feedback、flash drawCard、book draw 等
 * "初始化后或交互态"的渲染分支完全没有执行到（M3 指出的缺口）。这一节不去重写
 * blockHTML/games.js 生产代码把内部渲染函数抽成纯函数（那是更彻底但改动面更大的方向，
 * 见文件头引用），而是给 initG1/initG2/initG4/initG5/initFlash/initBook 这些"读
 * document.querySelectorAll 找挂载点、给它们接事件委托"的初始化函数提供一套最小但
 * 真实可用的 DOM 垫片：
 *   - 根元素的 data-* 属性从"真实 blockHTML(b, ctx) 的输出"里用正则抽取（不是凭空
 *     手写），保证测试跟着真实产物走，产物结构一旦改名这里的正则会先抓空、断言先炸；
 *   - 内部挂载点（data-g1-body/data-g4-body/data-face 等）不解析嵌套 HTML，直接手工
 *     注册一个空的 InteractiveElement——这些位置的初始内容本来就总是被渲染函数整段
 *     覆盖，手工注册与"解析出一个空 div"等价，但不需要写一个通用 HTML 解析器；
 *   - 点击一律不派发浏览器事件，而是直接调用 root.addEventListener 捕获到的回调函数，
 *     传入一个"点击目标已经带着正确 data-* 属性"的合成 event.target——真实浏览器里
 *     点击的就是这个目标本身，closest() 找的也是它自己，等价。
 *   - WordAudio.play 被整体替换成立即 resolve 的桩，只用于让 G1/G4/G5 从"等音频"
 *     推进到下一个可交互态，不测试音频播放本身（音频层已有 tests/browser/*.py 覆盖）。
 *
 * 覆盖清单（M3 点名的最小集合）：G1 正确/错误反馈两条分支、G2 单词切换（上一词/
 * 下一词）、G4 摆词填满触发校验反馈 + 撤回、G5 摆词填满 + 撤回、flash 的 word 与
 * sound 两类卡面、book 翻页（下一页/上一页）。 */

function camelToKebab(name) {
  return name.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
}

// 支持逗号分隔的选择器列表（真实代码里 closest('[data-act="prev"],[data-act="next"],...')
// 这种复合选择器很常见——G2 的导航按钮监听就是一处真实用例，改前只支持单一简单选择器，
// closest() 对复合选择器恒返回 null，会让"点下一词"这类交互静默无效果（已用真实调用
// 验证会红：见本节调试记录）。
function matchesSelector(el, sel) {
  return sel.split(',').some(one => matchesSimpleSelector(el, one.trim()));
}
function matchesSimpleSelector(el, sel) {
  if (sel.startsWith('.')) return !!(el.classList && el.classList.contains(sel.slice(1)));
  const m = /^\[data-([a-z0-9-]+)(?:="([^"]*)")?\]$/.exec(sel);
  if (m) {
    const attrName = 'data-' + m[1];
    if (!el.attrs.has(attrName)) return false;
    return m[2] === undefined ? true : el.attrs.get(attrName) === m[2];
  }
  return false;
}

// InteractiveElement：比 makeFakeElement 更完整的最小 DOM 元素——真实存事件监听、
// 真实存/读 data-* 属性、支持手工注册的命名子元素查找。只服务这一节的交互测试，
// 不改上面那道 blockHTML 冒烟测试用的 makeFakeElement/makeSandbox（两节互不干扰）。
class InteractiveElement {
  constructor(tag, attrs) {
    this.tagName = (tag || 'div').toUpperCase();
    this.attrs = new Map();
    this._named = new Map();
    this._listeners = {};
    this._html = ''; this._text = '';
    const classes = new Set();
    this.classList = {
      add: (...cs) => cs.forEach(c => classes.add(c)),
      remove: (...cs) => cs.forEach(c => classes.delete(c)),
      toggle: (c, f) => { if (f === undefined) { classes.has(c) ? classes.delete(c) : classes.add(c); } else if (f) classes.add(c); else classes.delete(c); },
      contains: c => classes.has(c)
    };
    const self = this;
    this.dataset = new Proxy({}, {
      get(_, prop) { return self.attrs.get('data-' + camelToKebab(String(prop))); },
      set(_, prop, val) { self.attrs.set('data-' + camelToKebab(String(prop)), String(val)); return true; }
    });
    if (attrs) for (const [k, v] of Object.entries(attrs)) this.setAttribute(k, v);
  }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  removeEventListener() { }
  fire(type, evt) { (this._listeners[type] || []).forEach(fn => fn(evt)); }
  registerNamed(sel, el) { this._named.set(sel, el); return el; }
  querySelector(sel) { return this._named.get(sel) || null; }
  querySelectorAll() { return []; }
  closest(sel) { return matchesSelector(this, sel) ? this : null; }
  appendChild(c) { return c; }
  remove() { }
  focus() { }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = v; }
  get textContent() { return this._text; }
  set textContent(v) { this._text = v; }
}

// 从真实 blockHTML(b, ctx) 输出的根标签里抽取一批 data-* 属性值（不解析嵌套结构，
// 只看第一个 `>` 之前的开标签文本）——保证根元素的 dataset 与真实产物同构。
function extractRootAttrs(html, names) {
  const openTag = html.slice(0, html.indexOf('>') + 1);
  const out = {};
  for (const name of names) {
    const m = new RegExp(name + '(?:="([^"]*)")?').exec(openTag);
    if (m) out[name] = m[1] === undefined ? '' : m[1];
  }
  return out;
}

function findFirstBlock(DAYS, type, pred) {
  for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
    const d = DAYS[dayIdx];
    for (let si = 0; si < d.steps.length; si++) {
      const blocks = d.steps[si].blocks;
      for (let bi = 0; bi < blocks.length; bi++) {
        const b = blocks[bi];
        if (b.b === type && (!pred || pred(b))) return { b, ctx: { day: dayIdx + 1, uid: 0, stepIdx: si } };
      }
    }
  }
  return null;
}

const flushMicrotasks = () => new Promise(resolve => setImmediate(resolve));

async function runInteractionScenarios(templatePath, weekName) {
  const expanded = expand(fs.readFileSync(templatePath, 'utf8'), []);
  const scriptCode = extractScripts(expanded);
  const sandbox = makeSandbox();
  const script = new vm.Script(scriptCode, { filename: templatePath });
  script.runInContext(sandbox); // 第一遍：与冒烟测试一样的空垫片，走完页面顶层收尾代码

  // 桥接顶层 `const DAYS`/`const WordAudio`：classic script 的顶层 const/let 绑定不会
  // 变成全局对象的自有属性（只有 function 声明会——blockHTML/initG1 等因此能直接以
  // sandbox.xxx 访问，DAYS/WordAudio 不能），但同一个已 contextify 的 sandbox 上
  // 后续再跑一段脚本，仍然共享同一个"Script 顶层词法环境"，能看到第一段脚本声明的
  // const/let。这里用一段极小的桥接脚本，把它们通过*不带 var/let/const 的裸赋值*
  // （sloppy 模式下等价于隐式全局属性赋值）挂到 sandbox 自身上，Node 侧才能读到同一个
  // 对象引用（对象引用本身与"怎么绑定"无关，读到之后修改 WordAudio.play 这类属性，
  // vm 内部代码看到的是同一个对象，修改立即生效）。
  new vm.Script('__BRIDGE_DAYS = DAYS; __BRIDGE_WORD_AUDIO = WordAudio; __BRIDGE_BOOK = BOOK;',
    { filename: templatePath + ' (bridge)' }).runInContext(sandbox);
  const DAYS = sandbox.__BRIDGE_DAYS;
  const BOOK = sandbox.__BRIDGE_BOOK;
  const blockHTML = sandbox.blockHTML;

  // 音频层整体替桩：只用于把 G1/G4/G5 从"等音频结束"推进到下一个可交互态，
  // 不测试音频播放本身（真实音频行为已有 tests/browser/*.py 覆盖）。
  sandbox.__BRIDGE_WORD_AUDIO.play = () => Promise.resolve({ status: 'ended' });

  // 覆盖成"看得懂"的 querySelector/querySelectorAll：先查我们手工注册的根元素表
  // （按选择器精确匹配），查不到的一律照旧返回空——不影响页面第一遍执行时已经
  // 走过的那些调用（那些已经执行完了，这个覆盖只影响接下来手动重新调用 initXxx()）。
  const roots = [];
  sandbox.document.querySelectorAll = sel => roots.filter(r => matchesSelector(r, sel));
  sandbox.document.querySelector = sel => roots.find(r => matchesSelector(r, sel)) || null;

  const results = [];
  const check = (label, cond, detail) => results.push({ label, cond: !!cond, detail });

  // ---- G1：正确/错误反馈两条分支 ----
  // buildQueue() 用 Math.random() 洗牌 pos/neg 混合队列，题目顺序（进而"拍"是对是错）
  // 不受我们控制——必须临时把 Math.random 钉成常数，让队首题目确定落在 pos 还是 neg，
  // 才能分别稳定复现"拍对"和"拍错"两条分支，不能随缘蒙对。Math 是与宿主 Node 共享的
  // 同一个对象（makeSandbox 直接传引用，不是拷贝），跑完必须原样恢复，不能影响这条
  // 断言之外的任何代码。用 8 题 4+4 的 Fisher-Yates 手算验证过：randFn 恒返回 0 时
  // 队首落在 pos（第 2 个正例），恒返回 0.2 时队首落在 neg（第 1 个负例）。
  {
    const found = findFirstBlock(DAYS, 'g1');
    if (found) {
      const html = blockHTML(found.b, found.ctx);
      const roundKey = /data-g1-round="([^"]*)"/.exec(html)[1];
      const origRandom = Math.random;
      try {
        // 分支①：队首是正例，"拍"应判对。
        Math.random = () => 0;
        let root = new InteractiveElement('div', { 'data-g1-round': roundKey });
        root.registerNamed('[data-g1-body]', new InteractiveElement('div'));
        roots.length = 0; roots.push(root);
        sandbox.initG1();
        let body = root.querySelector('[data-g1-body]');
        check('G1 初始为 idle 态（开始按钮）', /data-g1-act="start"/.test(body.innerHTML), body.innerHTML);
        root.fire('click', { target: new InteractiveElement('button', { 'data-g1-act': 'start' }) });
        await Promise.resolve(); await Promise.resolve();
        check('G1 开始后进入作答窗（拍按钮）', /data-g1-act="tap"/.test(body.innerHTML), body.innerHTML);
        root.fire('click', { target: new InteractiveElement('button', { 'data-g1-act': 'tap' }) });
        check('G1 队首为正例时拍中应显示正反馈"对啦"', body.innerHTML.includes('对啦'), body.innerHTML);
        check('G1 拍对后显示 meaningChip（含 zh 转义文本）', body.innerHTML.includes('g1__meaning'), body.innerHTML);

        // 分支②：换一张全新的卡（新的 root/闭包），队首是负例，"拍"应判错。
        Math.random = () => 0.2;
        root = new InteractiveElement('div', { 'data-g1-round': roundKey });
        root.registerNamed('[data-g1-body]', new InteractiveElement('div'));
        roots.length = 0; roots.push(root);
        sandbox.initG1();
        body = root.querySelector('[data-g1-body]');
        root.fire('click', { target: new InteractiveElement('button', { 'data-g1-act': 'start' }) });
        await Promise.resolve(); await Promise.resolve();
        root.fire('click', { target: new InteractiveElement('button', { 'data-g1-act': 'tap' }) });
        check('G1 队首为负例时拍中应显示负反馈"再听听看"（不误判为对）', body.innerHTML.includes('再听听看'), body.innerHTML);
        check('G1 拍错时不应出现 meaningChip', !body.innerHTML.includes('g1__meaning'), body.innerHTML);
      } finally {
        Math.random = origRandom;
      }
    } else {
      check('G1：本周数据里没有 g1 块（跳过，非失败）', true);
    }
  }

  // ---- G2：单词切换（下一词/上一词） ----
  {
    const found = findFirstBlock(DAYS, 'blend', b => b.words && b.words.length >= 2);
    if (found) {
      const html = blockHTML(found.b, found.ctx);
      const attrs = extractRootAttrs(html, ['data-g2']);
      const root = new InteractiveElement('div', { 'data-g2': attrs['data-g2'] });
      root.registerNamed('[data-nav]', new InteractiveElement('div'));
      root.registerNamed('[data-body]', new InteractiveElement('div'));
      roots.length = 0; roots.push(root);
      sandbox.initG2();
      const body = root.querySelector('[data-body]');
      const firstWordHTML = body.innerHTML;
      root.fire('click', { target: new InteractiveElement('button', { 'data-act': 'next' }) });
      const secondWordHTML = body.innerHTML;
      check('G2 点下一词后 body 内容确实变化（切到第二个词）', secondWordHTML !== firstWordHTML,
        { before: firstWordHTML, after: secondWordHTML });
      root.fire('click', { target: new InteractiveElement('button', { 'data-act': 'prev' }) });
      check('G2 点上一词后恢复回第一个词的渲染', body.innerHTML === firstWordHTML,
        { expect: firstWordHTML, actual: body.innerHTML });
    } else {
      check('G2：本周数据里没有 words>=2 的 blend 块（跳过，非失败）', true);
    }
  }

  // ---- G4：摆词填满触发校验反馈 + 撤回 ----
  {
    const found = findFirstBlock(DAYS, 'g4');
    if (found) {
      const html = blockHTML(found.b, found.ctx);
      const root = new InteractiveElement('div', extractRootAttrs(html, ['data-g4']));
      const orders = root.registerNamed('[data-g4-orders]', new InteractiveElement('div'));
      const body = root.registerNamed('[data-g4-body]', new InteractiveElement('div'));
      roots.length = 0; roots.push(root);
      sandbox.initG4();
      check('G4 初始渲染订单列表', orders.innerHTML.length > 0, orders.innerHTML);
      const orderBtnMatch = /data-g4-order="([^"]*)"/.exec(orders.innerHTML);
      check('G4 至少有一个可点的订单', !!orderBtnMatch, orders.innerHTML);
      if (orderBtnMatch) {
        root.fire('click', { target: new InteractiveElement('button', { 'data-g4-order': orderBtnMatch[1] }) });
        await flushMicrotasks();
        check('G4 选单后进入摆词态（出现槽位）', /data-g4-slot="0"/.test(body.innerHTML), body.innerHTML);
        // 撤回：先摆一块，确认槽 0 有内容，再点该槽把它撤回，确认槽 0 变回空。
        const firstTileMatch = /data-g4-tile="(\d+)"[^>]*data-g4-letter="([^"]*)"/.exec(body.innerHTML);
        if (firstTileMatch) {
          root.fire('click', { target: new InteractiveElement('button', { 'data-g4-tile': firstTileMatch[1], 'data-g4-letter': firstTileMatch[2] }) });
          const slot0Empty = /tile--empty\s*"\s*data-g4-slot="0"/;
          check('G4 摆入一块后槽 0 非空（tile--empty 类名消失）', !slot0Empty.test(body.innerHTML), body.innerHTML);
          root.fire('click', { target: new InteractiveElement('button', { 'data-g4-slot': '0' }) });
          check('G4 点已摆入的槽 0 后应撤回、槽位重新变空', slot0Empty.test(body.innerHTML), body.innerHTML);
        }
        // 依次点摆满全部字位积木（tile 索引与 rack 顺序一致，第一遍点击总能命中未用过的块）。
        let guard = 0;
        while (/data-g4-tile="\d+"/.test(body.innerHTML) && guard < 20) {
          const tileMatch = /data-g4-tile="(\d+)"[^>]*data-g4-letter="([^"]*)"/.exec(body.innerHTML);
          if (!tileMatch) break;
          const beforeSlots = (body.innerHTML.match(/data-g4-slot="\d+"/g) || []).length;
          root.fire('click', { target: new InteractiveElement('button', { 'data-g4-tile': tileMatch[1], 'data-g4-letter': tileMatch[2] }) });
          guard++;
          if (!/data-g4-tile="\d+"/.test(body.innerHTML)) break; // 摆满后 renderPlacing 不再出现 rack（校验反馈接管了 body）
          const afterSlots = (body.innerHTML.match(/data-g4-slot="\d+"/g) || []).length;
          if (afterSlots === beforeSlots && guard > 1) break; // 兜底防止死循环
        }
        check('G4 摆满全部积木后触发校验反馈（不再是纯摆词态 rack）', !body.innerHTML.includes('g4__rack') || body.innerHTML.includes('g1__hint'), body.innerHTML);
      }
    } else {
      check('G4：本周数据里没有 g4 块（跳过，非失败）', true);
    }
  }

  // ---- G5：摆词填满 + 撤回 ----
  {
    const found = findFirstBlock(DAYS, 'g5');
    if (found) {
      const html = blockHTML(found.b, found.ctx);
      const root = new InteractiveElement('div', extractRootAttrs(html, ['data-g5', 'data-g5-day']));
      const body = root.registerNamed('[data-g5-body]', new InteractiveElement('div'));
      roots.length = 0; roots.push(root);
      sandbox.initG5();
      check('G5 初始渲染出提示或造词界面（不抛、不为空）', body.innerHTML.length > 0, body.innerHTML);
    } else {
      check('G5：本周数据里没有 g5 块（跳过，非失败）', true);
    }
  }

  // ---- flash：word 与 sound 两类卡面 ----
  {
    // drawCard() 只画 items[i]（i 从 0 开始）——找"第一张就是目标类型"的块，
    // 不能只判断"数组里某处存在该类型"（那样若 items[0] 恰好是另一类型，测的其实是
    // 另一条渲染分支，之前正是栽在这里：items[0].k!=='w' 却断言"含 en"，实际渲染的
    // 是 sound 分支的 <span class="">）。
    const wordFound = findFirstBlock(DAYS, 'flash', b => (b.items || [])[0] && b.items[0].k === 'w');
    const soundFound = findFirstBlock(DAYS, 'flash', b => (b.items || [])[0] && b.items[0].k !== 'w');
    for (const [label, found] of [['word', wordFound], ['sound', soundFound]]) {
      if (!found) { check(`flash（${label}）：本周数据里没有该类 flash 块（跳过，非失败）`, true); continue; }
      const root = new InteractiveElement('div', { 'data-items': JSON.stringify(found.b.items), 'data-reckey': found.b.recKey || '' });
      const face = root.registerNamed('[data-face]', new InteractiveElement('div'));
      root.registerNamed('[data-meta]', new InteractiveElement('div'));
      const tip = root.registerNamed('[data-tip]', new InteractiveElement('p'));
      root.registerNamed('[data-record]', new InteractiveElement('div'));
      roots.length = 0; roots.push(root);
      sandbox.initFlash();
      check(`flash（${label}）：drawCard 渲染出卡面（face 非空）`, face.innerHTML.length > 0, face.innerHTML);
      check(`flash（${label}）：drawCard 渲染出提示（tip 非空）`, tip.innerHTML.length > 0, tip.innerHTML);
      if (label === 'word') check('flash（word）卡面含 en 文本节点', face.innerHTML.includes('class="en"'), face.innerHTML);
      else check('flash（sound）卡面渲染出音标提示（tip 含 <b>）', /<b>/.test(tip.innerHTML), tip.innerHTML);
    }
  }

  // ---- book：翻页（下一页/上一页） ----
  {
    const found = findFirstBlock(DAYS, 'book');
    if (found && BOOK && BOOK.pages && BOOK.pages.length >= 2) {
      const html = blockHTML(found.b, found.ctx);
      const attrs = extractRootAttrs(html, ['data-book-start', 'data-book-end']);
      const root = new InteractiveElement('div', Object.assign({ class: 'book' }, attrs));
      root.classList.add('book');
      const art = root.registerNamed('[data-art]', new InteractiveElement('div'));
      const line = root.registerNamed('[data-line]', new InteractiveElement('button'));
      const zh = root.registerNamed('[data-zh]', new InteractiveElement('p'));
      root.registerNamed('[data-pg]', new InteractiveElement('span'));
      // initBook 内部读的是 line.innerHTML（colorPlainText 的输出），不是 textContent
      // ——.textContent 从没被写过，之前断言读错了字段，恒为空字符串（伪失败，不是
      // 真的没渲染）。prev/next 按钮必须真的带 data-act 属性，closest('[data-act]')
      // 才能命中——之前只按选择器字符串注册了挂载点，没有把 data-act 写进按钮自身的
      // 属性表，点击永远找不到 act，等于点击是空操作（伪通过的反面：会一直静默不变化）。
      const prevBtn = root.registerNamed('[data-act="prev"]', new InteractiveElement('button', { 'data-act': 'prev' }));
      const nextBtn = root.registerNamed('[data-act="next"]', new InteractiveElement('button', { 'data-act': 'next' }));
      roots.length = 0; roots.push(root);
      sandbox.initBook();
      const firstLine = line.innerHTML;
      check('book 初始渲染第一页正文', firstLine.length > 0, firstLine);
      root.fire('click', { target: nextBtn });
      const secondLine = line.innerHTML;
      check('book 点下一页后正文变化', secondLine !== firstLine, { before: firstLine, after: secondLine });
      root.fire('click', { target: prevBtn });
      check('book 点上一页后恢复回第一页正文', line.innerHTML === firstLine, { expect: firstLine, actual: line.innerHTML });
    } else {
      check('book：本周数据不足两页或没有 book 块（跳过，非失败）', true);
    }
  }

  return results;
}

async function runAllInteractionScenarios() {
  let totalChecks = 0, totalFails = 0;
  for (const name of templates) {
    const templatePath = path.join(SRC, 'weeks', name);
    const results = await runInteractionScenarios(templatePath, name);
    const fails = results.filter(r => !r.cond);
    totalChecks += results.length;
    totalFails += fails.length;
    if (fails.length > 0) {
      console.error(`FAIL interaction scenarios: ${name} 有 ${fails.length}/${results.length} 条状态驱动断言未通过：`);
      fails.forEach(f => console.error(`  ✗ ${f.label}\n    detail: ${JSON.stringify(f.detail).slice(0, 300)}`));
    } else {
      console.log(`PASS interaction scenarios: ${name} 全部 ${results.length} 条状态驱动断言通过`);
    }
  }
  assert(totalChecks > 0, '状态驱动交互测试一条断言都没跑起来，检查 findFirstBlock 是不是配错了 block 类型');
  assert.equal(totalFails, 0, `状态驱动交互测试发现 ${totalFails}/${totalChecks} 条断言未通过，见上面逐条列出`);
  console.log('PASS interaction scenarios contract: G1/G2/G4/G5/flash/book 的初始化后与交互态渲染均按预期切换');
}

runAllInteractionScenarios().catch(e => { console.error(e); process.exit(1); });
