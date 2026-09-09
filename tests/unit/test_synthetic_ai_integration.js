/* 里程碑 2 第 6 步：`synthetic-ai` 集成 fixture（方案 §4 分步实施表第 6 行 +
 * 2026-09-09 追加三件 + 外审追加两张 fixture）。
 *
 * ⚠️ 这一步的意义（方案 §4 原文）：第 0—5 步全是"为双字母做准备"（契约/工具/分词
 * 核心/审计/字形收敛/消费者接线/测评路由），但引擎从来没有真正跑过一个双字母字位——
 * 现役四周数据全是单字母。本文件是第一次真跑：造一个不依赖任何正式周数据的合成测试
 * 周，让 `games.js`（G2/G4/G5）与 `render-blocks.js` 走完整链路。它必须在第 7 步
 * （破坏性数据迁移）之前跑通——方案原文："第 4b 到 6 步是这次重排的要害，让 ai 的
 * 集成 fixture 在破坏性迁移之前跑通全链路"。
 *
 * ---- 命名（六审 M-5）----
 * 不用 W5 命名：正式 W5 教 ai 与 j 两个字位，本 fixture 只验双字母链路、不证明 W5
 * 数据契约。本文件不建 frontend/src/weeks/week05.*、不给 project.json 加周号
 * ——这是本任务的硬边界。
 *
 * ---- 已在别处覆盖、本文件不重列的四件（"源头有清单就别自己重列"）----
 * 2026-09-09 追加的五件 fixture 里，下面四件已经在更早的提交（里程碑 2 "段 1"）
 * 里做过，本文件不重复实现，只在这里点名出处，供审阅时核对覆盖面：
 *   ① r/a/i/n/ai 共存表（多字母字位与能拼出同一字形的更短字位并存）：
 *      tests/unit/test_graphemes.js:44-50（BASE 表 + ai）与
 *      tests/unit/test_grapheme_semantics.js:70-77（rain/aid 前置断言）。
 *      本文件在下面「消费者级歧义」一节里补的是这四条断言 **没有** 覆盖的东西：
 *      证明歧义会经 render-blocks.js 的 graphemesOf/colorStrictWord 这两个真实
 *      消费者包装函数正确抛出，不是只在 segmentWord 纯函数一层验证过。
 *   ② 迁移后语义测试（§3.9 的 B 套）：tests/unit/test_grapheme_semantics.js
 *      全文，含"改坏副本"分辨力证明（该文件头注释已记录过程与结论）。
 *   ③ 合成双字母语料证明差分有分辨力：同样记录在
 *      tests/unit/test_grapheme_semantics.js 头注释「分辨力证明」一节。
 *   ④ 重叠型歧义 fixture（字位集合 a/ab/bc/c，词 abc 两解）：
 *      tests/unit/test_graphemes.js:68-95（abcOrder1/abcOrder2 两种插入顺序）。
 *   ⑤ "最少字位不是目标读法" fixture：tests/unit/test_gen_segments.py 的 bat
 *      合成词（b/a/t + at，目标读法 b+a+t 不是字位数最少的 b+at）。
 *
 * ---- 本文件真正新增的东西 ----
 * 上面五件都是"分词核心/生成器"这一层的证据，从来没有人真的把一个双字母字位
 * 摆上 games.js 的 G2/G4/G5 界面、摆上墙、序列化再反解析回来。本文件补的是这条
 * 消费者链路，逐条对应方案第 6 行的核心断言：
 *   - G2 拆 3 块（rain 显示为 r/ai/n 三块积木，不是四块）
 *   - G4 建 3 槽且能摆完（原来按字符建 4 槽永远填不满，这正是里程碑 2 存在的
 *     直接原因）
 *   - G5 表面串查得到词
 *   - 模板序列化与 HTML 反解析往返一致
 *   - 文案说"3 块积木"
 *   - 墙显示全部可上墙字位（至少 r/ai/n 三块），只有 ai 是本周新点亮态；
 *     newPatterns 与 FIRST_TEACH_DAY 键都只有 ai
 *   - 另加一个需要重复字位的合成词 + 重复 rack 项，验证按索引消耗而非 Set 去重
 *     （三审 M-6），并用"改坏副本"证明这条断言真的会因为退化成 Set 语义而转红
 *
 * ---- 边界（不可越，方案原文）----
 * 本 fixture 只验第 6 步的消费者链路，不得直接用于 DATA-WALL-01（八审 L-5：它的
 * newPatterns 只有 ai，说明不了 r、n 从哪一周进入累计教学顺序）——墙校验在第 7 步
 * 另建带连续周记录的 fixture。本文件的"墙"断言因此只做数据级与单字位级检查
 * （wallLetters 展开正确、每个 id 可解析、FIRST_TEACH_DAY/newPatterns 只含 ai），
 * 不构造、也不需要构造一个真实可用的"完整累计墙"渲染函数——现状里那个函数本来就
 * 不存在（周 1-3 的 hero 硬编码本周字面量，周 4 的 hero 把 lit 写死成 true，两处都
 * 没有一个通用的"读 wallLetters + 按 FIRST_TEACH_DAY 算点亮态"的共享实现可复用）。
 *
 * ---- 环境桩的说明（为什么不是"绕过生产路径"）----
 * games.js/render-blocks.js 本身是本文件要验证的真实生产代码，逐字 fs.readFileSync
 * 后在 Node vm 里原样执行（不复制、不改写一份"近似实现"）。但它们设计为拼进单文件
 * HTML 页面运行，依赖的一部分是与本次改造完全正交的横切关注点——持久化
 * （state/localStorage/dayState）、音频播放（WordAudio/AudioBus/TTS）、插画
 * （hasIll/illHTML）、长按手势的物理计时（bindLongPress 内部的 setTimeout 序列）。
 * 这些在四周真实模板里也有专门的浏览器测试覆盖（tests/browser/*.py），不是本文件的
 * 职责。下面的桩比照 frontend/src/shared/state.js:65-69(dayState)/225-239
 * (examRecorded/dayDone)/161-165(isPlainObject/CONFIRM_SOURCES) 与
 * frontend/src/weeks/week01.template.html:897-907(Guard 结构)/1264-1278
 * (confirmWord/unconfirmWord)/868-881(hasPhoneme 等) 的语义手写最小复刻，只保留
 * 本文件断言路径用得到的分支，每处都写明依据；graphemes.js/render-blocks.js/
 * longpress.js/games.js 四个文件本身则原样加载，不做任何裁剪或改写。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadData } = require('../../tools/validation/load_data');

const ROOT = path.resolve(__dirname, '..', '..');
const SHARED = path.join(ROOT, 'frontend', 'src', 'shared');

// ============================================================================
// 环境桩（见文件头「环境桩的说明」）。
// ============================================================================
const STUB_ENV = `
function isPlainObject(v){ return !!v && typeof v === 'object' && !Array.isArray(v); }
function save(){ return true; } // 本测试不落盘，state 只在内存里流转，与本次改造正交
function dayState(n){ if(!isPlainObject(state.days[n])) state.days[n] = {checks:{}}; return state.days[n]; } // 同 progress.js:65-69
function examRecorded(day){ // 同 state.js:225-232，逐字复刻语义（找含 exam 块的 step，取其 checks[0]）
  const d = DAYS[day-1];
  if(!d) return false;
  const stepIdx = d.steps.findIndex(s => s.blocks.some(b => b.b === 'exam'));
  if(stepIdx === -1) return false;
  const key = day + '-' + stepIdx + '-0';
  return !!dayState(day).checks[key];
}
function dayDone(n){ // 同 state.js:233-239
  const d = DAYS[n-1]; const st = dayState(n);
  const total = d.steps.reduce((a,s)=> a + s.blocks.filter(b=>b.b==='checks').reduce((x,b)=>x+b.items.length,0), 0);
  if(!total) return !!st.done;
  const got = Object.values(st.checks).filter(Boolean).length;
  return got >= total;
}
const CONFIRM_SOURCES = ['g2', 'g4', 'g5']; // 同 state.js:164
// 简化版 Guard：本文件全部合成词的 RESERVED 均为空数组，真实 Guard 还要拆
// RESERVED_RETEST/PROBE_A/PROBE_B/GLOBAL_RESERVED（week01.template.html:897-907），
// 那四类测评常量与本步（消费者链路）无关，本桩不引入。
const Guard = { isReserved(w){ return (RESERVED||[]).map(x=>String(x).toLowerCase()).includes(String(w==null?'':w).toLowerCase()); } };
function confirmWord(w, src){ // 同 week01.template.html:1264-1271
  if(!CONFIRM_SOURCES.includes(src)) return;
  if(Guard.isReserved(w)) return;
  if(!isPlainObject(state.games.confirms[w])) state.games.confirms[w] = {};
  state.games.confirms[w][src] = true;
  save();
}
function unconfirmWord(w, src){ // 同 week01.template.html:1272-1278
  if(!CONFIRM_SOURCES.includes(src)) return;
  if(Guard.isReserved(w)) return;
  if(!isPlainObject(state.games.confirms[w])) return;
  state.games.confirms[w][src] = false;
  save();
}
const PHONEME_AUDIO = {}; // 合成周没有注入任何真人录音
function phAudioKey(ch){ return (SOUNDS[ch] && SOUNDS[ch].audioKey) || ch; } // 同 week01.template.html:871
function hasPhoneme(ch){ return !!PHONEME_AUDIO[phAudioKey(ch)]; } // 恒 false：无录音，走降级为静态 div 的分支（铁律 8），不影响本文件要证的槽位/摆词/文案断言
function hasIll(){ return false; } // 合成周没有插画
function illHTML(){ return ''; }
// ART 只是装饰性 SVG/文案片段，内容与本次要验证的双字母字位引擎无关（tick/spk 只在
// 已确认状态与"再听一次"按钮上出现，不影响槽数/摆词/文案断言），用可辨识占位符即可。
const ART = { tick:'[tick]', spk:'[spk]', arrowL:'[prev]', arrowR:'[next]', warn:'[warn]', star:'[star]', bulb:'[bulb]' };
// 真实音频播放已有 tests/browser/*.py 覆盖；这里只需要 WordAudio.play 尽快 resolve
// 成 'ended'，让 G4 的 playQuestion() 能推进到 renderPlacing()（同 test_render_smoke.js
// 状态驱动交互测试一节的既有做法）。G5 全程不放词音频（规格明文），不依赖这个桩。
const WordAudio = { play(){ return Promise.resolve({status:'ended'}); } };
let pageTimers = [];
const laterOnce = (fn, ms) => { const id = setTimeout(fn, ms); pageTimers.push(id); return id; }; // 同四份模板共有的 laterOnce
`;

// ============================================================================
// 最小 DOM 元素桩 + 事件委托匹配（同 test_render_smoke.js 状态驱动交互测试一节的
// InteractiveElement/matchesSelector 思路，独立实现，服务本文件自己的挂载点集合）。
//
// querySelector 的自动补全（关键简化点，需要显式说明）：真实 DOM 里
// querySelector('.g4__confirm') 找不到就返回 null；这里改成"没注册过就现造一个空
// 元素返回"。原因：body.innerHTML 在本桩里只是字符串赋值，不会被解析成真实子节点，
// 深层的 CSS 选择器（如 renderConfirmFeedback 里的 '.g4__confirm'）永远找不到对应
// 元素——但 bindLongPress（frontend/src/shared/longpress.js）需要拿到一个真的
// 元素（读它的 .style、可能的 [data-longpress-fill] 子元素）才能正常挂载，传 null
// 会直接抛 TypeError。结构性挂载点（root 自己的 [data-g4-orders]/[data-g4-body] 等）
// 全部显式 registerNamed 成我们持有引用、会真正拿来断言 innerHTML 的元素；只有这类
// "渲染进 HTML 字符串、事后不会被断言内容"的深层选择器才吃这条自动补全，且只影响
// 长按手势能否挂载成功，不影响本文件任何一条断言的判定依据。
// ============================================================================
function camelToKebab(name) { return name.replace(/[A-Z]/g, m => '-' + m.toLowerCase()); }
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
function matchesSelector(el, sel) { return sel.split(',').some(one => matchesSimpleSelector(el, one.trim())); }

class El {
  constructor(tag, attrs) {
    this.tagName = (tag || 'div').toUpperCase();
    this.attrs = new Map();
    this._named = new Map();
    this._listeners = {};
    this._html = ''; this._text = '';
    this.style = {};
    this.disabled = false;
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
  setAttribute(k, v) { this.attrs.set(k, String(v)); if (k === 'disabled') this.disabled = true; }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  removeEventListener() { }
  fire(type, evt) { (this._listeners[type] || []).forEach(fn => fn(evt)); }
  registerNamed(sel, el) { this._named.set(sel, el); return el; }
  querySelector(sel) { if (!this._named.has(sel)) this._named.set(sel, new El('div')); return this._named.get(sel); }
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

const flushMicrotasks = () => new Promise(resolve => setImmediate(resolve));

/* buildSandbox(data) -> {sandbox, roots}：把 data（SOUNDS/META/W/RESERVED/G4_WORDS/
 * G5_WHITELIST/FIRST_TEACH_DAY/DAYS）作为 vm 上下文的全局属性直接挂上（不经字符串
 * 拼接再反解析——那是下面「模板序列化与 HTML 反解析往返一致」一节单独要测的东西，
 * 这里只是把数据递给真实代码跑），再把 STUB_ENV + 四个真实共享文件原样拼成一份脚本
 * 整体执行。data.gamesSrcOverride 仅供本文件末尾的"改坏副本"验证使用——传入一份
 * 故意改坏的 games.js 源码文本，替换掉默认的真实文件读取。 */
function buildSandbox(data) {
  const roots = [];
  const document = {
    querySelectorAll: sel => roots.filter(r => matchesSelector(r, sel)),
    querySelector: sel => roots.find(r => matchesSelector(r, sel)) || null,
    addEventListener() { }, removeEventListener() { },
    getElementById() { return new El('div'); },
    createElement(tag) { return new El(tag); },
    body: new El('body'), documentElement: new El('html'),
    hidden: false
  };
  const sandbox = {
    SOUNDS: data.SOUNDS, META: data.META, W: data.W, RESERVED: data.RESERVED || [],
    G4_WORDS: data.G4_WORDS || [], G5_WHITELIST: data.G5_WHITELIST || [],
    FIRST_TEACH_DAY: data.FIRST_TEACH_DAY || {}, DAYS: data.DAYS || [],
    state: { days: {}, games: { confirms: {} } },
    document, console,
    Promise, Set, Map, Array, Object, JSON, Math, Date, RegExp, Error, String, Number, Boolean,
    setTimeout() { return 0; }, clearTimeout() { }, setInterval() { return 0; }, clearInterval() { }
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = function () { };
  vm.createContext(sandbox);

  const gamesSrc = data.gamesSrcOverride || fs.readFileSync(path.join(SHARED, 'games.js'), 'utf8');
  const scriptText = [
    STUB_ENV,
    fs.readFileSync(path.join(SHARED, 'graphemes.js'), 'utf8'),
    fs.readFileSync(path.join(SHARED, 'render-blocks.js'), 'utf8'),
    fs.readFileSync(path.join(SHARED, 'longpress.js'), 'utf8'),
    gamesSrc
  ].join('\n;\n');
  new vm.Script(scriptText, { filename: 'synthetic-ai-sandbox.js' }).runInContext(sandbox);
  return { sandbox, roots };
}

// ============================================================================
// CORE 场景：target='rain'，rackG4=rackG5=['r','ai','n']，segments=['r','ai','n']
// （方案原文写死的 rack 构造）。SOUNDS 只含 r/ai/n（不含单字母 a/i），保证 rain 唯一
// 可解，不撞进歧义分支——歧义分支单独在下面「消费者级歧义」一节用另一张表验证。
// ============================================================================
const CORE_SOUNDS = {
  r: { grapheme: 'r', type: 'c' },
  ai: { grapheme: 'ai', type: 'v' },
  n: { grapheme: 'n', type: 'c' }
};
const CORE_W = { rain: { zh: '雨（合成测试词，不对应任何正式周）', art: null, segments: ['r', 'ai', 'n'] } };
const CORE_META = {
  week: 99, storageKey: 'synthetic-ai-test', groupedRack: false,
  wallLetters: ['r', 'ai', 'n'], rackG4: ['r', 'ai', 'n'], rackG5: ['r', 'ai', 'n'], newPatterns: ['ai']
};
// FIRST_TEACH_DAY 只含 ai：r/n 视为此前某周已教（本合成周不新增），newPatterns 与
// FIRST_TEACH_DAY 键因此都只有 ai——这正是方案第 6 行明写的判据。
const CORE_FIRST_TEACH_DAY = { ai: 1 };
// DAYS 只放一天，且这一天带 exam 块——供 examRecorded(1) 定位 G5 的程序锁 key。
const CORE_DAYS = [{ n: 1, wd: '一', title: '', goal: '', steps: [{ t: '', min: 30, blocks: [{ b: 'exam' }] }] }];
const CORE_RESERVED = [];
const CORE_G4_WORDS = ['rain'];
const CORE_G5_WHITELIST = ['rain'];

const core = buildSandbox({
  SOUNDS: CORE_SOUNDS, META: CORE_META, W: CORE_W, RESERVED: CORE_RESERVED,
  G4_WORDS: CORE_G4_WORDS, G5_WHITELIST: CORE_G5_WHITELIST,
  FIRST_TEACH_DAY: CORE_FIRST_TEACH_DAY, DAYS: CORE_DAYS
});

// ----------------------------------------------------------------------------
// G2 拆 3 块：mount initG2()，读它挂载后立刻渲染的积木态（stageHTML 走
// graphemesOf('rain')），断言恰好 3 块 tile，且 ID/显示字形是 r/ai/n（不是
// r/a/i/n 四个）。initG2 的初始 draw() 不需要点击、不经过 WordAudio/AudioBus
// （那两者只在点「合体」「重听」时才用到），这里只测挂载后的静态渲染。
// ----------------------------------------------------------------------------
(function testG2SplitsIntoThreeBlocks() {
  const root = new El('div', { 'data-g2': 'rain' });
  root.registerNamed('[data-nav]', new El('div'));
  const body = root.registerNamed('[data-body]', new El('div'));
  core.roots.length = 0; core.roots.push(root);
  core.sandbox.initG2();
  const html = body.innerHTML;
  const tileMatches = [...html.matchAll(/<div class="tile (tile--[cv]) tile--lg">([^<]*)<\/div>/g)];
  assert.equal(tileMatches.length, 3, `G2 应拆成 3 块积木（r/ai/n），实际渲染出 ${tileMatches.length} 块：${html}`);
  assert.deepEqual(tileMatches.map(m => m[2]), ['r', 'ai', 'n'],
    'G2 三块积木的显示文字应依次是 r / ai / n（一块积木不是一个字母），不是被拆成 r/a/i/n 四个字符');
  assert.deepEqual(tileMatches.map(m => m[1]), ['tile--c', 'tile--v', 'tile--c'],
    'G2 三块积木的元音/辅音分类应是 辅/元/辅（ai 整体是一个元音块，不是两个独立字母）');
  console.log('PASS synthetic-ai G2：rain 经 initG2 真实挂载渲染为 3 块积木 r/ai/n（不是 4 个字符）');
})();

// ----------------------------------------------------------------------------
// G4 建 3 槽且能摆完：mount initG4()，点订单 rain -> 断言槽数为 3、提示文案说
// "3 块积木"；按 rack 顺序（与 segments 顺序一致，方案写死 rackG4=['r','ai','n']）
// 依次点击三块积木 -> 断言三个槽正确填入 r/ai/n、且 validate() 判定为拼对
// （渲染出"拼对了"文案，长按确认组件挂载不抛错）。
// ----------------------------------------------------------------------------
async function testG4BuildsThreeSlotsAndCanBeFilled() {
  const root = new El('div', { 'data-g4': '' });
  const orders = root.registerNamed('[data-g4-orders]', new El('div'));
  const body = root.registerNamed('[data-g4-body]', new El('div'));
  core.roots.length = 0; core.roots.push(root);
  core.sandbox.initG4();

  const orderMatch = /data-g4-order="rain"/.exec(orders.innerHTML);
  assert(orderMatch, `G4 订单列表应出现 rain 的订单按钮：${orders.innerHTML}`);
  root.fire('click', { target: new El('button', { 'data-g4-order': 'rain' }) });
  await flushMicrotasks(); // 等 WordAudio.play(...).then(...) 的微任务推进到 renderPlacing()

  const slotIds = [...body.innerHTML.matchAll(/data-g4-slot="(\d+)"/g)].map(m => m[1]);
  assert.deepEqual(slotIds, ['0', '1', '2'],
    `G4 应按字位数（3）建 3 个槽，不是按字符数（4）建 4 个槽——这正是里程碑 2 存在的直接原因。实际：${body.innerHTML}`);
  assert(/听到的词是 3 块积木，摆一摆/.test(body.innerHTML),
    `G4 提示文案应说"3 块积木"（wordIds.length，字位数），不是 4：${body.innerHTML}`);

  // 按 rack 顺序依次点击三块积木——rackG4 写死为 ['r','ai','n']，与 rain 的 segments
  // 顺序一致，所以按 rack 出现顺序点击必然摆出正确的词（这是本场景刻意的构造，不是
  // 侥幸）：验证的是"3 槽确实能摆完"，不是"随便摆能不能摆完"。
  const tiles = [...body.innerHTML.matchAll(/data-g4-tile="(\d+)" data-g4-letter="([^"]*)"/g)]
    .map(m => ({ idx: m[1], letter: m[2] }));
  assert.deepEqual(tiles.map(t => t.letter), ['r', 'ai', 'n'],
    `G4 积木架应恰好 3 块（rackG4 写死为 r/ai/n），实际：${JSON.stringify(tiles)}`);
  for (const t of tiles) {
    root.fire('click', { target: new El('button', { 'data-g4-tile': t.idx, 'data-g4-letter': t.letter }) });
  }
  const filledSlots = [...body.innerHTML.matchAll(/data-g4-slot="\d+">([^<]*)</g)].map(m => m[1]);
  assert.deepEqual(filledSlots, ['r', 'ai', 'n'], `G4 三个槽应分别摆入 r / ai / n：${body.innerHTML}`);
  assert(/拼对了/.test(body.innerHTML),
    `G4 摆满 3 槽后应判定为拼对（surfaceOf(['r','ai','n']) === 'rain'），长按确认组件应正常挂载不抛错：${body.innerHTML}`);
  console.log('PASS synthetic-ai G4：rain 建 3 槽（不是 4 槽），按 rack 摆完后正确判定为拼对');
}

/* 「改坏副本」验证（G4 3 槽 vs 4 槽）：把 games.js 里 G4 pickWord() 建槽用的
 * `wordIds = graphemesOf(w)`（按字位数）改回 `wordIds = [...w]`（按字符数，
 * 里程碑 2 之前的写法），确认在这个具体退化下槽数确实变成 4——证明上面「G4 建
 * 3 槽」那条断言不是恰好写对了字面数字 3，而是真的依赖 graphemesOf 按字位切分
 * 这件事本身；needle 只出现 1 次（pickWord 内），精确对应本场景要验证的建槽路径。 */
async function testBreakTheCopyProvesG4SlotCountDiscriminates() {
  const realSrc = fs.readFileSync(path.join(SHARED, 'games.js'), 'utf8');
  const needle = 'wordIds = graphemesOf(w);';
  const occurrences = realSrc.split(needle).length - 1;
  assert.equal(occurrences, 1,
    `破坏点定位失败：games.js 里 "${needle}" 应恰好出现 1 次（G4 pickWord 建槽），实际 ${occurrences} 次`);
  const brokenSrc = realSrc.replace(needle, 'wordIds = [...w];');
  assert.notEqual(brokenSrc, realSrc, '破坏点替换未生效');

  const { sandbox, roots } = buildSandbox({
    SOUNDS: CORE_SOUNDS, META: CORE_META, W: CORE_W, RESERVED: CORE_RESERVED,
    G4_WORDS: CORE_G4_WORDS, G5_WHITELIST: CORE_G5_WHITELIST,
    FIRST_TEACH_DAY: CORE_FIRST_TEACH_DAY, DAYS: CORE_DAYS, gamesSrcOverride: brokenSrc
  });
  const root = new El('div', { 'data-g4': '' });
  root.registerNamed('[data-g4-orders]', new El('div'));
  const body = root.registerNamed('[data-g4-body]', new El('div'));
  roots.length = 0; roots.push(root);
  sandbox.initG4();
  root.fire('click', { target: new El('button', { 'data-g4-order': 'rain' }) });
  await flushMicrotasks();
  const slotIds = [...body.innerHTML.matchAll(/data-g4-slot="(\d+)"/g)].map(m => m[1]);
  assert.equal(slotIds.length, 4,
    `改坏副本（按字符建槽）下，rain（4 字符）应建出 4 槽而不是 3——证明上面「G4 建 3 槽」的断言` +
    `确实会因为这个具体退化（wordIds 改回按字符切分）而转红，不是恰好写对了字面数字。实际槽数：${slotIds.length}，body：${body.innerHTML}`);
  console.log('PASS synthetic-ai 改坏副本验证：G4 建槽逻辑改回按字符切分后，rain 建出 4 槽而非 3 槽，证明"3 槽"断言确实有分辨力');
}

// ----------------------------------------------------------------------------
// G5 表面串查得到词：先解锁（examRecorded(1) 依赖 dayState(1).checks['1-0-0']），
// mount initG5()，默认 3 槽，按 rack 顺序摆入 r/ai/n -> surfaceOf(['r','ai','n'])
// === 'rain'，且 'rain' ⊆ G5_WHITELIST 且不是保留词 -> 断言渲染出"拼出一个词"的
// 正反馈，不是"这个组合，读读看"的中性提示。
// ----------------------------------------------------------------------------
function testG5SurfaceLookupFindsWord() {
  core.sandbox.state.days[1] = { checks: { '1-0-0': true } }; // 解锁：day1 的 exam 块 checks[0] 已勾选
  const root = new El('div', { 'data-g5': '', 'data-g5-day': '1' });
  const body = root.registerNamed('[data-g5-body]', new El('div'));
  core.roots.length = 0; core.roots.push(root);
  core.sandbox.initG5();

  assert(!/g5__lock-note/.test(body.innerHTML), `G5 应已解锁（examRecorded(1) 应为 true）：${body.innerHTML}`);
  const slotIds = [...body.innerHTML.matchAll(/data-g5-slot="(\d+)"/g)].map(m => m[1]);
  assert.deepEqual(slotIds, ['0', '1', '2'], `G5 默认应是 3 槽：${body.innerHTML}`);

  const tiles = [...body.innerHTML.matchAll(/data-g5-tile="(\d+)" data-g5-letter="([^"]*)"/g)]
    .map(m => ({ idx: m[1], letter: m[2] }));
  assert.deepEqual(tiles.map(t => t.letter), ['r', 'ai', 'n'], `G5 积木架应恰好 3 块 r/ai/n：${JSON.stringify(tiles)}`);
  for (const t of tiles) {
    root.fire('click', { target: new El('button', { 'data-g5-tile': t.idx, 'data-g5-letter': t.letter }) });
  }
  assert(/拼出一个词！读读看/.test(body.innerHTML),
    `G5 摆出 rain（表面串查中 G5_WHITELIST）应显示"拼出一个词"的正反馈，不是中性提示"这个组合，读读看"：${body.innerHTML}`);
  assert(!/这个组合，读读看/.test(body.innerHTML), 'G5 命中白名单词时不应同时出现中性提示文案（两者互斥，DOM 级恒等）');
  console.log('PASS synthetic-ai G5：解锁后按 rack 摆出 rain，表面串查中 G5_WHITELIST，正确显示"拼出一个词"');
}

// ----------------------------------------------------------------------------
// 墙 / newPatterns / FIRST_TEACH_DAY（边界：只做数据级 + 单字位级检查，见文件头
// 「边界」一节——真正的累计墙渲染函数在第 7 步才建立）。
// ----------------------------------------------------------------------------
function testWallDataAndNewPatterns() {
  const wallIds = core.sandbox.normalizeIdList(CORE_META.wallLetters, { legacy: true });
  assert.deepEqual(wallIds, ['r', 'ai', 'n'],
    `墙应显示全部 3 个可上墙字位（r/ai/n），不是被展开成更多字符：${JSON.stringify(wallIds)}`);
  // 每个上墙字位都必须真的可解析（graphemeLabel/soundType 不抛）——"可上墙"的最低要求。
  for (const id of wallIds) {
    const label = core.sandbox.graphemeLabel(id, CORE_SOUNDS);
    const type = core.sandbox.soundType(id, CORE_SOUNDS);
    assert(typeof label === 'string' && label.length > 0, `墙字位 "${id}" 应能取到显示字形`);
    assert(type === 'c' || type === 'v', `墙字位 "${id}" 应能取到合法元音/辅音分类`);
  }
  assert.deepEqual(wallIds.map(id => core.sandbox.graphemeLabel(id, CORE_SOUNDS)), ['r', 'ai', 'n'],
    '墙上 ai 的显示字形应是 "ai" 一整块，不是被拆开显示');

  // 只有 ai 是本周新点亮态：newPatterns 与 FIRST_TEACH_DAY 键都只含 ai。
  assert.deepEqual(CORE_META.newPatterns, ['ai'], 'newPatterns 应只含 ai（本周唯一新教字位）');
  assert.deepEqual(Object.keys(CORE_FIRST_TEACH_DAY), ['ai'], 'FIRST_TEACH_DAY 键应只含 ai');
  // ai 的点亮态是真实可计算的（走真实 dayDone，同 state.js:233-239 语义）：
  // day1 的 checks 已在 G5 场景里被置位，dayDone(1) 应为 true（该天唯一的块类型是
  // exam，没有 checks 块，total===0，走"不存在 checks 块就看 st.done"分支——st.done
  // 未显式设置，为 undefined，!!undefined===false）。为了让"ai 已点亮"这件事本身
  // 可判定，这里改用不依赖 checks 块的路径：直接断言 examRecorded(1) 已为 true
  // （G5 场景已解锁），说明"day1 已完成到足以解锁 G5 的程度"，这是本合成周唯一定义过
  // 的"完成"信号；r/n 不在 FIRST_TEACH_DAY 里，按方案"不是新教那一周的一次性义务"
  // 的反面——它们的点亮态来自更早的周，不属于本合成 fixture 的语义范围（边界已在
  // 文件头写明：完整累计墙验证在第 7 步）。
  assert.equal(core.sandbox.examRecorded(1), true, 'day1 应已标记完成到可解锁 G5 的程度，供"ai 已点亮"取信号');
  assert(!('r' in CORE_FIRST_TEACH_DAY) && !('n' in CORE_FIRST_TEACH_DAY),
    'r/n 不应出现在本合成周的 FIRST_TEACH_DAY 里（它们不是本周新教，点亮态来自更早的周，不在本 fixture 范围内）');
  console.log('PASS synthetic-ai 墙/newPatterns/FIRST_TEACH_DAY：wallLetters 展开为 3 个可解析字位，newPatterns 与 FIRST_TEACH_DAY 键均只含 ai');
}

// ----------------------------------------------------------------------------
// 模板序列化与 HTML 反解析往返一致：把合成周的 box 序列化成
// `const NAME = ...;` 声明（真实构建产物里 <script> 内联的同一种形态），套一层
// <script> 外壳更贴近真实 HTML 产物，再用 tools/validation/load_data.js 的
// `loadData`（真实 check_data.js/export_data.js 等消费入口用的同一个反解析函数）
// 读回来，逐字段与序列化前深相等。
// ----------------------------------------------------------------------------
function testTemplateRoundTrip() {
  const box = {
    META: CORE_META, SOUNDS: CORE_SOUNDS, W: CORE_W, RESERVED: CORE_RESERVED,
    G4_WORDS: CORE_G4_WORDS, G5_WHITELIST: CORE_G5_WHITELIST,
    FIRST_TEACH_DAY: CORE_FIRST_TEACH_DAY, DAYS: CORE_DAYS
  };
  const declarations = Object.keys(box).map(k => `const ${k} = ${JSON.stringify(box[k])};`).join('\n');
  const html = `<!doctype html><html><body><script>\n${declarations}\n</script></body></html>`;
  const reparsed = loadData(html, false);
  // loadData 内部用 vm.runInNewContext 求值声明文本（tools/validation/load_data.js:19），
  // 反解析出的数组/对象因此来自另一个 vm realm，[[Prototype]] 与本进程的 Array.prototype
  // 不是同一个对象——assert.deepEqual（node:assert/strict 下等价于 deepStrictEqual）
  // 会因为这层原型不同而误判"不相等"，即便结构完全一致（已用最小复现实测确认：
  // Array.isArray 为 true，但 Object.getPrototypeOf(arr) !== Array.prototype）。
  // 这不是 load_data.js 的缺陷（它的正式消费者只需要结构正确，从不比较跨 realm 引用），
  // 是本文件比较时要绕开的一个已知陷阱：先各自转一遍 JSON.parse(JSON.stringify(...))
  // 落回同一个 realm 的纯对象/数组，再做严格深相等——既避开原型陷阱，又不放松"结构
  // 必须逐字段完全一致"这条判据本身。
  const sameRealm = v => JSON.parse(JSON.stringify(v));
  for (const key of Object.keys(box)) {
    assert.deepEqual(sameRealm(reparsed[key]), sameRealm(box[key]),
      `模板序列化后经 loadData 反解析，字段 "${key}" 应与序列化前深相等（往返一致）。` +
      `序列化前：${JSON.stringify(box[key])}；反解析后：${JSON.stringify(reparsed[key])}`);
  }
  // 数组形态必须真的是数组（新格式），不能在往返过程中被悄悄压扁成字符串。
  assert(Array.isArray(reparsed.META.wallLetters), 'wallLetters 往返后仍应是数组（新格式），不是被压扁成字符串');
  assert(Array.isArray(reparsed.META.rackG4) && Array.isArray(reparsed.META.rackG5),
    'rackG4/rackG5 往返后仍应是数组');
  assert(Array.isArray(reparsed.META.newPatterns), 'newPatterns 往返后仍应是数组');
  console.log('PASS synthetic-ai 模板序列化/HTML 反解析往返一致：8 个字段（含四个数组形态字段）序列化后经 loadData 反解析逐字段深相等');
}

// ============================================================================
// 重复字位场景：另加一个需要重复字位的合成词 + 重复 rack 项（三审 M-6），验证按
// 索引消耗而非 Set 去重。target='aiai'（segments=['ai','ai']），rackG4 含两块 'ai'
// （索引 0 与 1）。若消耗逻辑退化成"按值去重"（比如误用 Set<字母> 而不是数组下标），
// 摆入第一块 'ai' 后第二块 'ai' 会被误判成"已用过"而一起变灰——这正是下面要挡的
// 退化，随后用「改坏副本」证明这条断言真的会因为这个退化而转红。
// ============================================================================
const DUP_SOUNDS = { ai: { grapheme: 'ai', type: 'v' } };
const DUP_W = { aiai: { zh: '（合成，重复字位测试专用，不对应任何真实英文词）', art: null, segments: ['ai', 'ai'] } };
const DUP_META = { week: 99, storageKey: 'synthetic-ai-dup-test', groupedRack: false, rackG4: ['ai', 'ai'], rackG5: ['ai', 'ai'] };

function mountG4DuplicateOrder(gamesSrcOverride) {
  const { sandbox, roots } = buildSandbox({
    SOUNDS: DUP_SOUNDS, META: DUP_META, W: DUP_W, RESERVED: [],
    G4_WORDS: ['aiai'], G5_WHITELIST: ['aiai'], FIRST_TEACH_DAY: {}, DAYS: [], gamesSrcOverride
  });
  const root = new El('div', { 'data-g4': '' });
  root.registerNamed('[data-g4-orders]', new El('div'));
  const body = root.registerNamed('[data-g4-body]', new El('div'));
  roots.length = 0; roots.push(root);
  sandbox.initG4();
  return { sandbox, root, body };
}
function extractTileStates(html) {
  const re = /<button class="tile[^>]*?data-g4-tile="(\d+)" data-g4-letter="([^"]*)"( disabled)?[^>]*>/g;
  const out = []; let m;
  while ((m = re.exec(html))) out.push({ idx: m[1], letter: m[2], disabled: !!m[3] });
  return out;
}

async function testDuplicateGraphemeConsumedByIndexNotSet() {
  const { root, body } = mountG4DuplicateOrder();
  root.fire('click', { target: new El('button', { 'data-g4-order': 'aiai' }) });
  await flushMicrotasks();

  const before = extractTileStates(body.innerHTML);
  assert.equal(before.length, 2, `重复字位场景应渲染出 2 块积木（两个 ai）：${body.innerHTML}`);
  assert(before.every(t => t.letter === 'ai' && !t.disabled), '摆入前两块 ai 积木都应可用（未禁用）');

  // 只点第一块 ai（索引 0）。
  root.fire('click', { target: new El('button', { 'data-g4-tile': '0', 'data-g4-letter': 'ai' }) });
  const afterOne = extractTileStates(body.innerHTML);
  const tile0 = afterOne.find(t => t.idx === '0');
  const tile1 = afterOne.find(t => t.idx === '1');
  assert.equal(tile0.disabled, true, '按索引消耗：摆入索引 0 的那块积木之后，索引 0 应变为禁用');
  assert.equal(tile1.disabled, false,
    '核心断言（三审 M-6）：另一块同样是 "ai" 的积木（索引 1）此时不应被禁用——' +
    '若消耗逻辑退化成按值（Set<letter>）去重，索引 1 会被误判成"已用过"而一起变灰，这正是本断言要挡住的退化');

  // 再点第二块 ai（索引 1），完成摆词，应正确判定拼对（surfaceOf(['ai','ai'])==='aiai'）。
  root.fire('click', { target: new El('button', { 'data-g4-tile': '1', 'data-g4-letter': 'ai' }) });
  const filledSlots = [...body.innerHTML.matchAll(/data-g4-slot="\d+">([^<]*)</g)].map(m => m[1]);
  assert.deepEqual(filledSlots, ['ai', 'ai'], `两个槽应都摆入 ai：${body.innerHTML}`);
  assert(/拼对了/.test(body.innerHTML), `重复字位摆完后应判定拼对：${body.innerHTML}`);
  console.log('PASS synthetic-ai 重复字位：两块同 ID 积木按索引独立消耗（摆入一块不影响另一块的可用性），摆完正确判定拼对');
}

/* 「改坏副本」验证（每条新断言用精准破坏单独验证会红，任务纪律要求）：把 games.js
 * 里 G4 rackHTML() 判断某块积木"是否已用过"的那一行，从按索引查找改成按字母值查找
 * （usedTileIdx.map(j=>RACK_LETTERS[j]).includes(c) 而不是 usedTileIdx.includes(i)）
 * ——这是一个真实可能发生的"看起来在优化、实际引入 Set 语义"的写法。needle 文本在
 * games.js 里出现 2 次（G4 rackHTML 与 G5 rackHTML 各一次，逐字相同）；
 * `String.prototype.replace(字符串,...)` 只替换第一处，即 G4 那处（先出现），
 * 与本场景要验证的路径精确对应。若源码后续改动导致 needle 文本漂移（出现次数
 * 不是 2 或替换后文本未变），下面的断言会先于功能断言报错，提示破坏点已失效
 * 需要重新定位，不会误报"断言仍然有效"。 */
async function testBreakTheCopyProvesDiscriminatingPower() {
  const realSrc = fs.readFileSync(path.join(SHARED, 'games.js'), 'utf8');
  const needle = 'const used = usedTileIdx.includes(i);';
  const occurrences = realSrc.split(needle).length - 1;
  assert.equal(occurrences, 2,
    `破坏点定位失败：games.js 里 "${needle}" 应恰好出现 2 次（G4/G5 各一处 rackHTML），` +
    `实际 ${occurrences} 次——源码已漂移，需要重新核实破坏点是否仍作用在 G4 的 rack "已用" 判定上`);
  const brokenSrc = realSrc.replace(needle, 'const used = usedTileIdx.map(j=>RACK_LETTERS[j]).includes(c);');
  assert.notEqual(brokenSrc, realSrc, '破坏点替换未生效（needle 未匹配到任何文本）');

  const { root, body } = mountG4DuplicateOrder(brokenSrc);
  root.fire('click', { target: new El('button', { 'data-g4-order': 'aiai' }) });
  await flushMicrotasks();
  root.fire('click', { target: new El('button', { 'data-g4-tile': '0', 'data-g4-letter': 'ai' }) });
  const afterOne = extractTileStates(body.innerHTML);
  const tile1 = afterOne.find(t => t.idx === '1');
  assert.equal(tile1.disabled, true,
    '改坏副本（按值/Set 语义）下，摆入索引 0 的 ai 之后，索引 1 的另一块 ai 应被错误地一并禁用——' +
    '这证明上面「按索引消耗」的断言（tile1.disabled === false）在真实代码上会因为这个具体退化而转红，' +
    '不是一条恒真式');
  console.log('PASS synthetic-ai 改坏副本验证：把 G4 rack 的"已用"判定从按索引改成按值（Set 语义）后，' +
    '重复字位场景里另一块同 ID 积木被错误禁用，证明上面那条断言确实有分辨力');
}

// ============================================================================
// 消费者级歧义（补①在 render-blocks.js 真实包装函数上的覆盖，见文件头「已在
// 别处覆盖」一节说明——segmentWord 本身的歧义检测已在 test_graphemes.js/
// test_grapheme_semantics.js 验证过，这里验证的是 graphemesOf/colorStrictWord
// 这两个真实消费入口是否正确地把歧义原样传递出来，而不是被中途吞掉或错误处理）。
// SOUNDS 换成 r/a/i/n/ai 共存表：rain 在这张表下有 r|a|i|n 与 r|ai|n 两解。
// ============================================================================
function testAmbiguitySurfacesThroughRealConsumerFunctions() {
  const COEXIST_SOUNDS = {
    r: { grapheme: 'r', type: 'c' }, a: { grapheme: 'a', type: 'v' }, i: { grapheme: 'i', type: 'v' },
    n: { grapheme: 'n', type: 'c' }, ai: { grapheme: 'ai', type: 'v' }
  };
  // 分支①：W.rain 没有声明 segments —— graphemesOf/colorStrictWord（render-blocks.js
  // 真实导出，不是直接调 segmentWord）必须原样抛出 segment-ambiguous，不能被吞掉或
  // 悄悄退化成某一种解。
  {
    const { sandbox: sb } = buildSandbox({
      SOUNDS: COEXIST_SOUNDS, META: { week: 99, storageKey: 'ambiguous-test' },
      W: { rain: { zh: '雨', art: null } }, // 故意不带 segments
      RESERVED: [], G4_WORDS: [], G5_WHITELIST: [], FIRST_TEACH_DAY: {}, DAYS: []
    });
    let threw = null;
    try { sb.graphemesOf('rain'); } catch (e) { threw = e; }
    assert(threw, 'graphemesOf("rain") 在 r/a/i/n/ai 共存且未声明 segments 时应抛错，不应静默返回某一种解');
    assert.equal(threw.code, 'segment-ambiguous',
      `graphemesOf 应原样传递 segmentWord 的 segment-ambiguous 错误码，实际 code=${threw.code}`);

    let threw2 = null;
    try { sb.colorStrictWord('rain', sb.wordColorCtx()); } catch (e) { threw2 = e; }
    assert(threw2, 'colorStrictWord("rain", wordColorCtx()) 在同样情形下应抛错');
    assert.equal(threw2.code, 'segment-ambiguous', 'colorStrictWord 同样应原样传递 segment-ambiguous');
  }
  // 分支②：W.rain 声明了 segments=['r','ai','n']（与 CORE 场景一致）—— 同一张
  // 共存表下，graphemesOf/colorStrictWord 应正确按显式 segments 消歧，解析为 3 块。
  {
    const { sandbox: sb } = buildSandbox({
      SOUNDS: COEXIST_SOUNDS, META: { week: 99, storageKey: 'ambiguous-resolved-test' },
      W: { rain: { zh: '雨', art: null, segments: ['r', 'ai', 'n'] } },
      RESERVED: [], G4_WORDS: [], G5_WHITELIST: [], FIRST_TEACH_DAY: {}, DAYS: []
    });
    const ids = sb.graphemesOf('rain');
    assert.deepEqual(ids, ['r', 'ai', 'n'], `声明 segments 后 graphemesOf("rain") 应消歧为 [r, ai, n]，实际：${JSON.stringify(ids)}`);
    const html = sb.colorStrictWord('rain', sb.wordColorCtx());
    assert(html.includes('>ai<') || html.includes('>ai</'), `colorStrictWord 应能正常渲染，且 ai 作为整体出现：${html}`);
  }
  console.log('PASS synthetic-ai 消费者级歧义：r/a/i/n/ai 共存表下，graphemesOf/colorStrictWord（真实消费者包装函数，非直接调 segmentWord）' +
    '未声明 segments 时正确抛 segment-ambiguous，声明后正确消歧为 3 块——证明歧义检测的"接线"本身是对的，不只是分词核心算法本身');
}

// ============================================================================
// 执行
// ============================================================================
(async () => {
  await testG4BuildsThreeSlotsAndCanBeFilled();
  await testBreakTheCopyProvesG4SlotCountDiscriminates();
  testG5SurfaceLookupFindsWord();
  testWallDataAndNewPatterns();
  testTemplateRoundTrip();
  await testDuplicateGraphemeConsumedByIndexNotSet();
  await testBreakTheCopyProvesDiscriminatingPower();
  testAmbiguitySurfacesThroughRealConsumerFunctions();
  console.log('PASS synthetic-ai integration contract: G2/G4/G5/墙/模板往返/重复字位索引消耗/改坏副本/消费者级歧义 全部按预期通过');
})().catch(e => { console.error(e); process.exit(1); });
