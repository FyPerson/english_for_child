/* week02.html 数据层一致性自检。对应规范 §13 冒烟清单里可自动化的部分。 */
const fs = require('fs');
const path = require('path');

/* M-4：不要写死绝对路径。从脚本自身位置推仓库根（tools/week-checks/ → 上两级），
   允许命令行传目标 HTML，并把最终解析路径打印出来——否则换机器/换仓库位置时
   会静默读到错误的文件，还一路绿灯。 */
const REPO = path.resolve(__dirname, '..', '..');
const TARGET = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(REPO, 'week02.html');
if (!fs.existsSync(TARGET)) {
  console.error(`找不到目标文件：${TARGET}
用法：node ${path.relative(REPO, __filename)} [目标HTML]`);
  process.exit(2);
}
console.log(`目标文件：${TARGET}`);
const html = fs.readFileSync(TARGET, 'utf8');

/* 按锚点抠出数据常量，在沙箱里 eval（这些块不碰 DOM） */
function grab(startRe, endMark) {
  const m = html.match(startRe);
  if (!m) throw new Error('抠不到：' + startRe);
  const i = m.index;
  const j = html.indexOf(endMark, i + m[0].length) + endMark.length;
  return html.slice(i, j);
}

const src = [
  grab(/const RESERVED = \[/, '];'),
  grab(/const SOUNDS = \{/, '\n};'),
  'SOUNDS.k = Object.assign({}, SOUNDS.c, { L:\'k\' });',
  grab(/const W = \{/, '\n};'),
  grab(/const BOOK = \{/, '\n};'),
  grab(/const WALL_HINT = \{/, '\n};'),
  grab(/const FIRST_TEACH_DAY = \{/, '};'),
  grab(/const G1_ROUNDS = \{/, '\n};'),
  grab(/const G1_THEME = \{/, '\n};'),
  grab(/const G3_PAIRS = \[/, '];'),
  grab(/const G4_WORDS = \[/, '];'),
  grab(/const G5_WHITELIST = \[/, '\n];'),
  grab(/const DAYS = \[/, '\n];'),
].join('\n');

const box = {};
new Function('box', src + '\nObject.assign(box,{RESERVED,SOUNDS,W,BOOK,WALL_HINT,FIRST_TEACH_DAY,G1_ROUNDS,G1_THEME,G3_PAIRS,G4_WORDS,G5_WHITELIST,DAYS});')(box);
const { RESERVED, SOUNDS, W, BOOK, WALL_HINT, FIRST_TEACH_DAY, G1_ROUNDS, G1_THEME, G3_PAIRS, G4_WORDS, G5_WHITELIST, DAYS } = box;

/* 从 HTML 里读回两处积木架和点亮墙字母集，确保和数据对得上 */
const rackG4 = html.match(/const RACK_LETTERS = '([a-z]+)'\.split\(''\);\s*\/\/ 10 块/)[1];
const rackG5 = html.match(/const RACK_LETTERS = '([a-z]+)'\.split\(''\);\s*\/\/ 13 块/)[1];
const wallLetters = html.match(/\$\{'([a-z]+)'\.split\(''\)\.map\(c=>\{/)[1];

let fail = 0, pass = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } };
const head = s => console.log('\n' + s);

/* ---------- 收集课程里实际引用到的词与音 ---------- */
const usedWords = new Set(), usedSounds = new Set(), wallWords = [];
for (const d of DAYS) {
  for (const s of d.sounds) usedSounds.add(s);
  for (const st of d.steps) for (const b of st.blocks) {
    if (b.b === 'blend') b.words.forEach(w => usedWords.add(w));
    if (b.b === 'words') b.items.forEach(w => { usedWords.add(w); if (!wallWords.includes(w)) wallWords.push(w); });
    if (b.b === 'pair') b.pairs.forEach(p => p.forEach(w => usedWords.add(w)));
    if (b.b === 'sight') b.items.forEach(([w]) => usedWords.add(w));
    if (b.b === 'flash') b.items.forEach(it => { if (it.k === 'w') usedWords.add(it.v); else usedSounds.add(it.k); });
  }
}
for (const r of Object.values(G1_ROUNDS)) [...r.pos, ...r.neg].forEach(w => usedWords.add(w));
G4_WORDS.forEach(w => usedWords.add(w));

const TAUGHT = new Set('satipnckehrmd'.split(''));

head('① 引用完整性');
for (const w of usedWords) ok(W[w], `词 "${w}" 在课程里用到，但 W 里没有`);
for (const s of usedSounds) ok(SOUNDS[s], `音 "${s}" 在课程里用到，但 SOUNDS 里没有`);
for (const w of RESERVED) ok(W[w], `保留词 "${w}" 不在 W 里（周检块会读 W[w].zh）`);
for (const p of BOOK.pages) ok(typeof p.line === 'string' && p.zh && p.art, `小书页缺字段：${p.line}`);

/* M-6：结构化块只覆盖了 words/blend/pair/flash/sight，保留词若落进 lead、note、
   table、list 的正文，或落进小书句子，原来的检查照样全绿。这里把所有"会显示给
   孩子看的英文文本"统一收一遍，按词边界比对保留词。
   排除项：exam 块本身就是用 RESERVED 渲染的，不算泄漏。 */
/* 递归收集：字符串直接收，数组和普通对象都往下走。原先只递归字符串和数组，
   对象形的 items（例如 flash 的 {k,v}）会被整块跳过。 */
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
        if (b.b === 'exam') continue;                 // 周检卡就是 RESERVED 本身，按块排除
        push(b.html); push(b.note); push(b.head); push(b.rows); push(b.items); push(b.words); push(b.pairs);
      }
    }
  }
  BOOK.pages.forEach(p => { push(p.line); push(p.zh); });
  push(BOOK.title); push(BOOK.zh);
  Object.values(WALL_HINT || {}).forEach(h => push(h));
  Object.values(G1_THEME).forEach(th => { push(th.title); push(th.cmd); });
  /* SOUNDS 的这些字段全都会渲染进音素卡（助记 / 动作口令 / 实验 / 成功标准 /
     家长折叠区 / 例词），是保留词最容易溜进去的地方之一，必须一并扫。 */
  Object.values(SOUNDS).forEach(s => {
    push(s.mem); push(s.cue); push(s.challenge); push(s.try);
    push(s.pass); push(s.how); push(s.warn); push(s.demo);
  });
  return out.join(' ').replace(/<[^>]*>/g, ' ');      // 去标签，只留可见文字
}
const VISIBLE_TOKENS = new Set(
  (visibleText().toLowerCase().match(/[a-z]+/g) || [])
);

head('② 铁律 3：周检词一个都没练过');
for (const w of RESERVED) {
  ok(!VISIBLE_TOKENS.has(w.toLowerCase()),
     `保留词 "${w}" 出现在课程可见文本里（lead / note / table / list / 小书 / 词组提示 / 音素卡）`);
}
for (const w of RESERVED) {
  ok(!usedWords.has(w), `保留词 "${w}" 泄漏进了练习/游戏`);
  ok(!G5_WHITELIST.includes(w), `保留词 "${w}" 出现在 G5 白名单`);
  ok(!BOOK.pages.some(p => new RegExp(`\\b${w}\\b`, 'i').test(p.line)), `保留词 "${w}" 出现在小书里`);
}
ok(RESERVED.every(w => w.length === 3), '周检词必须全是三个字母（CVC）');

head('③ 字母全在已教范围内');
const SIGHT = new Set(['the', 'is']);
for (const w of [...usedWords, ...RESERVED]) {
  if (SIGHT.has(w)) continue;
  const bad = [...w].filter(c => !TAUGHT.has(c));
  // G1 干扰词只听不读，允许含未教字母
  const isG1Neg = Object.values(G1_ROUNDS).some(r => r.neg.includes(w));
  if (!isG1Neg) ok(bad.length === 0, `"${w}" 含未教字母 [${bad}]`);
}

head('④ 积木架能摆出题库里的词');
for (const w of G4_WORDS) {
  const pool = rackG4.split('');
  let okw = true;
  for (const c of w) { const i = pool.indexOf(c); if (i < 0) { okw = false; break; } pool.splice(i, 1); }
  ok(okw, `G4 订单 "${w}" 用 rack "${rackG4}" 摆不出来`);
}
for (const w of G5_WHITELIST) {
  const pool = rackG5.split('');
  let okw = true;
  for (const c of w) { const i = pool.indexOf(c); if (i < 0) { okw = false; break; } pool.splice(i, 1); }
  ok(okw, `G5 白名单 "${w}" 用 rack "${rackG5}" 摆不出来`);
}
for (const c of [...rackG4, ...rackG5]) ok(SOUNDS[c], `积木架字母 "${c}" 不在 SOUNDS 里（aria-label 会崩）`);
G5_WHITELIST.forEach(w => ok(W[w], `G5 白名单 "${w}" 不在 W 里`));

head('⑤ 点亮墙与首教日');
for (const c of wallLetters) ok(FIRST_TEACH_DAY[c] != null, `点亮墙字母 "${c}" 没有首教日`);
for (const c of wallLetters) ok(SOUNDS[c], `点亮墙字母 "${c}" 不在 SOUNDS 里`);
for (const c of Object.keys(FIRST_TEACH_DAY)) ok(wallLetters.includes(c), `首教日有 "${c}" 但点亮墙没显示`);
for (const [c, day] of Object.entries(FIRST_TEACH_DAY)) {
  const d = DAYS[day - 1];
  ok(d && d.sounds.includes(c), `"${c}" 标称第 ${day} 天首教，但那天的 sounds 里没有它`);
}

head('⑥ G1 / G3 题库');
for (const k of Object.keys(G1_ROUNDS)) {
  ok(G1_THEME[k], `G1 轮 "${k}" 缺 THEME`);
  ok(G1_ROUNDS[k].pos.length === 4 && G1_ROUNDS[k].neg.length === 4, `G1 轮 "${k}" 正负例不是 4+4`);
  ok(SOUNDS[k], `G1 轮键 "${k}" 不在 SOUNDS 里`);
}
G3_PAIRS.forEach(([a, b]) => {
  ok(W[a] && W[b], `G3 词对 ${a}/${b} 有词不在 W 里`);
  ok(a.length === b.length, `G3 词对 ${a}/${b} 长度不同`);
  const diff = [...a].filter((c, i) => c !== b[i]).length;
  ok(diff === 1, `G3 词对 ${a}/${b} 差了 ${diff} 个字母，不是最小对立`);
});

head('⑦ 铁律 4：裸读/闪读不许出图');
for (const d of DAYS) for (const st of d.steps) for (const b of st.blocks) {
  if (b.b === 'flash') ok(true, '');
  if (/裸读|闪读|快闪/.test(st.t)) {
    const hasWords = st.blocks.some(x => x.b === 'words');
    ok(!hasWords, `步骤「${st.t}」（第 ${d.n} 天）用了带图的 words 块`);
  }
}

head('⑧ 每天时长与打卡');
for (const d of DAYS) {
  const total = d.steps.reduce((a, s) => a + s.min, 0);
  ok(d.rest || total === 30, `第 ${d.n} 天合计 ${total} 分钟，不是 30`);
  const checks = d.steps.flatMap(s => s.blocks).filter(b => b.b === 'checks');
  ok(checks.length >= 1, `第 ${d.n} 天没有打卡块`);
}
ok(DAYS.length === 7, '天数不是 7');
ok(DAYS[6].rest === true, '第 7 天不是休息日');

head('⑨ 词卡墙');
ok(wallWords.length === 34, `词卡墙 ${wallWords.length} 个词，期望 34`);
wallWords.forEach(w => ok(!RESERVED.includes(w), `词卡墙出现保留词 "${w}"`));

console.log(`\n${'='.repeat(46)}\n通过 ${pass} 项，失败 ${fail} 项`);
if (fail) process.exit(1);
