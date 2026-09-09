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
let box;
try { box = loadData(raw, isHTML); } catch(e) { console.error(e.message); process.exit(2); }
const { RESERVED, SOUNDS, W, WALL_HINT, BOOK, FIRST_TEACH_DAY, G1_ROUNDS, G1_THEME, G3_PAIRS, G4_WORDS, G5_WHITELIST, DAYS, META } = box;

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
const G1NEG = new Set(Object.values(G1_ROUNDS).flatMap(r => r.neg));
console.log(`第 ${META.week} 周 · 累计 ${TAUGHT.size} 音 · 教学词 ${wallWords.length} · `
          + `保留词 ${RESERVED.length} · 积木架 G4/${META.rackG4.length} G5/${META.rackG5.length}`);

head('① 引用完整性');
for (const w of usedWords) ok(W[w] || SIGHT.has(w.toLowerCase()) || (META.week === 1 && w.toLowerCase() === 'nat'), `词 "${w}" 在课程里用到，但 W 里没有`);
for (const s of usedSounds) ok(SOUNDS[s], `音 "${s}" 在课程里用到，但 SOUNDS 里没有`);
for (const w of RESERVED) ok(META.week >= 4 || W[w], `保留词 "${w}" 不在 W 里（周检块会读 W[w].zh）`);
for (const p of BOOK.pages) ok(typeof p.line === 'string' && p.zh && p.art, `小书页缺字段：${p.line}`);
for (const k of Object.keys(SOUNDS)) {
  const s = SOUNDS[k];
  ok(s.grapheme && s.ipa && (s.type === 'c' || s.type === 'v'), `SOUNDS.${k} 缺 grapheme/ipa/type`);
  ok(s.mem && s.cue && s.challenge && s.try && s.pass && s.how && s.warn && Array.isArray(s.demo),
     `SOUNDS.${k} 缺教学字段（mem/cue/challenge/try/pass/how/warn/demo）`);
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
ok(META.week === 1 || RESERVED.every(w => w.length === 3), '周检词必须全是三个字母（规范 §7.3：全 CVC，不放连辅音/四音词）');

head('③ 字母全在已教范围内');
for (const w of [...usedWords, ...RESERVED]) {
  if (SIGHT.has(w.toLowerCase())) continue;          // 认读词不按规则拼，豁免
  if (G1NEG.has(w) || (META.week === 1 && Object.values(G1_ROUNDS).some(r=>r.pos.includes(w)))) continue;                        // G1 干扰词只听不读，允许含未教字母
  const bad = [...w.toLowerCase()].filter(c => !TAUGHT.has(c));
  ok(bad.length === 0, `"${w}" 含未教字母 [${bad}]`);
}

head('④ 积木架能摆出题库里的词');
const canSpell = (w, rack) => {
  const pool = rack.split('');
  for (const c of w) { const i = pool.indexOf(c); if (i < 0) return false; pool.splice(i, 1); }
  return true;
};
G4_WORDS.forEach(w => ok(canSpell(w, META.rackG4), `G4 订单 "${w}" 用 rack "${META.rackG4}" 摆不出来`));
G5_WHITELIST.forEach(w => {
  ok(canSpell(w, META.rackG5), `G5 白名单 "${w}" 用 rack "${META.rackG5}" 摆不出来`);
  ok(W[w], `G5 白名单 "${w}" 不在 W 里`);
});
for (const c of new Set([...META.rackG4, ...META.rackG5])) {
  ok(SOUNDS[c], `积木架字母 "${c}" 不在 SOUNDS 里（aria-label 会崩）`);
}

head('⑤ 点亮墙与首教日');
for (const c of META.wallLetters) {
  ok(META.consolidation || FIRST_TEACH_DAY[c] != null, `点亮墙字母 "${c}" 没有首教日`);
  ok(SOUNDS[c], `点亮墙字母 "${c}" 不在 SOUNDS 里`);
}
for (const [c, day] of Object.entries(FIRST_TEACH_DAY)) {
  ok(META.wallLetters.includes(c), `首教日有 "${c}" 但点亮墙没显示`);
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

console.log(`\n${'='.repeat(46)}\n通过 ${pass} 项，失败 ${fail} 项`);
if (fail) process.exit(1);
