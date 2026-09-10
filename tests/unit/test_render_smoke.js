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

/* 轮 D M2 走查结论（2026-09-10，逐份核对四份 week0N.template.html）：
 * 每份模板恰好两个 <script> 标签。第一段只在其中定义
 * `const bookArt = key => bookArtHTML(key)`（懒引用，箭头函数体到真正调用时才解析
 * `bookArtHTML`，本身已经是 T3-2 为规避这个跨 script 时序坑加的写法）——不在第一段
 * 里立即调用它，也不在第一段里出现 celebrateNat/printBook/wallTileLitState 的任何
 * 调用。这四个共享函数的定义（`@include shared/render-blocks.js`）与它们的全部调用
 * 点（celebrateNat() 内部、renderHome() 内部的 `wallTileLitState(c)`、printBook()
 * 内部，以及文件末尾 `renderHome(); initDateSchedule();` 这两句启动调用）都落在
 * 第二段 <script> 之内——四份模板的 @include 顺序也确认 render-blocks.js 出现在
 * 这些函数体/启动调用的文本位置之前。同一个 <script> 标签内部函数声明会整体提升，
 * 所以就算文本顺序颠倒也不会因为"分段执行"而报错；但四份模板现状是"先定义后调用"，
 * 分段执行与拼接执行对现状四份模板给出的结论一致（均全绿，见下方 render smoke 测试
 * 输出）——没有发现真实的跨 script 提前调用。改分段执行的价值是让"以后万一有人把
 * include 挪错位置"这类回归会被真实抓到，不是现在就抓到了一个隐藏故障。 */

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

// 抽出整页会用到的各段 <script>...</script> 内容，按文档顺序返回一个数组。
//
// 轮 D M2（外审 medium，2026-09-10）：改前把多段 script 拼成一份文本，一次性丢进
// `new vm.Script().runInContext()` 执行。拼接执行会靠 JS 的函数声明提升（function
// 声明在整份拼接文本的顶层作用域里统一提升到最前面）掩盖"真实浏览器里，若某段
// script 在共享函数（bookArt/celebrateNat/printBook/wallTileLitState 等）定义所在
// 的 script 标签**之前**就调用了它"这类跨 <script> 时序错误——拼接后函数提升让调用
// 永远看得到定义，但真实浏览器是逐个 <script> 标签顺序执行，前一个标签执行时后一个
// 标签里的 function 声明根本还不存在，会抛 ReferenceError。
// 改法：调用方按原 <script> 顺序对每一段各自 `new vm.Script().runInContext(同一
// context)`，不再拼接成一份文本——vm 的 Script 是"经典脚本"语义，每次
// runInContext() 都在同一个 contextified 全局对象上执行，跨次调用之间 var/function
// 声明的全局绑定是共享的（与浏览器同一 window 下多个 <script> 标签的语义一致），
// 但**执行时机**严格按调用顺序发生——如果调用方在跑到某一段之前就先调用了它里面
// 定义的函数，会像真实浏览器一样立即 ReferenceError，不会被"先拼后跑"悄悄放行。
function extractScripts(expandedHtml) {
  const scripts = [];
  const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(expandedHtml))) scripts.push(m[1]);
  if (scripts.length === 0) throw new Error('expanded template 里没有找到任何 <script> 块，展开逻辑是不是跟 build_lessons.py 分叉了');
  return scripts;
}

// 按原 <script> 顺序逐段执行（同一 vm context，不拼接）。`extra`（可选）是本文件
// 自己追加的探测/收集代码（HARNESS 之类），作为最后一段单独执行——它不是模板真实
// <script> 的一部分，但同样遵守"必须在它引用的函数定义之后执行"这条规则，所以放在
// 全部真实 script 段之后执行是正确的时序，不是抄近路。
function runScriptsInOrder(sandbox, segments, filenameBase, extra) {
  segments.forEach((code, i) => {
    new vm.Script(code, { filename: `${filenameBase}#script${i}` }).runInContext(sandbox);
  });
  if (extra) new vm.Script(extra, { filename: `${filenameBase}#harness` }).runInContext(sandbox);
}

/* 破坏验证（轮 D M2）：证明"分段执行"与"拼接执行"在跨 <script> 提前调用这件事上
 * 确实给出不同结论——不是只改了写法、行为等价的重构。segA 在自己的 script 里调用
 * `foo()`，`foo` 要到 segB 才声明。拼接执行时 `foo` 的 function 声明被提升到整份
 * 拼接文本的最前面，segA 执行到调用点时 `foo` 已经存在，不会报错；分段执行时 segA
 * 单独作为一次 runInContext() 调用，`foo` 这时还没有被声明过，必须真实抛
 * ReferenceError——这正是本文件其余渲染冒烟测试现在能够查出的那类跨 script 时序错误。 */
{
  const segA = 'try { globalThis.__orderProbe = foo(); } catch(e) { globalThis.__orderProbe = "ReferenceError:" + e.message; }';
  const segB = 'function foo(){ return "called"; }';

  const concatSandbox = {}; vm.createContext(concatSandbox);
  new vm.Script(segA + '\n;\n' + segB, { filename: '(order-probe concat)' }).runInContext(concatSandbox);
  assert.equal(concatSandbox.__orderProbe, 'called',
    '拼接执行的对照组应该因为函数声明提升而"看不出"提前调用的问题（本身不是本次要修的行为，只是用来对照）');

  const segSandbox = {}; vm.createContext(segSandbox);
  runScriptsInOrder(segSandbox, [segA, segB], '(order-probe segmented)');
  assert(String(segSandbox.__orderProbe).startsWith('ReferenceError:'),
    `分段执行应该像真实浏览器一样立即抛 ReferenceError（这正是 runScriptsInOrder 改前的拼接执行会掩盖的差别），实际：${segSandbox.__orderProbe}`);
  console.log('PASS order probe（轮 D M2 破坏验证）：分段执行确实会让跨 script 提前调用报错，拼接执行确实会被函数提升掩盖——两种执行方式结论不同，证明本次改动是实质性的');
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
    __renderResults: [],
    __wallLitStateResults: [],
    __allLitResults: [],
    __mediaGuardResults: []
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
  const segments = extractScripts(expanded);
  const sandbox = makeSandbox();
  runScriptsInOrder(sandbox, segments, templatePath, HARNESS);
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
 * 首页 hero 积木墙点亮态三态用例（M1，外审 medium，2026-09-10）
 *
 * frontend/src/shared/render-blocks.js 新增的共享函数 wallTileLitState(id) 把
 * "历史字位"与"本周新教但漏配 FIRST_TEACH_DAY 的数据错误"两种情形分开处理，改前
 * 三份模板各自内联的 `FIRST_TEACH_DAY[c] != null ? dayDone(...) : true` 把两者合并
 * 处理，后者会被静默显示为已点亮（不许改的口径是"历史字位恒点亮"本身，要修的是
 * "本周新教但缺数据"不该被当成历史字位处理）。
 *
 * 三态：
 *   - 历史字位（不在本周 META.newPatterns 里）：恒点亮。
 *   - 本周字位且已到首教日（有 FIRST_TEACH_DAY 记录）：按 dayDone(FIRST_TEACH_DAY[id])
 *     现算，与旧行为一致。
 *   - 本周字位但缺 FIRST_TEACH_DAY（数据错误，用真实周数据临时删掉一条记录模拟）：
 *     不点亮（这正是本次要修的行为差异——旧代码在这里会返回 true）。
 *
 * 用法与上面的渲染冒烟测试同一套 vm 沙箱机制：把探测代码拼进同一份 <script> 文本，
 * 直接引用 META/FIRST_TEACH_DAY/wallTileLitState/dayDone 这些 script 级词法绑定
 * （不是 sandbox 属性访问——const/let 声明不会出现在 vm 全局对象上），跑完把结果
 * push 进 sandbox 预先挂好的 __wallLitStateResults 数组。用真实周数据的 FIRST_TEACH_DAY
 * 条目做"删掉再恢复"的临时变异，不修改仓库文件。 */
const WALL_LIT_STATE_HARNESS = `
;(function(){
  var results = [];
  var historicalId = null;
  for (var i = 0; i < META.wallLetters.length; i++) {
    var c = META.wallLetters[i];
    if (META.newPatterns.indexOf(c) === -1) { historicalId = c; break; }
  }
  if (historicalId !== null) {
    results.push({ kase: 'historical', id: historicalId, lit: wallTileLitState(historicalId) });
  }
  if (META.newPatterns.length > 0) {
    var thisWeekId = META.newPatterns[0];
    results.push({
      kase: 'thisWeekHasFirstTeachDay', id: thisWeekId,
      lit: wallTileLitState(thisWeekId), expected: dayDone(FIRST_TEACH_DAY[thisWeekId])
    });

    var savedDay = FIRST_TEACH_DAY[thisWeekId];
    delete FIRST_TEACH_DAY[thisWeekId];
    results.push({ kase: 'thisWeekMissingFirstTeachDay', id: thisWeekId, lit: wallTileLitState(thisWeekId) });
    FIRST_TEACH_DAY[thisWeekId] = savedDay;
  }
  __wallLitStateResults.push.apply(__wallLitStateResults, results);
})();
`;

function wallLitStateForWeek(templatePath) {
  const expanded = expand(fs.readFileSync(templatePath, 'utf8'), []);
  const segments = extractScripts(expanded);
  const sandbox = makeSandbox();
  runScriptsInOrder(sandbox, segments, templatePath, WALL_LIT_STATE_HARNESS);
  return sandbox.__wallLitStateResults;
}

{
  const seenCases = new Set();
  let checkedTemplates = 0;
  for (const name of templates) {
    const templatePath = path.join(SRC, 'weeks', name);
    const results = wallLitStateForWeek(templatePath);
    assert(results.length > 0, `${name}：wallLitState 探测未产生任何结果，检查 WALL_LIT_STATE_HARNESS 是否与该周数据结构不匹配`);
    for (const r of results) {
      seenCases.add(r.kase);
      if (r.kase === 'historical') {
        assert.equal(r.lit, true, `${name}：历史字位 "${r.id}" 应恒点亮，实际 ${r.lit}`);
      } else if (r.kase === 'thisWeekHasFirstTeachDay') {
        assert.equal(r.lit, r.expected, `${name}：本周字位 "${r.id}" 有 FIRST_TEACH_DAY 时应按 dayDone 现算，期望 ${r.expected}，实际 ${r.lit}`);
      } else if (r.kase === 'thisWeekMissingFirstTeachDay') {
        assert.equal(r.lit, false, `${name}：本周字位 "${r.id}" 缺 FIRST_TEACH_DAY（数据错误）不应被点亮，实际 ${r.lit}——` +
          '这正是 M1 要修的行为差异：旧实现会把这种情形误判成历史字位而显示为已点亮');
      } else {
        assert.fail(`${name}：未知的 wallLitState 用例标识 "${r.kase}"`);
      }
    }
    checkedTemplates++;
  }
  assert(checkedTemplates > 0, '首页积木墙点亮态三态用例一个模板都没跑起来');
  assert.deepEqual([...seenCases].sort(), ['historical', 'thisWeekHasFirstTeachDay', 'thisWeekMissingFirstTeachDay'],
    `首页积木墙点亮态三态用例未能覆盖全部三态，实际覆盖：${[...seenCases].sort().join(',')}`);
  console.log(`PASS wall lit state：${checkedTemplates} 份模板均覆盖三态（历史字位恒点亮/本周字位按 dayDone 现算/本周字位缺 FIRST_TEACH_DAY 时不点亮），共验证 ${seenCases.size} 类场景`);
}

/* T3-1（外审 medium，2026-09-10）：week04.template.html 改前硬编码 `const lit = true`，
 * 理由是"本周不教新音，newPatterns 恒空数组，逻辑上确实全部恒点亮"——现在四份模板
 * 统一调用共享函数 wallTileLitState，这里专门证明"newPatterns 为空时，经共享函数
 * 算出来的结果确实与硬编码 true 等价"，不是断言"看起来应该对"就当它对。 */
const ALL_LIT_WHEN_NO_NEW_PATTERNS_HARNESS = `
;(function(){
  var results = [];
  if (META.newPatterns.length === 0) {
    var wallIds = assertIdList(META.wallLetters, SOUNDS);
    results.push({
      count: wallIds.length,
      allLit: wallIds.every(function(id){ return wallTileLitState(id) === true; })
    });
  }
  __allLitResults.push.apply(__allLitResults, results);
})();
`;

function allLitForWeek(templatePath) {
  const expanded = expand(fs.readFileSync(templatePath, 'utf8'), []);
  const segments = extractScripts(expanded);
  const sandbox = makeSandbox();
  runScriptsInOrder(sandbox, segments, templatePath, ALL_LIT_WHEN_NO_NEW_PATTERNS_HARNESS);
  return sandbox.__allLitResults;
}

{
  let checkedEmptyNewPatternsTemplates = 0;
  for (const name of templates) {
    const templatePath = path.join(SRC, 'weeks', name);
    const results = allLitForWeek(templatePath);
    if (results.length === 0) continue; // 本周 newPatterns 非空，不适用本用例
    assert.equal(results.length, 1, `${name}：ALL_LIT_WHEN_NO_NEW_PATTERNS_HARNESS 应恰好产生一条结果`);
    const { count, allLit } = results[0];
    assert(count > 0, `${name}：wallLetters 不应为空，检查 fixture`);
    assert.equal(allLit, true, `${name}：newPatterns 为空时，wallLetters 全部 ${count} 块经 wallTileLitState 都应点亮，实际有未点亮的`);
    checkedEmptyNewPatternsTemplates++;
  }
  assert.equal(checkedEmptyNewPatternsTemplates, 1,
    `预期恰好 1 份模板（week04）的 newPatterns 为空，实际 ${checkedEmptyNewPatternsTemplates} 份——` +
    '如果这个数字变了，说明有其他周也变成了巩固周形态，需要重新核对这条用例是否还覆盖到位');
  console.log(`PASS wall lit state（T3-1）：newPatterns 为空的 ${checkedEmptyNewPatternsTemplates} 份模板（week04），wallLetters 经共享函数结果全亮，与改前硬编码 true 等价`);

  /* T3-1 接线验证（轮 D M3 改写，2026-09-10，第十次恒真式候选）：改前这里是一条
   * 源码级正则 `/const lit = wallTileLitState\(c\);/.test(source)`——只要模板文件
   * 里**任何位置**（含注释、含已经不再执行的死代码）出现这段字面文本就能通过，不要求
   * 它真的在渲染路径上被执行、也不要求它的调用对象真的是 hero 积木墙的全部字位。
   * 改用运行时观测替代源码级断言：
   *   ① 猴子补丁 sandbox.wallTileLitState（同一份 contextified 全局对象上的属性——
   *      函数声明在经典 script 里就是全局对象的自有属性，reassign 会被同一作用域内
   *      其他函数下一次按名字查找时看到，这与浏览器里覆盖 window.wallTileLitState
   *      的语义一致），记录每次被调用时传入的字位 ID 与返回值；
   *   ② 重新调用一次 renderHome()（模板文件末尾已经启动调用过一次未插桩的版本，这里
   *      是插桩后的第二次调用，用于采集观测数据，不影响断言语义——renderHome() 是
   *      幂等的整段 innerHTML 重渲染，不依赖"只能调一次"）；
   *   ③ 断言"实际被调用过的字位 ID 集合" === META.wallLetters 集合——不多不少，
   *      证明真的是"给点亮墙的每一块积木都调了一次"，不是碰巧调了几个就通过；
   *   ④ 从重渲染后的 `document.getElementById('app').innerHTML` 里逐块解析
   *      `data-grapheme-id` 与 class 是否含 `tile--wallon`，与①记录的返回值逐一比对
   *      ——证明"包装函数返回的 lit"与"最终渲染出的 class"确实一致，不是调用了
   *      函数但没有真的把返回值接到渲染结果上。
   * 四份模板各跑一次，覆盖范围与改前源码正则声称覆盖的范围相同（四份模板），但现在
   * 断言的是"真的执行、真的接上、覆盖面精确"而不是"文件里出现过这行文本"。 */
  /* H2（轮 D 复审第二轮，外审 high，2026-09-10）：改前的猴子补丁
   * `sandbox.wallTileLitState = function(id){ const lit = original(id); ...;
   * return lit; }` 原样透传 `original(id)` 的返回值——这只证明了"包装函数被调用
   * 过"，不证明"渲染出的 class 真的是被包装函数的返回值驱动的"：模板若在别处
   * 另算了一套逻辑（哪怕完全不读包装函数的返回值），只要那套逻辑碰巧算出同样的
   * 真假值（现实中大概率如此——四份模板的点亮态本来就该一致），渲染出的 class
   * 与 `observed` 记录的返回值照样逐一相等，这条断言依然全绿，测不出"没接上"这类
   * 回归。
   * 改法：不原样透传，而是**扰动**——用与自然真值无关的规则强行改写返回值，跑
   * 两组互补的扰动映射：
   *   组 A：对每个 ID 返回自然值的反值（!original(id)）；
   *   组 B：按调用顺序下标奇偶交错真假（与 A 的规则不同、也与自然值无关）。
   * 两组扰动后的返回值集合互不相同（A 是"全部取反"，B 是"按下标奇偶"，只要
   * wallLetters 长度 > 1 就不会退化成同一组值），若渲染出的 class 都能跟着两组
   * 各自不同的扰动结果走，才说明 class 真的是由这个函数的返回值决定的——只算
   * 一套"看起来正确"的独立逻辑不可能同时满足两组互相矛盾的扰动结果。
   * 同时（M1）：记录每个 ID 的调用次数，断言均为 1（不多不少，防止重复调用/漏调
   * 被"最终结果碰巧对"掩盖）；解析 class 时显式断言 `tile--wallon` 与
   * `tile--walloff` 恰有一个命中，不隐含"没有 wallon 就是 walloff"这个未经断言
   * 的假设。 */
  const WALL_CALL_TRACKING_BRIDGE = '__BRIDGE_META = META; __BRIDGE_APP = document.getElementById("app");';
  function wallCallTrackingForWeek(templatePath, perturb) {
    const expanded = expand(fs.readFileSync(templatePath, 'utf8'), []);
    const segments = extractScripts(expanded);
    const sandbox = makeSandbox();
    runScriptsInOrder(sandbox, segments, templatePath); // 未插桩的第一次调用（模板末尾的启动调用），与真实页面加载行为一致
    new vm.Script(WALL_CALL_TRACKING_BRIDGE, { filename: templatePath + ' (wall-call-tracking bridge)' }).runInContext(sandbox);
    const META = sandbox.__BRIDGE_META;
    const app = sandbox.__BRIDGE_APP;

    const original = sandbox.wallTileLitState;
    assert.equal(typeof original, 'function', `${templatePath}：wallTileLitState 应该是共享函数（render-blocks.js 里的顶层函数声明），实际 ${typeof original}`);
    const observed = new Map(); // id -> 本次插桩实际返回的值（自然值或扰动值）
    const callCounts = new Map(); // id -> 调用次数
    let callIndex = 0;
    sandbox.wallTileLitState = function (id) {
      callCounts.set(id, (callCounts.get(id) || 0) + 1);
      const natural = original(id);
      const forced = perturb ? perturb(natural, id, callIndex) : natural;
      callIndex++;
      observed.set(id, forced);
      return forced;
    };
    sandbox.renderHome(); // 插桩后的第二次调用，采集观测数据
    sandbox.wallTileLitState = original; // 复位，不影响本文件其余用例（虽然各用例各自 makeSandbox，互不共享，仅为整洁）

    const renderedLit = new Map(); // id -> 从 innerHTML 解析出的 tile--wallon/walloff
    const tileRe = /<(?:button|div)[^>]*class="([^"]*)"[^>]*data-grapheme-id="([^"]*)"[^>]*>/g;
    let m;
    while ((m = tileRe.exec(app.innerHTML))) {
      const cls = m[1], id = m[2];
      if (renderedLit.has(id)) continue; // 只认 hero 积木墙这一处（第一次出现），页面其余位置若也用了 data-grapheme-id 不重复覆盖
      const hasOn = /(^|\s)tile--wallon(\s|$)/.test(cls);
      const hasOff = /(^|\s)tile--walloff(\s|$)/.test(cls);
      assert.notEqual(hasOn, hasOff,
        `${templatePath}：字位 "${id}" 的 class（${JSON.stringify(cls)}）应恰好命中 tile--wallon/tile--walloff 二者之一，不是"没命中就当作另一个"的隐含假设`);
      renderedLit.set(id, hasOn);
    }
    return { META, observedIds: [...observed.keys()], observed, renderedLit, callCounts };
  }

  const PERTURBATIONS = [
    { label: '自然值（透传，回归既有断言）', fn: null },
    { label: '组 A：全部取反', fn: natural => !natural },
    { label: '组 B：按调用下标奇偶交错', fn: (natural, id, index) => index % 2 === 0 },
  ];

  let checkedCallTracking = 0;
  for (const name of templates) {
    const templatePath = path.join(SRC, 'weeks', name);
    const perGroupObserved = [];
    for (const { label, fn } of PERTURBATIONS) {
      const { META, observedIds, observed, renderedLit, callCounts } = wallCallTrackingForWeek(templatePath, fn);
      assert.deepEqual([...observedIds].sort(), [...META.wallLetters].sort(),
        `${name}（${label}）：wallTileLitState 实际被调用的字位集合应恰好等于 META.wallLetters，实际调用集合 [${[...observedIds].sort()}]，期望 [${[...META.wallLetters].sort()}]——` +
        '这正是运行时观测要证明的：真的对点亮墙的每一块积木都调了一次，不多不少');
      for (const id of META.wallLetters) {
        assert.equal(callCounts.get(id), 1,
          `${name}（${label}）：字位 "${id}" 的 wallTileLitState 调用次数应恰好为 1，实际 ${callCounts.get(id)}（M1：重复调用/漏调都可能被"最终结果碰巧对"掩盖）`);
      }
      for (const [id, lit] of observed) {
        assert(renderedLit.has(id), `${name}（${label}）：字位 "${id}" 被 wallTileLitState 调用过，但渲染出的 hero 积木墙里找不到对应的 data-grapheme-id 块`);
        assert.equal(renderedLit.get(id), lit,
          `${name}（${label}）：字位 "${id}" 包装函数返回 lit=${lit}，但渲染出的 class 显示 ${renderedLit.get(id) ? 'tile--wallon' : 'tile--walloff'}，两者不一致——` +
          '这一步在扰动组（组 A/组 B）里尤其关键：证明的不是"结果碰巧一致"，而是渲染出的 class 真的随扰动结果变化');
      }
      perGroupObserved.push({ label, values: [...observed.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v) });
    }
    // 交叉核验：组 A 与组 B 的扰动结果集合必须互不相同（否则"两组扰动都能通过"
    // 这件事本身没有区分力——如果两组算出来的值序列一样，通过两次也只是通过了
    // 同一组断言两次）。wallLetters 长度 > 1 时，"全部取反" 与 "按下标奇偶" 这两条
    // 规则在绝大多数情况下会给出不同的序列；用真实断言钉住而不是假设。
    const [, groupA, groupB] = perGroupObserved;
    assert.notDeepEqual(groupA.values, groupB.values,
      `${name}：组 A（全部取反）与组 B（按下标奇偶）的扰动结果序列不应相同，否则两组扰动不构成有效的交叉验证。A=${JSON.stringify(groupA.values)} B=${JSON.stringify(groupB.values)}`);
    checkedCallTracking++;
  }
  assert.equal(checkedCallTracking, templates.length, '运行时调用追踪应覆盖全部模板');
  console.log(`PASS wall lit state（T3-1 接线验证·运行时观测 + H2 扰动验证）：${checkedCallTracking} 份模板均确认 wallTileLitState 被恰好对 META.wallLetters 全集调用一次（每 ID 恰好 1 次），且在自然值/取反/按下标奇偶三组互不相同的扰动下，渲染出的 tile--wallon/walloff 均与包装函数返回值逐一一致——证明渲染 class 真的由该函数的返回值驱动，不是碰巧算出同样答案的独立逻辑`);
}

/* T3-2（外审 medium，2026-09-10）：week01 改前的三处素材守卫（bookArt 直接回退
 * ART[key]、celebrateNat 无条件输出、printBook 无条件输出 BOOK_IMG[pg.art]）缺图
 * 键时会把 undefined 或空 src 渲染进 DOM——补渲染冒烟：分别调 bookArtHTML/
 * celebrateNatHeroHTML/printBookArtHTML 传一个必然不存在的键，断言结果里不出现
 * "undefined" 字面量、也不出现空 src（src=""）。四份模板现在共用同一个实现，
 * 这里跑一遍就覆盖全部四份。 */
const MEDIA_GUARD_HARNESS = `
;(function(){
  var results = [];
  var MISSING_KEY = '__definitely_missing_key_for_test__';
  results.push({ name: 'bookArtHTML', html: bookArtHTML(MISSING_KEY) });
  results.push({ name: 'printBookArtHTML', html: printBookArtHTML(MISSING_KEY) });
  // CELEBRATE_NAT 是 const，四周现役数据里恒非空，这里不去改它（改不了，也不该改
  // 真实数据模拟"缺图"）——celebrateNatHeroHTML() 用真实 CELEBRATE_NAT 值调一次，
  // 只断言正常路径不出现 undefined/空 src；"CELEBRATE_NAT 为空"这一支的分辨力见
  // 下方独立的 CELEBRATE_NAT_EMPTY_GUARD_CHECK（只加载 render-blocks.js 本身，
  // 在隔离作用域里自己声明一个空 CELEBRATE_NAT，不依赖四周任何一份真实数据）。
  results.push({ name: 'celebrateNatHeroHTML', html: celebrateNatHeroHTML() });
  __mediaGuardResults.push.apply(__mediaGuardResults, results);
})();
`;

function mediaGuardForWeek(templatePath) {
  const expanded = expand(fs.readFileSync(templatePath, 'utf8'), []);
  const segments = extractScripts(expanded);
  const sandbox = makeSandbox();
  runScriptsInOrder(sandbox, segments, templatePath, MEDIA_GUARD_HARNESS);
  return sandbox.__mediaGuardResults;
}

{
  let checked = 0;
  for (const name of templates) {
    const templatePath = path.join(SRC, 'weeks', name);
    const results = mediaGuardForWeek(templatePath);
    assert.equal(results.length, 3, `${name}：MEDIA_GUARD_HARNESS 应产生 3 条结果（bookArtHTML/printBookArtHTML/celebrateNatHeroHTML）`);
    for (const r of results) {
      assert.equal(typeof r.html, 'string', `${name}：${r.name} 应返回字符串（可以是空串），实际 ${typeof r.html}`);
      assert(!r.html.includes('undefined'), `${name}：${r.name} 不应把字面量 "undefined" 渲染进 DOM，实际：${r.html}`);
      assert(!/\ssrc=["']["']/.test(r.html), `${name}：${r.name} 不应渲染空 src 的 <img>，实际：${r.html}`);
    }
    checked++;
  }
  assert.equal(checked, templates.length, '素材守卫渲染冒烟应覆盖全部模板');
  console.log(`PASS media guard（T3-2）：${checked} 份模板的 bookArtHTML/printBookArtHTML 缺图键、celebrateNatHeroHTML 正常路径均不渲染 undefined 或空 src`);
}

/* CELEBRATE_NAT 为空时 celebrateNatHeroHTML() 应返回空串——四周现役数据的
 * CELEBRATE_NAT 恒非空（const，不能在上面的沙箱里临时改成空串来测这一支），这里
 * 单独起一个隔离的 vm 作用域，只加载 frontend/src/shared/render-blocks.js 需要
 * 的最小依赖（escapeHtmlAttribute 供其他函数用，这里用不到）+ 自己声明一个空
 * CELEBRATE_NAT，直接证明这一支分支本身确实会被走到、且确实返回空串，不是永远
 * 走不到的死代码。 */
{
  const renderBlocksSrc = fs.readFileSync(path.join(SRC, 'shared', 'render-blocks.js'), 'utf8');
  const sandbox = { console, __result: undefined };
  vm.createContext(sandbox);
  const script = new vm.Script(
    "const CELEBRATE_NAT = '';\n" + renderBlocksSrc + "\n__result = celebrateNatHeroHTML();",
    { filename: 'render-blocks.js (isolated CELEBRATE_NAT empty check)' }
  );
  script.runInContext(sandbox);
  assert.equal(sandbox.__result, '', `celebrateNatHeroHTML() 应在 CELEBRATE_NAT 为空时返回空串，实际：${JSON.stringify(sandbox.__result)}`);
  console.log('PASS media guard（T3-2 隔离验证）：CELEBRATE_NAT 为空时 celebrateNatHeroHTML() 确实返回空串（不是死代码）');
}

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
    this.style = {};   // bindLongPress（frontend/src/shared/longpress.js）直接写 el.style.userSelect
                        // 等属性，缺这个字段会在长按挂载那一刻直接抛 TypeError（见下方 querySelector
                        // 自动补全的同一条注释）。
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
  // H1 修复带出的连锁问题（2026-09-09）：改前 querySelector 找不到就返回 null——真实 DOM
  // 语义没错，但 G4/G5 摆对/摆出真词时，renderConfirmFeedback()/render() 会调用
  // `bindLongPress(body.querySelector('.g4__confirm'|'.g5__confirm'), ...)`，这两个深层
  // CSS 选择器从没被显式 registerNamed 过（body.innerHTML 只是字符串赋值，不会被解析成
  // 真实子节点树），传 null 给 bindLongPress 会在它内部 `el.querySelector(...)` 处直接
  // 抛 TypeError——G5 的"填满恰好拼出白名单真词"分支就踩了这个坑（week02 数据实测触发）。
  // 参照 tests/unit/test_synthetic_ai_integration.js 的 El.querySelector 同款处理：找不到
  // 就现造一个空元素返回并记住，不影响任何一条断言的判定依据（这类深层选择器从不被拿来
  // 断言 innerHTML，只被 bindLongPress 用来挂空的长按视觉效果），只是让长按能正常挂载。
  querySelector(sel) { if (!this._named.has(sel)) this._named.set(sel, new InteractiveElement('div')); return this._named.get(sel); }
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
  const segments = extractScripts(expanded);
  const sandbox = makeSandbox();
  runScriptsInOrder(sandbox, segments, templatePath); // 第一遍：与冒烟测试一样的空垫片，走完页面顶层收尾代码，按原 <script> 顺序逐段执行

  // 桥接顶层 `const DAYS`/`const WordAudio`：classic script 的顶层 const/let 绑定不会
  // 变成全局对象的自有属性（只有 function 声明会——blockHTML/initG1 等因此能直接以
  // sandbox.xxx 访问，DAYS/WordAudio 不能），但同一个已 contextify 的 sandbox 上
  // 后续再跑一段脚本，仍然共享同一个"Script 顶层词法环境"，能看到第一段脚本声明的
  // const/let。这里用一段极小的桥接脚本，把它们通过*不带 var/let/const 的裸赋值*
  // （sloppy 模式下等价于隐式全局属性赋值）挂到 sandbox 自身上，Node 侧才能读到同一个
  // 对象引用（对象引用本身与"怎么绑定"无关，读到之后修改 WordAudio.play 这类属性，
  // vm 内部代码看到的是同一个对象，修改立即生效）。
  // H1（外审 high，2026-09-09）：G5 场景要真正解锁摆词态，需要直接读写 state.js 顶层
  // 声明的 `state`（同 DAYS/WordAudio/BOOK 的桥接手法）——examRecorded(day) 读的是
  // state.days[day].checks[key]，不经桥接就没有任何办法从 Node 侧把它置位。
  new vm.Script('__BRIDGE_DAYS = DAYS; __BRIDGE_WORD_AUDIO = WordAudio; __BRIDGE_BOOK = BOOK; __BRIDGE_STATE = state;',
    { filename: templatePath + ' (bridge)' }).runInContext(sandbox);
  const DAYS = sandbox.__BRIDGE_DAYS;
  const BOOK = sandbox.__BRIDGE_BOOK;
  const STATE = sandbox.__BRIDGE_STATE;
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
        // M2 修复带出的连锁问题（2026-09-09，week02/03/04 实测触发）：改前用
        // `/data-g4-tile="(\d+)"[^>]*data-g4-letter="([^"]*)"/.exec(body.innerHTML)` 找
        // "下一块要点的积木"，不检查 disabled——rack 顺序固定不变（用过的积木原地变灰，
        // 不会从 DOM 里挪走），regex 永远匹配到文本上第一块积木，不管它是否已经被用过；
        // 而合成点击事件的 target 也没有真的 `.disabled` 属性可读（games.js 的
        // `if(tile && !tile.disabled)` 检查形同虚设），于是同一块积木会被反复点、同一个
        // 字母被重复摆进多个槽——槽位永远填不满（因为同一个 emptyIdx 逻辑虽然会往下一个
        // 空槽摆，但摆的都是同一个字母，凑不出目标词，也可能因为改前的"兜底防死循环"
        // 判据用错（见下方）而在填满前就提前退出循环）。改成显式跳过 disabled 积木，
        // 参照 G5 已有的同款处理（本文件 G5 场景的 firstEnabledTile）。
        const firstEnabledG4Tile = htmlStr => {
          const re = /<button[^>]*data-g4-tile="(\d+)"[^>]*data-g4-letter="([^"]*)"[^>]*>/g;
          let m;
          while ((m = re.exec(htmlStr))) { if (!/\bdisabled\b/.test(m[0])) return { idx: m[1], letter: m[2] }; }
          return null;
        };
        // 撤回：先摆一块，确认槽 0 有内容，再点该槽把它撤回，确认槽 0 变回空。
        const firstTile = firstEnabledG4Tile(body.innerHTML);
        if (firstTile) {
          root.fire('click', { target: new InteractiveElement('button', { 'data-g4-tile': firstTile.idx, 'data-g4-letter': firstTile.letter }) });
          const slot0Empty = /tile--empty\s*"\s*data-g4-slot="0"/;
          check('G4 摆入一块后槽 0 非空（tile--empty 类名消失）', !slot0Empty.test(body.innerHTML), body.innerHTML);
          root.fire('click', { target: new InteractiveElement('button', { 'data-g4-slot': '0' }) });
          check('G4 点已摆入的槽 0 后应撤回、槽位重新变空', slot0Empty.test(body.innerHTML), body.innerHTML);
        }
        // 依次点未用过（非 disabled）的积木，直到槽位全部填满触发 validate()。停止条件
        // 用"body 里还有没有 tile--empty"而不是"槽位元素总数变没变"——槽位元素总数从
        // 渲染起就固定不变（是槽的个数，不是"填了几个"），改前拿它当"卡住了"的判据恒真，
        // 是这条循环会提前退出的第二个原因。
        let guard = 0;
        while (body.innerHTML.includes('tile--empty') && guard < 20) {
          const tile = firstEnabledG4Tile(body.innerHTML);
          if (!tile) break;
          root.fire('click', { target: new InteractiveElement('button', { 'data-g4-tile': tile.idx, 'data-g4-letter': tile.letter }) });
          guard++;
        }
        // M2 修复（外审 medium，2026-09-09）：改前的断言 `!includes('g4__rack') ||
        // includes('g1__hint')` 是一条空 HTML、错误页面、任意不含 g4__rack 的内容都能
        // 通过的宽松析取式，而且 'g1__hint' 是 G1 的反馈类名，与 G4 无关（G4 的反馈段
        // 恰好复用了同一个 CSS 类名，断言命中的是"字面重合"不是"G4 真的触发了反馈"）。
        // 改成三条具体断言：①body 确实非空且反馈已接管（g4__rack 消失，body 有内容）；
        // ②反馈文案是 validate()/renderConfirmFeedback() 那几段固定文案之一（摆错/
        // 拼对/已确认，三选一，见 games.js 的 validate() 与 renderConfirmFeedback()）；
        // ③槽位状态确实"全部填满"（g4__slots 存在且不再含 tile--empty）。
        check('G4 摆满全部积木后 body 非空且不再是纯摆词态 rack', body.innerHTML.length > 0 && !body.innerHTML.includes('g4__rack'), body.innerHTML);
        check('G4 校验反馈显示具体的对/错文案（摆错提示 / 拼对确认 / 已确认三选一，不是宽松兜底）',
          /摆错了，点错的字母撤回再试/.test(body.innerHTML) || /拼对了！他自己指读了吗？/.test(body.innerHTML) || /已确认/.test(body.innerHTML),
          body.innerHTML);
        check('G4 校验反馈里的槽位确实全部填满（g4__slots 存在且不含 tile--empty）',
          body.innerHTML.includes('g4__slots') && !body.innerHTML.includes('tile--empty'), body.innerHTML);
      }
    } else {
      check('G4：本周数据里没有 g4 块（跳过，非失败）', true);
    }
  }

  // ---- G5：摆词填满 + 撤回 ----
  // H1 修复（外审 high，2026-09-09，"第五次同一模式"）：改前只调用 initG5() 断言初始
  // HTML 非空，注释却声称测的是"摆词填满 + 撤回"——实际一次积木点击都没发生，等于只测
  // 了初始化。真实 G5 有一道程序锁：examRecorded(day) 为 false 时永远渲染 g5__lock-note
  // （见 games.js renderLockedView()），不真正解锁就点不动任何积木，"填满/撤回"根本
  // 无从发生。参照 tests/unit/test_synthetic_ai_integration.js 的 testG5SurfaceLookupFindsWord()
  // ——同样先把 state.days[day].checks[key] 置位解锁，再真正点积木、真正断言状态变化。
  {
    const found = findFirstBlock(DAYS, 'g5');
    if (found) {
      // 解锁：examRecorded(day) 的判据（state.js:225-231）是"DAYS[day-1] 里含 exam 块
      // 的那个 step 的下标，拼成 key = day-stepIdx-0"，这里原样复算同一条判据（不是
      // 凭空编一个 key），再直接写 state.days[day].checks[key]=true——与合成周测试
      // 桥接 state 的手法一致，只是这里用的是真实周数据，day/stepIdx 是走查出来的。
      const dayNum = found.ctx.day;
      const dayDecl = DAYS[dayNum - 1];
      const examStepIdx = dayDecl.steps.findIndex(s => s.blocks.some(b => b.b === 'exam'));
      if (examStepIdx !== -1) {
        const key = dayNum + '-' + examStepIdx + '-0';
        STATE.days[dayNum] = { checks: { [key]: true } };
      }
      const html = blockHTML(found.b, found.ctx);
      const root = new InteractiveElement('div', extractRootAttrs(html, ['data-g5', 'data-g5-day']));
      const body = root.registerNamed('[data-g5-body]', new InteractiveElement('div'));
      roots.length = 0; roots.push(root);
      sandbox.initG5();
      check('G5：真实数据里这一天确实含 exam 块（解锁判据存在，不是无法解锁的孤儿块）', examStepIdx !== -1, { day: dayNum });
      check('G5 解锁后不再是锁定提示（g5__lock-note 消失）', !/g5__lock-note/.test(body.innerHTML), body.innerHTML);

      // 依次点未用过（非 disabled）的积木，直到摆满默认 3 槽——G5 的 rack 与 G4 不同，
      // 摆满后 rack 仍然整段保留在 body 里（只是已用积木带 disabled），不能像 G4 那样
      // 靠"rack 消失"判断填满，必须显式跳过已 disabled 的积木，否则会重复点同一块。
      const firstEnabledTile = htmlStr => {
        const re = /<button[^>]*data-g5-tile="(\d+)"[^>]*data-g5-letter="([^"]*)"[^>]*>/g;
        let m;
        while ((m = re.exec(htmlStr))) { if (!/\bdisabled\b/.test(m[0])) return { idx: m[1], letter: m[2] }; }
        return null;
      };
      let guard = 0;
      while (guard < 10 && !/g1__hint/.test(body.innerHTML)) {
        const tile = firstEnabledTile(body.innerHTML);
        if (!tile) break;
        root.fire('click', { target: new InteractiveElement('button', { 'data-g5-tile': tile.idx, 'data-g5-letter': tile.letter }) });
        guard++;
      }
      check('G5 摆满全部槽位后进入反馈态（出现 g1__hint 反馈文案：拼出一个词 / 这个组合读读看）',
        /g1__hint/.test(body.innerHTML), body.innerHTML);
      check('G5 反馈态的槽位确实全部填满（不含 tile--empty）', !body.innerHTML.includes('tile--empty'), body.innerHTML);

      // 撤回：点第一个已摆入的槽位，确认它变回空、反馈文案随之消失（full 变回 false）。
      const slotMatch = /data-g5-slot="(\d+)"/.exec(body.innerHTML);
      if (slotMatch) {
        root.fire('click', { target: new InteractiveElement('button', { 'data-g5-slot': slotMatch[1] }) });
        const thisSlotEmpty = new RegExp('tile--empty"\\s*data-g5-slot="' + slotMatch[1] + '"');
        check('G5 点已摆入的槽位后应撤回、该槽位重新变空（tile--empty 类名出现）', thisSlotEmpty.test(body.innerHTML), body.innerHTML);
        check('G5 撤回后不再是"全部填满"的反馈态（g1__hint 消失）', !/g1__hint/.test(body.innerHTML), body.innerHTML);
      } else {
        check('G5：未找到任何已摆入的槽位可供撤回测试（摆满逻辑异常）', false, body.innerHTML);
      }
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
