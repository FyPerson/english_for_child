/* 里程碑 2 第 4b 步收口批新增：渲染冒烟测试。
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
