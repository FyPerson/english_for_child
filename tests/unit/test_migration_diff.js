/* 里程碑 2 第 3 步：五项差分测试（方案 §2.2 迁移矩阵五行 / §5「语义等价」行）。
 *
 * 差分测试的含义（§5「语义等价」）：不用"输出逐字节不变"作为等价证明；改用双实现
 * 差分——旧侧照抄现有代码里被点名的那一行算法，新侧走 frontend/src/shared/graphemes.js
 * 的 segmentWord 等公开导出，对同一批真实 W1–W4 语料比较两侧结果。在当前全单字母数据上
 * （ID === grapheme === 单字符）两侧必须逐词完全一致；差分全绿证明"改造不改变现有语义"，
 * 而不是证明"以后也不会变"（未来出现双字母字位后，旧侧算法本就该被淘汰，那是第 4b/7 步
 * 的接线工作，不是本文件要证明的事）。
 *
 * ⚠️ 本文件不接线：不修改 games.js / render-blocks.js / check_data.js /
 * assessment_contract.js。五项差分各自在本文件内部重新实现"旧侧"算法（照抄被点名的
 * 那一行），不 require 生产代码里的私有闭包（那些变量本来就没有导出）。
 *
 * 语料来源：tools/validation/word_consumers.js 的共享抽取器，跑在真实
 * frontend/src/weeks/week01–04.data.js 上（经 sounds_grapheme_adapter 的临时 L→grapheme
 * 适配，见该文件头部说明）。RESERVED / G3_PAIRS 两项差分直接用各周的顶层常量，
 * 因为被点名的旧算法本来就是对着这两个常量写的。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { segmentWord, surfaceOf, graphemeLabel, soundType, normalizeIdList } = require('../../frontend/src/shared/graphemes');
const { collectWordConsumption } = require('../../tools/validation/word_consumers');
const { withGraphemeFallback } = require('../../tools/validation/sounds_grapheme_adapter');
const { loadData } = require('../../tools/validation/load_data');

const WEEKS = [1, 2, 3, 4].map(n => {
  const file = 'frontend/src/weeks/week0' + n + '.data.js';
  const raw = fs.readFileSync(path.resolve(__dirname, '..', '..', file), 'utf8');
  const box = loadData(raw, false);
  return { n, file, box, sounds: withGraphemeFallback(box.SOUNDS) };
});

let checked = 0; // 全局计数，跑完打印一下，防止某一周语料为空导致测试"假绿"（断言从没真正执行过）
function tally(n) { checked += n; }

// ============================================================================
// 差分 1 · 摆词比较
// 旧侧：games.js:483/491（G4 validate）、:673/691/766（G5 slots.join('')）"整词填槽"
//        逐字符相等；games.js:451/:710（G4/G5 retractSlot）与
//        check_data.js:138-142 canSpell 的"字符多重集消耗"。
// 新侧：ID 数组逐项相等；rack 多重集消耗改按字位 ID（rack 当前仍是旧格式字符串，
//        用 graphemes.js 已导出的 normalizeIdList 按§3.5 契约展开成 ID 数组，
//        这正是它在第 4b/7 步接线时会被消费者调用的方式，这里只读不改）。
// ============================================================================
function canSpellOldChars(word, rackString) {
  // 照抄 tools/validation/check_data.js:138-142
  const pool = rackString.split('');
  for (const c of word) {
    const i = pool.indexOf(c);
    if (i < 0) return false;
    pool.splice(i, 1);
  }
  return true;
}
function canSpellNewIds(targetIds, rackIds) {
  const pool = rackIds.slice();
  for (const id of targetIds) {
    const i = pool.indexOf(id);
    if (i < 0) return false;
    pool.splice(i, 1);
  }
  return true;
}
function diffSpellingComparison() {
  let n = 0;
  for (const { box, sounds } of WEEKS) {
    const corpusWords = new Set(collectWordConsumption(box).map(r => r.word.toLowerCase()));
    const rackG4Ids = normalizeIdList(box.META.rackG4); // 旧格式字符串 -> 逐字符展开，当前数据下 = split('')
    const rackG5Ids = normalizeIdList(box.META.rackG5);
    for (const word of corpusWords) {
      let targetIds;
      try { targetIds = segmentWord(word, sounds); } catch (e) { continue; } // 未知字位跳过，不是本项差分要测的东西
      // -- canSpell 差分（rack 多重集消耗）--
      for (const [rackString, rackIds] of [[box.META.rackG4, rackG4Ids], [box.META.rackG5, rackG5Ids]]) {
        const oldResult = canSpellOldChars(word, rackString);
        const newResult = canSpellNewIds(targetIds, rackIds);
        assert.equal(oldResult, newResult, `W${box.META.week} canSpell 差分不一致："${word}" old=${oldResult} new=${newResult}`);
        n++;
      }
      // -- "整词填槽后比较" 差分（games.js:483/491 G4、:673/691/766 G5 的
      //    slots.join('')===word 形状）：用同一个排列分别在字符串侧与 ID 侧独立重建
      //    "填槽尝试"，再各自与自己的权威值比较——不是互相复用同一个数组引用比自己，
      //    这样 graphemeLabel 查表或 ID 数组比较任一侧写错都会被抓到。
      //    正确顺序（恒等置换）与反转顺序（词长 > 1 时，一个必然错的摆法）各测一次。
      const permutations = [targetIds.map((_, i) => i)];
      if (targetIds.length > 1) permutations.push(targetIds.map((_, i, arr) => arr.length - 1 - i));
      for (const perm of permutations) {
        const attemptChars = perm.map(i => graphemeLabel(targetIds[i], sounds));
        const attemptIds = perm.map(i => targetIds[i]);
        const oldMatch = attemptChars.join('') === word;
        const newMatch = attemptIds.length === targetIds.length && attemptIds.every((id, i) => id === targetIds[i]);
        assert.equal(oldMatch, newMatch, `W${box.META.week} "${word}" 填槽比较两侧判定不一致：old=${oldMatch} new=${newMatch}`);
        n++;
      }
    }
  }
  assert(n > 50, `差分 1 语料太少（仅 ${n} 次比较），怀疑抽取器没吃到真实数据`);
  tally(n);
  console.log(`PASS diff1 摆词比较：canSpell（rackG4/rackG5）+ 整词填槽比较，共 ${n} 次比较`);
}

// ============================================================================
// 差分 2 · 首字位
// 旧侧：games.js:851/:915 current.charAt(0)（G1 听音找首字母揭示判定）、
//        check_data.js:60 w[0]（初始声母白名单校验）、
//        render-blocks.js:169 charAt(0) 与 :164 from.slice(1) 成对（wordforge swap
//        的"头"与"尾巴"拆分）。
// 新侧：segmentWord(word)[0] 的 grapheme 作首字位；surfaceOf(ids.slice(1)) 作"尾巴"。
// ============================================================================
function diffFirstGrapheme() {
  let n = 0;
  for (const { box, sounds } of WEEKS) {
    const corpusWords = new Set(collectWordConsumption(box).map(r => r.word.toLowerCase()));
    for (const word of corpusWords) {
      let ids;
      try { ids = segmentWord(word, sounds); } catch (e) { continue; }
      // -- charAt(0) / w[0] 首字符 vs 首字位 grapheme --
      const oldFirst = word.charAt(0);
      const newFirst = graphemeLabel(ids[0], sounds).toLowerCase();
      assert.equal(oldFirst, newFirst, `W${box.META.week} "${word}" 首字符 "${oldFirst}" 与首字位 grapheme "${newFirst}" 不一致`);
      // -- render-blocks.js:164 from.slice(1) 与 "去掉首字位后的表面串" --
      const oldTail = word.slice(1);
      const newTail = surfaceOf(ids.slice(1), sounds);
      assert.equal(oldTail, newTail, `W${box.META.week} "${word}" 旧侧 slice(1) "${oldTail}" 与新侧 surfaceOf(去首位) "${newTail}" 不一致`);
      n += 2;
    }
    // -- letters.includes(w[0]) 白名单查询（check_data.js:60）在真实 initialpick 块上差分 --
    for (const day of box.DAYS) {
      for (const step of day.steps) {
        for (const b of step.blocks) {
          if (b.b !== 'initialpick') continue;
          const letterIds = normalizeIdList(b.letters); // letters 现状已经是 ID 数组（单字符），双读透传
          for (const word of b.words) {
            let ids;
            try { ids = segmentWord(word, sounds); } catch (e) { continue; }
            const oldIncludes = b.letters.includes(word[0]);
            const newIncludes = letterIds.includes(ids[0]);
            assert.equal(oldIncludes, newIncludes, `W${box.META.week} initialpick "${word}" letters.includes 差分不一致`);
            n++;
          }
        }
      }
    }
  }
  assert(n > 50, `差分 2 语料太少（仅 ${n} 次比较）`);
  tally(n);
  console.log(`PASS diff2 首字位：charAt(0)/w[0] + slice(1)/surfaceOf + initialpick letters.includes，共 ${n} 次比较`);
}

// ============================================================================
// 差分 3 · 字位数
// 旧侧：check_data.js:127 RESERVED.every(w => w.length === 3)（字符长度）；
//        assessment_contract.js:23 的 /^[^aeiou][aeiou][^aeiou]$/ CVC 正则（字符级）。
// 新侧：segmentWord(word).length === 3（字位数）；soundType 三态序列 c/v/c。
// week1 按 check_data.js:127 的 `META.week === 1 || …` 整体豁免，两侧一致地跳过。
// ============================================================================
function diffGraphemeCount() {
  let n = 0;
  const VOWELS_FALLBACK = 'aeiou'; // 仅用于旧侧 CVC 正则本身（不依赖 SOUNDS.type，照抄原正则）
  for (const { box, sounds } of WEEKS) {
    if (box.META.week === 1) continue; // 两侧一致地跳过：这正是"差分"要如实反映的现状豁免
    for (const word of box.RESERVED) {
      const oldLen3 = word.length === 3;
      let ids;
      try { ids = segmentWord(word, sounds); } catch (e) { ids = null; }
      const newLen3 = !!ids && ids.length === 3;
      assert.equal(oldLen3, newLen3, `W${box.META.week} RESERVED "${word}" 字符长度===3 与字位数===3 不一致`);
      n++;

      const normalized = word.toLowerCase();
      const oldCVC = /^[^aeiou][aeiou][^aeiou]$/.test(normalized);
      let newCVC = false;
      if (ids && ids.length === 3) {
        try {
          newCVC = soundType(ids[0], sounds) === 'c' && soundType(ids[1], sounds) === 'v' && soundType(ids[2], sounds) === 'c';
        } catch (e) { newCVC = false; }
      }
      assert.equal(oldCVC, newCVC, `W${box.META.week} RESERVED "${word}" 字符级 CVC 正则与字位 type 序列 c/v/c 不一致`);
      n++;
    }
  }
  assert(n > 15, `差分 3 语料太少（仅 ${n} 次比较）`);
  tally(n);
  console.log(`PASS diff3 字位数：RESERVED 长度===3 与 CVC 正则 vs 字位数与 type 三态序列，共 ${n} 次比较（W1 按现状豁免两侧一致跳过）`);
}

// ============================================================================
// 差分 4 · 陌生度 / 已教范围
// 旧侧：check_data.js:133 [...w.toLowerCase()] 逐字符成员检查；
//        assessment_contract.js:23/:57 的 [...normalize(w)].some(c=>!taught.has(c))。
// 新侧：segmentWord(word) 的 ID 数组逐项成员检查；解析不出来（segment-unknown）
//        视为"含未教内容"（与旧侧"字符不在 TAUGHT 集合里"同一结论：都读不出来）。
// ============================================================================
function diffTaughtRange() {
  let n = 0;
  for (const { box, sounds } of WEEKS) {
    const TAUGHT_CHARS = new Set(Object.keys(box.SOUNDS)); // 当前数据下字符集与 ID 集合重合
    const TAUGHT_IDS = new Set(Object.keys(box.SOUNDS));
    const corpusWords = new Set([...collectWordConsumption(box).map(r => r.word.toLowerCase()), ...box.RESERVED.map(w => w.toLowerCase())]);
    for (const word of corpusWords) {
      const oldUntaught = [...word.toLowerCase()].some(c => !TAUGHT_CHARS.has(c));
      let newUntaught;
      try {
        const ids = segmentWord(word, sounds);
        newUntaught = ids.some(id => !TAUGHT_IDS.has(id));
      } catch (e) {
        newUntaught = true; // 解析不出来 = 含未教内容，与旧侧字符不在已教集合里同一结论
      }
      assert.equal(oldUntaught, newUntaught, `W${box.META.week} "${word}" 已教范围判定不一致：old=${oldUntaught} new=${newUntaught}`);
      n++;
    }
  }
  assert(n > 50, `差分 4 语料太少（仅 ${n} 次比较）`);
  tally(n);
  console.log(`PASS diff4 陌生度/已教范围：字符级成员检查 vs 字位级成员检查（含解析失败=未教内容），共 ${n} 次比较`);
}

// ============================================================================
// 差分 5 · 最小对立
// 旧侧：check_data.js:172-173 a.length===b.length 且
//        [...a].filter((c,i)=>c!==b[i]).length===1（DATA-PAIR-01）。
// 新侧：segmentWord(a)/segmentWord(b) 的 ID 数组长度相等，且逐位不同数恰为 1。
// 语料：各周真实 G3_PAIRS（顶层常量，check_data.js:170-174 本来就是对着它验的）。
// ============================================================================
function diffMinimalPair() {
  let n = 0;
  for (const { box, sounds } of WEEKS) {
    for (const [a, b] of box.G3_PAIRS) {
      const oldEqualLen = a.length === b.length;
      const oldMinimal = oldEqualLen && [...a].filter((c, i) => c !== b[i]).length === 1;

      let idsA, idsB, newMinimal = false, newEqualLen = false;
      try {
        idsA = segmentWord(a, sounds);
        idsB = segmentWord(b, sounds);
        newEqualLen = idsA.length === idsB.length;
        newMinimal = newEqualLen && idsA.filter((id, i) => id !== idsB[i]).length === 1;
      } catch (e) { /* 解析失败：newMinimal 保持 false，与旧侧"长度不等就不是最小对立"同一保守方向 */ }

      assert.equal(oldEqualLen, newEqualLen, `W${box.META.week} G3_PAIRS [${a},${b}] 长度相等判定不一致`);
      assert.equal(oldMinimal, newMinimal, `W${box.META.week} G3_PAIRS [${a},${b}] 最小对立判定不一致：old=${oldMinimal} new=${newMinimal}`);
      n++;
    }
  }
  assert(n > 5, `差分 5 语料太少（仅 ${n} 次比较）`);
  tally(n);
  console.log(`PASS diff5 最小对立：G3_PAIRS 字符级 diff 计数 vs 字位级 diff 计数，共 ${n} 次比较`);
}

diffSpellingComparison();
diffFirstGrapheme();
diffGraphemeCount();
diffTaughtRange();
diffMinimalPair();

assert(checked > 200, `全部差分合计比较次数过少（${checked}），怀疑真实语料没有被正确加载`);
console.log(`PASS migration diff: 五项差分全部一致，合计 ${checked} 次比较，覆盖真实 W1–W4`);
