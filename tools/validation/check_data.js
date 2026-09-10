/* 周课件数据层一致性自检 —— 与周次无关，两种输入都吃：
 *
 *   node tools/validation/check_data.js build/week02.html            # 装配好的周课件
 *   node tools/validation/check_data.js tests/fixtures/week02-data.js   # 独立数据层
 *
 * 后一种是给外部模型用的：GPT 写完第三周数据层，直接跑这个就知道合不合格，
 * 不必先装配进 3800 行的 HTML。契约见 docs/第三周数据层交接_*.md。
 *
 * 设计原则：**能从数据本身推导的，一律不写死**。跨周会变的量（已教字母集、词卡墙
 * 词数、认读词、积木架、点亮墙字母）全部由数据推出或从 META 读，所以这个脚本
 * 第三周、第四周原样可用，不需要改期望值。
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const arg = process.argv[2] || 'build/week02.html';
const SRC = path.resolve(process.cwd(), arg);
if (!fs.existsSync(SRC)) {
  console.error(`找不到输入文件：${SRC}\n用法：node ${path.relative(REPO, __filename)} <周课件HTML 或 数据层JS>`);
  process.exit(2);
}
console.log(`输入：${SRC}`);
const raw = fs.readFileSync(SRC, 'utf8');
const isHTML = SRC.toLowerCase().endsWith('.html');

const {loadData} = require('./load_data');
const {validateAssessment} = require('./assessment_contract');
const {assertIdList, segmentWord, surfaceOf, validateSoundsSchema} = require('../../frontend/src/shared/graphemes');
const {computeTeachingOrder, gatherWeekRecordsUpTo, getExpectedWeeksUpTo, expectedWallOrder, diffWallLetters, setsEqual} = require('./wall_order');
const {collectWordConsumption} = require('./word_consumers');
let box;
try { box = loadData(raw, isHTML); } catch(e) { console.error(e.message); process.exit(2); }
const { RESERVED, RESERVED_RETEST, SOUNDS, W, WALL_HINT, BOOK, FIRST_TEACH_DAY, G1_ROUNDS, G1_THEME, G3_PAIRS, G4_WORDS, G5_WHITELIST, DAYS, META } = box;

let fail = 0, pass = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + msg); } };
const head = s => console.log('\n' + s);

head('⓪ 周次与生成契约');
const namedWeek = path.basename(SRC).match(/week(\d+)/);
if(namedWeek) ok(META.week === Number(namedWeek[1]), '文件周次与 META.week 不一致');
ok(new RegExp(`^soundblocks-w${META.week}-v\\d+$`).test(META.storageKey), 'META.storageKey 与周次不一致');
if(isHTML){
  const actualKey = raw.match(/const KEY = '([^']+)'/);
  ok(actualKey && actualKey[1] === META.storageKey, '运行时 KEY 与 META.storageKey 不一致');
}
for(const key of ['flash_words','flash_sounds']){
  const lists = DAYS.flatMap(d=>d.steps.flatMap(s=>s.blocks)).filter(b=>b.b==='flash' && b.recKey===key);
  if(META.flashCapacity) ok(lists.length > 0 && lists.every(b=>b.items.length === META.flashCapacity[key]), `${key} 实际条数与保存上限不一致`);
}

/* ---------- 一切跨周会变的量都推导，不写死 ---------- */
const TAUGHT = new Set(Object.keys(SOUNDS));      // 累计已教字母 = SOUNDS 的键
const usedWords = new Set(), usedSounds = new Set(), wallWords = [], SIGHT = new Set();
for (const d of DAYS) {
  ok(d.n === DAYS.indexOf(d)+1, 'DAYS 的 n 必须依次为 1 到 7');
  for (const s of d.sounds) usedSounds.add(s);
  for (const st of d.steps) for (const b of st.blocks) {
    if (b.b === 'blend') b.words.forEach(w => usedWords.add(w));
    if (b.b === 'initialpick') {
      ok(Array.isArray(b.letters) && b.letters.length>=2 && new Set(b.letters).size===b.letters.length, '听音找开头需要至少两个不同字母选项');
      b.words.forEach(w=>{ usedWords.add(w); ok(b.letters.includes(w[0]), `听音找开头的词 ${w} 没有正确选项`); });
      b.letters.forEach(c=>usedSounds.add(c));
    }
    if (b.b === 'words') b.items.forEach(w => { usedWords.add(w); if (!wallWords.includes(w)) wallWords.push(w); });
    if (b.b === 'pair') b.pairs.forEach(p => p.forEach(w => usedWords.add(w)));
    if (b.b === 'sight') b.items.forEach(([w]) => { usedWords.add(w); SIGHT.add(w.toLowerCase()); });
    if (b.b === 'flash') b.items.forEach(it => { if (it.k === 'w') usedWords.add(it.v); else usedSounds.add(it.k); });
    if (b.b === 'sentences') b.items.forEach(([s]) => s.toLowerCase().match(/[a-z]+/g)?.forEach(w => usedWords.add(w)));
  }
}
Object.values(G1_ROUNDS).forEach(r => [...r.pos, ...r.neg].forEach(w => usedWords.add(w)));
G4_WORDS.forEach(w => usedWords.add(w));
// H2（外审 high，2026-09-10）：G1NEG（G1 neg 桶专用集合）已随③的豁免逻辑改为
// 按来源 kind 精确匹配而不再需要，见③附近头注释；不再单独维护。
console.log(`第 ${META.week} 周 · 累计 ${TAUGHT.size} 音 · 教学词 ${wallWords.length} · `
          + `保留词 ${RESERVED.length} · 积木架 G4/${META.rackG4.length} G5/${META.rackG5.length}`);

head('① 引用完整性');
for (const w of usedWords) ok(W[w] || SIGHT.has(w.toLowerCase()) || (META.week === 1 && w.toLowerCase() === 'nat'), `词 "${w}" 在课程里用到，但 W 里没有`);
for (const s of usedSounds) ok(SOUNDS[s], `音 "${s}" 在课程里用到，但 SOUNDS 里没有`);
/* P16（主会话裁定，2026-09-10）：删掉 `META.week >= 4 ||` 这条豁免。它原是副机
 * 装配 W4 时的权宜之计（W4 的 RESERVED 五词当时没进 W），但规范六稿已写死
 * 「RESERVED 必须在 W」——迁移审计 migration_audit.js:308-309 早就把它标成"待删除"
 * 的豁免对象。真正的驱动力是 W5：`rain` 这类周检词要靠 `W[word].segments` 显式
 * 消歧才能分词（下方 idsForWord 的口径），若周检词不进 W，`segmentWord` 拿不到
 * explicit segments，多解词会直接抛 segment-ambiguous，整条周检块的分词都立不住。
 * 删除后 W4 数据本身必须补齐 RESERVED/RESERVED_RETEST 十词的 W 条目（已在
 * frontend/src/weeks/week04.data.js 补齐，zh 释义复用同文件已有的 ASSESSMENT_WORDS
 * 常量，逐词核对过一致）。
 *
 * H1（轮 D 复审第二轮，外审 high，2026-09-10）：上面这条只查了 RESERVED（周检词），
 * 没查 RESERVED_RETEST（复测词）——P16 把十词一起补进 W4 的 W（RESERVED 五词 +
 * RESERVED_RETEST 五词），assessment_contract.js 的 validateMonthlyW4 也是把
 * `[...d.RESERVED, ...d.RESERVED_RETEST]` 当同一组词跑 CVC 判据（assertCvcByGraphemes
 * 需要 `W[word].segments` 才能给多解词消歧，参见 P16 注释），只查 RESERVED 这一半
 * 会让"复测词缺 W 条目"这类数据缺陷在①这一层完全查不出——只有 monthly 路径的
 * assertCvcByGraphemes 分词失败时才会连带暴露，报错信息也不会点名"复测词缺释义"
 * 这件事本身。改为 `[...RESERVED, ...(RESERVED_RETEST || [])]` 统一校验（weekly 周
 * 没有 RESERVED_RETEST 声明，`|| []` 兜底不报错），消息按来源数组区分是"周检词"
 * 还是"复测词"，不再笼统都叫"保留词"。 */
for (const w of RESERVED) ok(W[w], `周检词 "${w}" 不在 W 里（周检块会读 W[w].zh）`);
for (const w of (RESERVED_RETEST || [])) ok(W[w], `复测词 "${w}" 不在 W 里（月测复测块会读 W[w].zh）`);
for (const p of BOOK.pages) ok(typeof p.line === 'string' && p.zh && p.art, `小书页缺字段：${p.line}`);
/* SOUNDS schema 校验改走共享校验器 validateSoundsSchema（2026-09-09 外审 medium，
 * 第 4b 步并入）：grapheme 合法性、ID 字符集、遗留 L 字段、ipa/type/教学字段完整性
 * 原先分散在这里的内联真值检查与 sounds_grapheme_adapter.js 的冲突检测两处，同一份
 * SOUNDS 经不同入口会得到不同严格程度的结论。现在两处共用一份判据，check_data.js
 * 只按 id 分组把 issue 转回原有的逐键 ok() 报告粒度，不改变对外可见的失败信息颗粒度。 */
// L2 修复（里程碑 2 第 4b 步收口）：用 Object.create(null) 不用 {}——issue.id 来自
// SOUNDS 的键，理论上可以是任何字符串（isValidGraphemeId 的校验本身也是这条判据要
// 覆盖的对象之一，不能假设它已经过滤过）；用普通对象字面量时 `__proto__` 这个键
// 不会变成自有属性，而是被当成设置原型链的特殊语法，那一条 issue 会被静默吞掉，
// 不会出现在任何一个 SOUNDS 键的报告里。
/* H3 修复（外审 high，2026-09-09）：validateSoundsSchema 对表级问题（sounds 本身不是
 * 普通映射、原型链携带额外数据——issue.id === null，见 graphemes.js 的
 * sounds-invalid/sounds-prototype-chain）与逐键问题（issue.id 是 SOUNDS 的某个键）
 * 用同一个数组混装返回。改前这里只按 `soundsIssuesByKey[k] || []`（k 取自
 * `Object.keys(SOUNDS)`）读取，表级问题的 issue.id 是 null，永远不会等于任何一个
 * 真实键，会被塞进 soundsIssuesByKey[null]（对象键强转成字符串 'null'）却从未被
 * 任何循环读取——这类问题会被 validateSoundsSchema 正确识别出来，却从未传到 ok()，
 * 是"校验器本身没问题、生产入口漏报"的典型案例。改法：先把 issue.id == null 的
 * 表级问题单独收集，跑一次独立的 ok()；再处理逐键问题，不改变原有报告粒度。 */
const soundsIssuesByKey = Object.create(null);
const soundsGlobalIssues = [];
for (const issue of validateSoundsSchema(SOUNDS, {requireTeachingFields: true})) {
  if (issue.id == null) { soundsGlobalIssues.push(issue); continue; }
  (soundsIssuesByKey[issue.id] = soundsIssuesByKey[issue.id] || []).push(issue);
}
ok(soundsGlobalIssues.length === 0,
  `SOUNDS 表本身不合法（${soundsGlobalIssues.map(i => i.message).join('；')}）`);
for (const k of Object.keys(SOUNDS)) {
  const issues = soundsIssuesByKey[k] || [];
  const teaching = issues.filter(i => i.code === 'teaching-field-missing');
  const schema = issues.filter(i => i.code !== 'teaching-field-missing');
  // L3 修复（里程碑 2 第 4b 步收口）：这句原文只提"缺 grapheme/ipa/type"，但 schema
  // 分组里还混着 sound-id-invalid（ID 字符集不合法，不是"缺"什么）与 legacy-l-field
  // （多了一个该删的遗留字段，同样不是"缺"）——标题误导排障方向，改成不预设问题
  // 性质的中性措辞，具体问题交给后面拼接的 issue.message 说清楚。
  ok(schema.length === 0, `SOUNDS.${k} schema 不合法（${schema.map(i => i.message).join('；')}）`);
  ok(teaching.length === 0, `SOUNDS.${k} 缺教学字段（mem/cue/challenge/try/pass/how/warn/demo）（${teaching.map(i => i.message).join('；')}）`);
}

/* 所有会显示给孩子看的英文文本（含 SOUNDS 可见字段、表格、说明），统一扫一遍。
   exam 块按块排除——它本就是用 RESERVED 渲染的。 */
function visibleText() {
  const out = [];
  const push = v => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(push);
    else if (v && typeof v === 'object') Object.values(v).forEach(push);
  };
  for (const d of DAYS) {
    push(d.title); push(d.goal); push(d.wd);
    for (const st of d.steps) {
      push(st.t);
      for (const b of st.blocks) {
        if (b.b === 'exam') continue;
        push(b.html); push(b.note); push(b.head); push(b.rows); push(b.items); push(b.words); push(b.pairs);
      }
    }
  }
  BOOK.pages.forEach(p => { push(p.line); push(p.zh); });
  push(BOOK.title); push(BOOK.zh);
  Object.values(WALL_HINT || {}).forEach(push);
  Object.values(G1_THEME).forEach(th => { push(th.title); push(th.cmd); });
  Object.values(SOUNDS).forEach(s => {
    push(s.mem); push(s.cue); push(s.challenge); push(s.try);
    push(s.pass); push(s.how); push(s.warn); push(s.demo);
  });
  return out.join(' ').replace(/<[^>]*>/g, ' ');
}
const VISIBLE = new Set(visibleText().toLowerCase().match(/[a-z]+/g) || []);

head('② 铁律 3：周检词一个都没练过');
for (const w of RESERVED) {
  ok(!VISIBLE.has(w.toLowerCase()), `保留词 "${w}" 出现在课程可见文本里（lead/note/table/list/小书/音素卡）`);
  ok(!usedWords.has(w), `保留词 "${w}" 泄漏进了练习/游戏`);
  ok(!G5_WHITELIST.includes(w), `保留词 "${w}" 出现在 G5 白名单`);
  ok(!wallWords.includes(w), `保留词 "${w}" 上了词卡墙`);
}
ok(RESERVED.length === 5, `周检词应为 5 个，实际 ${RESERVED.length}`);
// L4（里程碑 2 第 5 步预筛）：`META.week === 1 ||` 这条豁免当初就是为四字位的
// 'spit'（W1 周检词）开的；2026-09-09 第 5 步把它换成三字位的 'pit' 后，W1 五词
// 已全是三个字母，豁免零风险删除——留着会让审计里对应的 currentlyExempted:true
// 长期显示"还豁免着"，误导后人以为这条规则对 W1 不生效。
/* T5（外审 medium，2026-09-10）：改前按 `w.length === 3` 判字符数——W5 起会出现
 * `rain` 这类三个字位、四个字符的周检词，按字符数判会被误判为不合格（明明字位数
 * 合格，字符数却不是 3）。改为用本文件已有的 idsForWord(w)（下方④已定义，
 * function 声明会提升到本模块作用域顶部，这里可以直接调用——见下方 idsForWord
 * 定义处的头注释）取字位数组长度 === 3；idsForWord 内部走 segmentWord，遇到
 * 未教字位/歧义会抛错，这里用 try/catch 转成清晰的 ok(false, ...) 失败而不是让
 * 整个进程带栈崩溃，未写 segments 的多解词按现有③/④同一套语义报错（分词失败本身
 * 就是数据缺陷，不该被这条周检词字位数检查悄悄吞掉）。 */
for (const w of RESERVED) {
  let ids;
  try { ids = idsForWord(w); }
  catch (e) { ok(false, `周检词 "${w}" 无法按字位分词（${e.code || 'error'}）：${e.message}`); continue; }
  ok(ids.length === 3, `周检词 "${w}" 必须是三个字位，实际 ${ids.length} 个字位 [${ids.join(',')}]（规范 §7.3：全 CVC，不放连辅音/四音词）`);
}

head('③ 字母全在已教范围内');
/* B-M2（外审 medium，2026-09-10）：改前只遍历 usedWords（本文件顶部手写的七类块
 * 收集：blend/initialpick/words/pair/sight/flash/sentences + G1_ROUNDS + G4_WORDS）
 * + RESERVED——BOOK.pages 与 wordforge 两类真实词消费入口从未进入这个检查，含未教
 * 字母的书页正文或换头造词结果不会被③抓到。改为语料换成第 3 步已建的共享抽取器
 * tools/validation/word_consumers.js 的 collectWordConsumption（15 类来源，见该
 * 文件的 ENTRY_KINDS），枚举全部真实消费入口，不再是这里手写的一份更窄的子集
 * （feedback_dont_relist_what_source_already_lists：源头已经有权威清单，不用自己
 * 再挑一份）。collectWordConsumption 自己标为"不消费"的类别（W/RESERVED 池/
 * ASSESS_TEXT/SOUNDS.demo 等，见该文件头排除清单）本就不会出现在它的返回结果里，
 * 不需要在这里另行处理。失败消息带上具体来源类型，便于定位是哪一类入口漏教了
 * 字母。
 *
 * H2（外审 high，2026-09-10）二次修订豁免逻辑：
 *   - 删掉 `META.week === 1 && w.toLowerCase() === 'nat'` 这条豁免——它是从①
 *     （引用完整性，查"词是否在 W 里有释义"）抄过来的，③查的是完全不同的问题
 *     （未教字母）；'nat' 的 n/a/t 三个字母 W1 全教了，本来就不该出现在③的
 *     失败列表里，不需要任何豁免。
 *   - G1 桶的豁免改按记录来源（kind）精确匹配，不再按"周号 + 词形是否出现在
 *     某个 pos 桶里"：实测 G1_ROUNDS 的 pos（目标音正例）与 neg（干扰词反例）
 *     两个桶本质都是"孩子只听不看不拼读"的听力辨音素材（G1 是纯听力游戏），
 *     不是只有 neg 桶才该豁免——W1 的 a 轮 pos 桶（cat/hat/map/bat）与 s 轮
 *     pos 桶（sun/sock/snake）在 W1 字位表下同样是"含未教字母"，W2 起恰好
 *     pos 桶词都可解码只是内容选取的巧合，不是规则要求。改为按
 *     `kinds.has('g1-rounds')` 精确匹配来源，不再关心具体是哪个桶、哪一周——
 *     覆盖范围与改前的 G1NEG ∪ "W1 pos 桶" 完全一致，但判据本身不再跟周号和
 *     词形绑死。原来独立维护的 G1NEG 常量因此不再需要，已删除。
 *
 * H1（外审 high，2026-09-10）：上一版按"词"聚合全部来源的 kind 集合，只要其中
 * 任一来源命中 `g1-rounds` 就整词 `continue`——这会把同一拼写在**其他**非豁免
 * 来源（book-page/wordforge 等）里的出现也一起放过。比如某词既在 G1 的 neg 桶
 * （合法豁免，纯听力不要求可解码）又出现在某页书的正文里（真实阅读内容，必须
 * 可解码），改前只要 kinds 里有 'g1-rounds' 就整词跳过，书页正文里那个真实的
 * 未教字位/零解问题会被静默放过——"豁免"被按拼写误传染到了不该豁免的来源上。
 *
 * H2（外审 high，2026-09-10）：同一处的第二个问题——"G1 桶豁免"这条规则本身的
 * 范围也判宽了。规范只豁免「全部 neg 桶」+「仅第一周的 pos 桶」（W1 的 pos 桶
 * 词形选取还没顾得上避开未教字母，从第二周起 pos 桶就必须像其它教学内容一样
 * 可解码），改前的 `kinds.has('g1-rounds')` 对**任何周任何桶**的 g1-rounds
 * 来源一律豁免，W2 起的 pos 桶词若含未教字母也会被放过。
 *
 * 两处一并修复：豁免判定下沉到"记录"级别（`isExemptRecord`），不是"词"级别——
 * 同一个词形在多处出现时，只要**至少有一条记录不豁免**，这个词就必须能正常
 * 分词/落在已教字位范围内；豁免范围精确为 `bucket==='neg' || (本周===1 &&
 * bucket==='pos')`（word_consumers.js 的 g1-rounds 记录已经带 `bucket` 与
 * `week` 字段，不需要另外改抽取器）。分词/未教字位的判定结果本身只跟词形和
 * 当前 SOUNDS/TAUGHT 有关、与是哪条记录触发无关，所以仍按词只算一次
 * （避免同一个词因为出现在多处非豁免来源而被重复报错——"错误去重放在结果层"），
 * 但失败消息里的"来源"改成列出这个词全部出现过的来源（含豁免来源），方便定位。 */
function isExemptRecord(rec) {
  if (rec.kind !== 'g1-rounds') return false;
  return rec.bucket === 'neg' || (META.week === 1 && rec.bucket === 'pos');
}
const wordRecords = new Map(); // word -> Array<record>（含 kind，g1-rounds 记录另带 bucket/week）
for (const rec of collectWordConsumption(box)) {
  const list = wordRecords.get(rec.word) || [];
  list.push(rec);
  wordRecords.set(rec.word, list);
}
for (const w of RESERVED) {
  const list = wordRecords.get(w) || [];
  list.push({ word: w, kind: 'RESERVED' });
  wordRecords.set(w, list);
}
/* M4（外审 medium，2026-09-10，对 W5 是实质问题）：改前 `[...w]` 按字符拆、与
 * TAUGHT（= Object.keys(SOUNDS)，其实是字位 ID 集合）逐字符比——W5 起 SOUNDS 里
 * 出现多字母字位（比如 `ai`）后，这个判据双向出错：
 *   - `ai` 未教而 a、i 已教时，含 `ai` 的词（如 rain）按字符拆成 r/a/i/n 逐个
 *     查 TAUGHT 全部命中，会被误判"字母全在已教范围内"——但 rain 实际上无法
 *     用当周字位表分词（`ai` 不存在，`a`+`i` 拼不出词形里的 "ai" 这个字位）。
 *   - 反过来，只教了 `ai` 没有分别教 a/i 时，字符级拆分会把 "a"/"i" 当成两个
 *     独立字符去查 TAUGHT，即使这两个字符从未作为独立字位教过，也可能因为
 *     TAUGHT 里恰好有别的原因命中 "a"/"i" 键而被误判为"未教"（假阳性）。
 * 改为非豁免词一律走 idsForWord(w)（下方④已定义，function 声明提升到模块顶部，
 * 这里可以直接调用）取字位 ID 数组，逐 ID 与 TAUGHT（字位 ID 集合）比——TAUGHT
 * 的语义本来就是"已教字位 ID 集合"，改成按 ID 比才是它原本该有的用法。零解/
 * 多解无 segments 时 idsForWord 会抛错，这里同 T5 的处置：转成清晰的
 * ok(false, ...) 失败并跳过这个词，不让整个进程带栈崩溃（与 H1 在
 * test_grapheme_semantics.js 里"零解/多解即数据缺陷、不允许静默放行"是同一个
 * 口径，只是这里的"放行"方式是转成失败而不是抛错终止整个检查）。 */
for (const [w, records] of wordRecords) {
  if (SIGHT.has(w.toLowerCase())) continue;
  const nonExempt = records.filter(r => !isExemptRecord(r));
  if (nonExempt.length === 0) continue; // 这个词全部出现的来源都豁免，不检查
  const kinds = new Set(records.map(r => r.kind)); // 报告仍列出全部来源（含豁免来源），便于定位
  let ids;
  try {
    ids = idsForWord(w);
  } catch (e) {
    ok(false, `"${w}" 无法按字位分词（${e.code || 'error'}）：${e.message}（来源：${[...kinds].sort().join(',')}）`);
    continue;
  }
  /* L1（轮 D 复审，外审 low，2026-09-10）：这条判据当前是恒真式，不是有判别力的
   * 检查——防御性分支，标注理由不删代码。idsForWord(w) 内部走 segmentWord(word,
   * SOUNDS, explicit)：非显式路径的分词候选完全从 buildGraphemeIndex(SOUNDS)
   * 派生（只会枚举 SOUNDS 自己的键），不可能返回 SOUNDS 之外的 ID；显式 segments
   * 路径（validateExplicitSegments）同样会先校验每个 ID 都是 SOUNDS 的自有键，
   * 不合法就直接抛错（走上面的 catch 分支，不会走到这里）。TAUGHT 本身就是
   * `new Set(Object.keys(SOUNDS))`——ids 与 TAUGHT 同源自 SOUNDS，`bad` 恒为空
   * 数组。只有将来"分词表"（segmentWord 允许识别的字位集合）与"已教集合"
   * （TAUGHT，规范意义上"孩子已经学过的字位"）出现分离——比如引入"允许分词但
   * 尚未教学"的字位表——这条判据才会有真正的判别力，届时 TAUGHT 需要换成那个
   * 分离出来的"已教"子集，不能再直接等于 Object.keys(SOUNDS)。 */
  const bad = ids.filter(id => !TAUGHT.has(id));
  ok(bad.length === 0, `"${w}" 含未教字位 [${bad.join(',')}]（来源：${[...kinds].sort().join(',')}）`);
}

head('④ 积木架能摆出题库里的词（字位安全，方案 §2.2「摆词比较/积木架」行）');
/* idsForWord(word)：按字位分词，优先用 W[word].segments 显式消歧（与
 * render-blocks.js 的 graphemesOf 同一套逻辑，只是这里是 Node 侧独立实现，
 * 不 require 浏览器专用的 wordColorCtx）。 */
function idsForWord(word){
  const key = word.toLowerCase();
  const entry = W && Object.prototype.hasOwnProperty.call(W, key) ? W[key] : null;
  const explicit = (entry && Array.isArray(entry.segments)) ? entry.segments : undefined;
  return segmentWord(word, SOUNDS, explicit);
}
/* canSpellIds(ids, pool)：pool 是已经过 safeAssertIdList 校验（数组 + 每项在 SOUNDS
 * 里存在）的字位 ID 数组，直接消耗成 ID 多重集——保留重复项（方案 §2.3「rack 是
 * 多重集，不是集合」）。第 8 步收紧后校验只在 safeAssertIdList 做一次，这里不必
 * 每检查一个词就重复调用 assertIdList（G4_WORDS/G5_WHITELIST 合计约 40 个词，逐词
 * 重复校验同一份 rack 只会重复同一条失败消息）。 */
function canSpellIds(ids, pool){
  const remaining = pool.slice();
  for (const id of ids) { const i = remaining.indexOf(id); if (i < 0) return false; remaining.splice(i, 1); }
  return true;
}
function checkSpellable(word, rackValue, rackLabel){
  let ids;
  try { ids = idsForWord(word); }
  catch (e) { ok(false, `${rackLabel} "${word}" 无法按字位分词（${e.code || 'error'}）：${e.message}`); return; }
  ok(canSpellIds(ids, rackValue), `${rackLabel} "${word}" 用 rack "${rackValue}" 摆不出来`);
}
/* safeAssertIdList(value, label)：先守卫再校验（M-5 同款道理，第 8 步延续到收紧后的
 * assertIdList）。rackG4/rackG5/wallLetters 若拿到迁移期遗留的旧字符串形态、数组
 * 元素非字符串、或含 SOUNDS 里不存在的 ID，会从 assertIdList() 内部抛出未捕获的
 * GraphemeError（id-list-legacy-string-rejected / id-list-invalid / unknown-id），
 * 整个 Node 进程带栈退出，check_data.js 剩余全部断言一条都不会跑。副机（GPT）沿用
 * 旧字符串形态或手滑写错 ID 写第五周数据层最可能踩到这个坑，拿到的会是一段陌生的
 * 栈，而不是一条清晰的错误。这里统一捕获、转成一条正常的 ok(false, ...) 失败并
 * 返回空数组占位，其余检查照常继续跑。
 * 第 8 步收紧后 assertIdList 已经把"数组元素是否都在 SOUNDS 里"这层校验收了进去，
 * 调用方不必再另外逐项 ok(SOUNDS[c], ...) 复查——safeAssertIdList 成功返回的数组
 * 里每一项已保证存在于 SOUNDS，再查一遍是恒真的死断言（不产生任何新信号）。 */
function safeAssertIdList(value, label){
  try {
    return assertIdList(value, SOUNDS);
  } catch (e) {
    ok(false, `${label} 未通过字位 ID 校验（${e.code || 'error'}）：${e.message}`);
    return [];
  }
}
const rackG4Valid = Array.isArray(META.rackG4);
ok(rackG4Valid, 'META.rackG4 必须是字位 ID 数组（迁移期不再接受旧的单字符串）');
const rackG4Safe = rackG4Valid ? safeAssertIdList(META.rackG4, 'META.rackG4') : [];
const rackG5Valid = Array.isArray(META.rackG5);
ok(rackG5Valid, 'META.rackG5 必须是字位 ID 数组（迁移期不再接受旧的单字符串）');
const rackG5Safe = rackG5Valid ? safeAssertIdList(META.rackG5, 'META.rackG5') : [];
G4_WORDS.forEach(w => checkSpellable(w, rackG4Safe, 'G4 订单'));
G5_WHITELIST.forEach(w => {
  checkSpellable(w, rackG5Safe, 'G5 白名单');
  ok(W[w], `G5 白名单 "${w}" 不在 W 里`);
});

head('⑤ 点亮墙与首教日（DATA-WALL-01：三条集合与顺序断言 + M-6 两条补充，里程碑 2 第 7 步启用）');
/* wallLetters 第 7 步起是字位 ID 数组，第 8 步起经 safeAssertIdList（同上④）校验，
 * 与旧格式兼容选项无关——normalizeIdList 的迁移期双读已在第 8 步删除，收口为只收
 * 数组、逐项验证存在性的 assertIdList。 */
const wallLettersValid = Array.isArray(META.wallLetters);
ok(wallLettersValid, 'META.wallLetters 必须是字位 ID 数组（迁移期不再接受旧的单字符串）');
const wallIds = wallLettersValid ? safeAssertIdList(META.wallLetters, 'META.wallLetters') : [];

ok(Array.isArray(META.newPatterns), 'META.newPatterns 必须是字位 ID 数组（本周新点亮的积木，教新字位的周非空，否则空数组）');

/* 断言①：wallLetters 等于「独立教学顺序序列」（按 project.json 周序累计各周
 * newPatterns，同周内按数组自身顺序追加，见 wall_order.js/方案 §2.4）过滤
 * displayOnWall!==false 后的结果——顺序、缺项、额外项、重复项分别独立判定
 * （方案 §5「墙」行：四类互不覆盖，任一非空即 fail）。 */
let teachingOrder = null;
try {
  // M6：computeTeachingOrder 现在要求显式传入预期周序（源码树校验，取自
  // project.json 的 weeks，不是任何构建产物），不再只靠 weekRecords 内部彼此
  // 连续来判定，见 wall_order.js 头注释与 getExpectedWeeksUpTo。
  teachingOrder = computeTeachingOrder(gatherWeekRecordsUpTo(box, META.week), getExpectedWeeksUpTo(META.week));
} catch (e) {
  ok(false, `无法计算独立教学顺序真相源（${e.code || 'error'}）：${e.message}`);
}
if (teachingOrder) {
  const expectedOrder = expectedWallOrder(teachingOrder, SOUNDS);
  const diff = diffWallLetters(wallIds, expectedOrder);
  ok(diff.missing.length === 0, `wallLetters 缺少独立教学顺序序列里应上墙的字位：[${diff.missing.join(',')}]`);
  ok(diff.extra.length === 0, `wallLetters 含独立教学顺序序列之外的额外字位：[${diff.extra.join(',')}]`);
  ok(diff.duplicates.length === 0, `wallLetters 含重复字位：[${diff.duplicates.join(',')}]`);
  ok(diff.orderMatches, `wallLetters 顺序与独立教学顺序序列（按各周 newPatterns 累计）不一致。期望：[${expectedOrder.join(',')}]，实际：[${wallIds.join(',')}]`);
}

/* 断言①b（M-6b，里程碑 2 收口批）：规范的取值规则是「wallLetters 恒等于 SOUNDS 全部
 * 键，除非显式标了 displayOnWall:false」（方案 §2.4）。断言①只把 wallLetters 与
 * 「累计 newPatterns 推出的独立教学顺序」比对，两边都不会回头核对 SOUNDS 自身的键
 * 集合——SOUNDS 里混进一个既不在 newPatterns、也不在 wallLetters 里的孤儿键，断言
 * ①②③与上面「wallIds ⊆ SOUNDS」的存在性检查（只查了这一个方向）全都不会报错。
 * 这里补上反方向：SOUNDS 的每个可见键都必须能在 wallLetters 里找到。 */
const wallIdSet = new Set(wallIds);
for (const id of Object.keys(SOUNDS)) {
  if (SOUNDS[id].displayOnWall === false) continue;
  ok(wallIdSet.has(id), `SOUNDS 里的字位 "${id}" 未标 displayOnWall:false，却不在 wallLetters 里（孤儿字位：不在 newPatterns 也不在 wallLetters，可能是漏加或漏标）`);
}

/* 断言②：FIRST_TEACH_DAY 的键集合与 newPatterns 完全相等（规范 v2.0 §3「唯一模型」：
 * 「FIRST_TEACH_DAY 键集合恒等于 newPatterns；历史首教日不在本周文件里重复」）。 */
const newPatternIds = Array.isArray(META.newPatterns) ? META.newPatterns : [];
ok(setsEqual(Object.keys(FIRST_TEACH_DAY), newPatternIds),
  `FIRST_TEACH_DAY 的键集合与 newPatterns 不一致。FIRST_TEACH_DAY 键：[${Object.keys(FIRST_TEACH_DAY).sort().join(',')}]，newPatterns：[${newPatternIds.slice().sort().join(',')}]`);

/* 断言②b（M-6a，里程碑 2 收口批）：newPatterns 数组顺序就是真相源本身——
 * wall_order.js 的 computeTeachingOrder 直接按这个数组顺序累计成独立教学顺序，
 * 断言①再拿它去核对 wallLetters。但此前没有任何断言把 newPatterns 内部顺序与
 * 首教日的天号对齐：把某周 newPatterns 整体打乱、wallLetters 对应尾部同步打乱，
 * 断言①（两边用同一份错误顺序，互相对得上）、②（只比集合不比顺序）、③（逐键独立
 * 核对，不看数组顺序）全部仍然全绿，但墙会按错误顺序点亮。这里补上：newPatterns
 * 内部顺序必须按首教日天号非降序排列。 */
if (Array.isArray(META.newPatterns)) {
  const newPatternDays = newPatternIds.map(id => FIRST_TEACH_DAY[id]);
  if (newPatternDays.every(d => typeof d === 'number' && Number.isFinite(d))) {
    const sortedDays = newPatternDays.slice().sort((a, b) => a - b);
    ok(newPatternDays.every((d, i) => d === sortedDays[i]),
      `newPatterns 顺序应按首教日天号非降序排列（它是墙呈现顺序的真相源本身，见 wall_order.js）。` +
      `newPatterns：[${newPatternIds.join(',')}]，对应天号：[${newPatternDays.join(',')}]`);
  }
}

/* 断言③：每个首教日落到对应 DAYS[].sounds（沿用既有逻辑，未改动）。 */
for (const [c, day] of Object.entries(FIRST_TEACH_DAY)) {
  ok(SOUNDS[c], `首教字位 "${c}" 不在 SOUNDS 里`);
  const d = DAYS[day - 1];
  ok(d && d.sounds.includes(c), `"${c}" 标称第 ${day} 天首教，但那天的 sounds 里没有它`);
}

head('⑥ G1 / G3 题库');
for (const k of Object.keys(G1_ROUNDS)) {
  ok(G1_THEME[k], `G1 轮 "${k}" 缺 THEME`);
  ok(G1_ROUNDS[k].pos.length === 4 && G1_ROUNDS[k].neg.length === 4, `G1 轮 "${k}" 正负例不是 4+4`);
  ok(SOUNDS[k], `G1 轮键 "${k}" 不在 SOUNDS 里`);
}
Object.keys(G1_THEME).forEach(k => ok(G1_ROUNDS[k], `G1_THEME 有 "${k}" 但 G1_ROUNDS 没有`));
G3_PAIRS.forEach(([a, b]) => {
  ok(W[a] && W[b], `G3 词对 ${a}/${b} 有词不在 W 里`);
  ok(a.length === b.length, `G3 词对 ${a}/${b} 长度不同`);
  ok([...a].filter((c, i) => c !== b[i]).length === 1, `G3 词对 ${a}/${b} 不是最小对立（只许差一个字母）`);
});

head('⑦ 铁律 4：裸读/闪读不许出图');
for (const d of DAYS) for (const st of d.steps) {
  if (/裸读|闪读|快闪/.test(st.t)) {
    ok(!st.blocks.some(x => x.b === 'words'),
       `步骤「${st.t}」（第 ${d.n} 天）用了带图的 words 块，应改用 flash`);
  }
}

head('⑧ 每天时长与打卡');
ok(DAYS.length === 7, `天数不是 7，实际 ${DAYS.length}`);
ok(DAYS[6] && DAYS[6].rest === true, '第 7 天不是休息日');
for (const d of DAYS) {
  const total = d.steps.reduce((a, s) => a + s.min, 0);
  ok(d.rest || total === 30, `第 ${d.n} 天合计 ${total} 分钟，不是 30`);
  ok(d.steps.flatMap(s => s.blocks).some(b => b.b === 'checks'), `第 ${d.n} 天没有打卡块`);
  ok(d.title && d.goal && d.wd, `第 ${d.n} 天缺 title/goal/wd`);
}
const sightCount = DAYS.flatMap(d => d.steps).flatMap(s => s.blocks)
  .filter(b => b.b === 'sight').reduce((a, b) => a + b.items.length, 0);
ok(sightCount <= 3, `本周认读词 ${sightCount} 个，规范 §7.3 要求每周 ≤ 3`);

head('⑨ 词卡墙与周检');
ok(wallWords.length > 0, '词卡墙一个词都没有（DAYS 里没有 words 块？）');
const examStep = DAYS[6] && DAYS[6].steps.find(s => s.blocks.some(b => b.b === 'exam'));
ok(!!examStep, '第 7 天没有 exam 块（周检是家长唯一的尺子）');

head('⑩ 第四周起的测评隔离与巩固周契约');
const assessmentErrors = validateAssessment(box);
assessmentErrors.forEach(message=>ok(false,message));
if(!assessmentErrors.length) ok(true,'测评契约');

head('⑪ gen_segments 未复核建议门槛（里程碑 2 收口批 M4）');
/* tools/validation/gen_segments.js 的 --write 会把候选 segments 写回 W 声明，
 * 并在同一行打上机器可识别标记 `@gen-segments-unreviewed`（见该文件 injectSegmentsIntoWDeclaration
 * 附近注释）——resolveWord 生成的建议只是"字位数最少"这条编辑启发式选出来的候选，
 * 不具契约优先级，必须人工复核确认后删除标记才能进入交付。这里直接在原始源码文本
 * 里找这个标记：数据里只要还含它，就说明存在未经复核的 gen_segments 建议，判 fail，
 * 不能悄悄放行。人工复核确认后删除该行的标记即可通过。 */
const unreviewedMatches = [...raw.matchAll(/@gen-segments-unreviewed/g)];
ok(unreviewedMatches.length === 0,
  `数据里还有 ${unreviewedMatches.length} 处 gen_segments 未复核标记（@gen-segments-unreviewed）——` +
  `这些 segments 只是"字位数最少"启发式给出的候选，需人工复核教学意图后删除标记才能交付`);

head('⑫ 富文本未实现前，纯文本字段禁止出现标签（外审 L2）');
/* colorRichText（frontend/src/shared/graphemes.js）尚未实现——Node 侧 DOM 解析方案
 * （方案 §5「Node 侧 DOM 解析」）未裁定，里程碑 2 第 4b 步按停机条款挂起，见该函数
 * 头部注释。当前全部渲染路径（colorStrictWord/colorLenientWord/colorPlainText，
 * 以及 games.js 里对 zh/ipa/cue 等字段的直接插值）都假设这些字段是"纯文本"，一律走
 * escapeHtmlText 转义；数据若先一步塞进 <...> 标签，要么被转义显示成难看的尖括号，
 * 要么诱使某处调用方绕开转义直接走 innerHTML 拼接（M2 的隐患正来自这类字段）。
 * 在 colorRichText 补上白名单解析实现之前，这里显式拒绝：纯文本字段一律不许出现
 * `<`/`>`，把"数据先出现标签"这条路堵在数据层，不留到渲染时才炸。 */
function assertPlainTextField(label, value) {
  if (typeof value !== 'string') return;
  ok(!/[<>]/.test(value),
    `${label} 应为纯文本，但含 "<" 或 ">"（colorRichText 尚未实现，见 graphemes.js 头注释）：${value}`);
}
Object.keys(W).forEach(w => assertPlainTextField(`W.${w}.zh`, W[w] && W[w].zh));
Object.keys(SOUNDS).forEach(id => {
  const s = SOUNDS[id] || {};
  /* 只有 ipa 是声明为纯文本的字段。mem/cue/challenge/try/pass/how/warn 是作者手写的
   * "教学叙述"字段，与 b.note/b.lead/b.html 同一信任级别，真实数据里 cue（六周全部
   * 已教字位）与 warn（week03 的 l/b 两条）已经在用 <span class="en">/<b> 做内联强调
   * ——这条判据与 render-blocks.js 渲染这组字段时的决定一致（见该文件 case 'sound'
   * 上方注释），此处不重复对它们判 fail，否则会把已交付的真实数据全部判假失败。 */
  assertPlainTextField(`SOUNDS.${id}.ipa`, s.ipa);
  if (Array.isArray(s.demo)) {
    s.demo.forEach((pair, i) => {
      if (!Array.isArray(pair)) return;
      assertPlainTextField(`SOUNDS.${id}.demo[${i}][0]`, pair[0]);
      assertPlainTextField(`SOUNDS.${id}.demo[${i}][1]`, pair[1]);
    });
  }
});
Object.entries(WALL_HINT || {}).forEach(([id, h]) => {
  assertPlainTextField(`WALL_HINT.${id}.en`, h && h.en);
  assertPlainTextField(`WALL_HINT.${id}.zh`, h && h.zh);
});
assertPlainTextField('BOOK.title', BOOK.title);
assertPlainTextField('BOOK.zh', BOOK.zh);
(BOOK.pages || []).forEach((p, i) => {
  assertPlainTextField(`BOOK.pages[${i}].line`, p.line);
  assertPlainTextField(`BOOK.pages[${i}].zh`, p.zh);
});
for (const d of DAYS) {
  for (const st of d.steps) {
    for (const b of st.blocks) {
      if (b.b === 'sentences') {
        (b.items || []).forEach(([s, zh], i) => {
          assertPlainTextField(`DAYS[${d.n}] sentences[${i}][0]`, s);
          assertPlainTextField(`DAYS[${d.n}] sentences[${i}][1]`, zh);
        });
      }
    }
  }
}

console.log(`\n${'='.repeat(46)}\n通过 ${pass} 项，失败 ${fail} 项`);
if (fail) process.exit(1);
