/* 里程碑 2 第 3 步：五项差分测试（方案 §2.2 迁移矩阵五行 / §5「语义等价」行）。
 * ⚠️ **本文件是「迁移前兼容差分」**（方案 §3.9，2026-09-09 用户拍板·原 P7 拆两套的
 * 第一套）——**只用单字母基线**，判据仍是"两侧相等"。第 7 步把双字母字位迁进数据后，
 * `word.slice(1)`、字符长度、字符已教集合、字符最小对立四项会与字位级**合法地不同**，
 * 到那时"两侧相等"这条判据只对单字母词继续成立。**迁移后的语义测试**（新行为确实按
 * 预期发生了）在 tests/unit/test_grapheme_semantics.js，两个文件各管一段时间，
 * 分工表见 test_grapheme_semantics.js 头注释与方案 §3.9。
 *
 * **有效期**：第 7 步之前，本文件对全部语料全绿；第 7 步之后，仅对语料里**每个字位都是
 * 单字母**的词保持全绿——含双字母字位的词由下面的语料前置断言自动跳过并计数（见
 * `isSingleLetterSegmentation`），不会把"合法的新旧差异"误判成回归。**现有五项断言逻辑
 * 本身不改**，只是新增了这一层前置过滤。
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
// 只读取它已经导出的 tokens()（assessment_contract.js:2 的整句分词口径），不修改该文件，
// 用来把差分 4 的语料从"教学消费词"扩到"assessment_contract.js:57 真正处理的
// ASSESS_TEXT 分词结果"——这条语料此前完全没进过差分（coordinator H-2）。
const { tokens } = require('../../tools/validation/assessment_contract');

const WEEKS = [1, 2, 3, 4].map(n => {
  const file = 'frontend/src/weeks/week0' + n + '.data.js';
  const raw = fs.readFileSync(path.resolve(__dirname, '..', '..', file), 'utf8');
  const box = loadData(raw, false);
  return { n, file, box, sounds: withGraphemeFallback(box.SOUNDS) };
});

let checked = 0; // 全局计数，跑完打印一下，防止某一周语料为空导致测试"假绿"（断言从没真正执行过）
function tally(n) { checked += n; }

// 语料前置断言（方案 §3.9）：本文件只用单字母基线。isSingleLetterSegmentation 判定
// 一个词的字位级解析是否"每个字位的 grapheme 都恰好 1 个字符"——第 7 步前，四周真实
// 数据全是单字母字位，这条恒为 true，不改变任何现有断言的执行路径；第 7 步后一旦某个
// 字位表进了双字母字位（如 'ai'），含这类字位的词会被跳过并计数，而不是被强行拿字符级
// 算法与字位级算法比较后误报"回归"——那正是 §3.9 判 high 的问题：双字母词上两侧
// "合法地不同"，不该被这份"迁移前兼容差分"当反例抓住。
let skippedMultiLetter = 0;
function isSingleLetterSegmentation(ids, sounds) {
  return ids.every(id => sounds[id].grapheme.toLowerCase().length === 1);
}
function tallySkip() { skippedMultiLetter++; }

// ============================================================================
// 差分 1 · 摆词比较
// 旧侧：games.js:483/491（G4 validate）、:673/691/766（G5 slots.join('')）"整词填槽"
//        逐字符相等；check_data.js:138-142 canSpell 的"字符多重集消耗"。
//        （只实现了这两处——games.js:451/:710 的 retractSlot 单块撤回不是"比较"逻辑，
//        没有对应的新旧算法可差分，不在本项范围内，头注释不再声称覆盖它）
// 新侧：ID 数组逐项相等；rack 多重集消耗改按字位 ID（rack 当前仍是旧格式字符串，
//        用 graphemes.js 已导出的 normalizeIdList 按§3.5 契约展开成 ID 数组，
//        这正是它在第 4b/7 步接线时会被消费者调用的方式，这里只读不改）。
// ============================================================================
function canSpellOldChars(word, rackValue) {
  // 照抄 tools/validation/check_data.js:138-142——但那段代码写的时候 rack 还是字符串。
  // 「旧侧」的定义是"迁移前的算法"，它的入参形态本来就该是迁移前的字符串；第 7 步把
  // rackG4/rackG5 迁成 ID 数组后，本函数如果直接对数组调 .split('') 会 TypeError，而不是
  // 给出一个"旧侧的答案"用来跟新侧比较——那样整个差分测试就跑不起来，方案第 4b/7 步
  // 验收的"差分仍绿"/"差分与 ai fixture 均绿"都无法达成。所以这里先把输入防御性归一成
  // 字符串（数组则 join('')，得到迁移前那个等价的紧凑串），旧侧算法本身一个字都不改。
  const rackString = Array.isArray(rackValue) ? rackValue.join('') : rackValue;
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
    // box.META.rackG4/rackG5 目前仍是第 7 步迁移前的旧格式字符串（真实周数据尚未迁移），
    // 属"尚未迁移的旧格式数据"，按 normalizeIdList(value, {legacy}) 收口后的签名（2026-09-09
    // P4）显式传 {legacy:true}——不传会被新的 id-list-legacy-string-rejected 拒绝。
    const rackG4Ids = normalizeIdList(box.META.rackG4, { legacy: true }); // 逐字符展开，当前数据下 = split('')
    const rackG5Ids = normalizeIdList(box.META.rackG5, { legacy: true });
    for (const word of corpusWords) {
      let targetIds;
      try { targetIds = segmentWord(word, sounds); } catch (e) { continue; } // 未知字位跳过，不是本项差分要测的东西
      if (!isSingleLetterSegmentation(targetIds, sounds)) { tallySkip(); continue; } // §3.9 语料前置断言：本文件只用单字母基线
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

/* H-1 回归证明：构造一个 rackG4 为 ID 数组（第 7 步迁移后的形态）的合成场景，
 * 证明 canSpellOldChars 现在能吃数组输入而不是 TypeError，且结果与等价字符串一致。
 * 这不是"新旧两套实现的语义差分"（数组本来就不是旧侧的原生输入形态），而是防御性
 * 归一逻辑本身的正确性证明——单独一段，不计入 diff1 的 n 计数。 */
function regressionCanSpellOldCharsAcceptsArrayRack() {
  const arrayResult = canSpellOldChars('cat', ['c', 'a', 't', 'd']);
  const stringResult = canSpellOldChars('cat', 'catd');
  assert.equal(arrayResult, true, 'canSpellOldChars 应能处理数组形态的 rack（防御性归一为字符串）并给出正确结果');
  assert.equal(arrayResult, stringResult, '数组形态的 rack 与等价字符串形态的 rack 应给出相同结果');
  // 反例：数组里没有需要的字母，应该正确返回 false，而不是意外抛错或误判
  assert.equal(canSpellOldChars('cat', ['c', 'a']), false, '积木不够时应返回 false（数组输入下同样成立）');
  console.log('PASS diff1 回归（H-1）：canSpellOldChars 对 rackG4 数组形态防御性归一，不再 TypeError（第 7 步迁移后仍可用）');
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
      if (!isSingleLetterSegmentation(ids, sounds)) { tallySkip(); continue; } // §3.9 语料前置断言
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
          // b.letters（initialpick 块）现状已经是"已经是 ID 数组"的新格式（真实数据里
          // 就是字面量数组，如 letters:['s','t','p','n']，不是拼接字符串）——按
          // normalizeIdList(value, {legacy}) 收口后的判据不加 {legacy:true}：数组输入
          // 不受 legacy 影响，且不加 legacy 更安全——万一这个字段将来被误改成字符串，
          // 会被新签名的默认拒绝行为当场抓到，而不是被 legacy:true 悄悄展开成字符数组。
          const letterIds = normalizeIdList(b.letters);
          for (const word of b.words) {
            let ids;
            try { ids = segmentWord(word, sounds); } catch (e) { continue; }
            if (!isSingleLetterSegmentation(ids, sounds)) { tallySkip(); continue; } // §3.9 语料前置断言
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
// ⚠️ W1 不跳过（coordinator C-1 修复）：check_data.js:127 现状对 week===1 整体豁免
// "三字位"要求，但那是"现状校验器怎么放行"，不是"差分要不要测"——差分的职责恰恰是
// 揭示"字符长度===3"与"字位数===3"这两套判据在真实数据上是否一致，跳过 W1 会让
// week01.data.js 的 RESERVED 里 `spit`（4 个字母、但按单字母字位表也是 4 个字位，
// 二者仍然一致=false，不会导致断言失败）永远进不了这份差分证据，第 5 步据此判断
// "只用改 RESERVED 相关常量"时会漏看这条真正需要修的词。两侧算法照旧不变，
// 只是不再跳过这一周的语料。
// ============================================================================
function diffGraphemeCount() {
  let n = 0;
  for (const { box, sounds } of WEEKS) {
    for (const word of box.RESERVED) {
      let ids;
      try { ids = segmentWord(word, sounds); } catch (e) { ids = null; }
      if (ids && !isSingleLetterSegmentation(ids, sounds)) { tallySkip(); continue; } // §3.9 语料前置断言
      const oldLen3 = word.length === 3;
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
  console.log(`PASS diff3 字位数：RESERVED 长度===3 与 CVC 正则 vs 字位数与 type 三态序列，共 ${n} 次比较（含 W1，check_data.js:127 的整周豁免不影响两套判据本身是否一致）`);
}

// ============================================================================
// 差分 4 · 陌生度 / 已教范围
// 旧侧：check_data.js:133 [...w.toLowerCase()] 逐字符成员检查；
//        assessment_contract.js:23 的 [...normalize(w)].some(c=>!taught.has(c))；
//        assessment_contract.js:57 的
//        `for (const w of new Set(tokens(passage))) … [...w].some(c=>!taught.has(c))`
//        ——这一处的真实语料是 W4 的 ASSESS_TEXT 分词结果，不是 collectWordConsumption
//        收的教学消费词，之前完全没有语料覆盖到它（coordinator H-2），现在补上。
// 新侧：segmentWord(word) 的 ID 数组逐项成员检查；解析不出来（segment-unknown）
//        视为"含未教内容"（与旧侧"字符不在 TAUGHT 集合里"同一结论：都读不出来）。
// ============================================================================
function diffTaughtRange() {
  let n = 0;
  for (const { box, sounds } of WEEKS) {
    const TAUGHT_CHARS = new Set(Object.keys(box.SOUNDS)); // 当前数据下字符集与 ID 集合重合
    const TAUGHT_IDS = new Set(Object.keys(box.SOUNDS));
    const corpusWords = new Set([...collectWordConsumption(box).map(r => r.word.toLowerCase()), ...box.RESERVED.map(w => w.toLowerCase())]);
    // assessment_contract.js:57 的真实语料：ASSESS_TEXT 只有 W4 声明，其余周没有这个常量。
    if (typeof box.ASSESS_TEXT === 'string') {
      tokens(box.ASSESS_TEXT).forEach(w => corpusWords.add(w));
    }
    for (const word of corpusWords) {
      const oldUntaught = [...word.toLowerCase()].some(c => !TAUGHT_CHARS.has(c));
      let newUntaught;
      let ids = null;
      try {
        ids = segmentWord(word, sounds);
        newUntaught = ids.some(id => !TAUGHT_IDS.has(id));
      } catch (e) {
        newUntaught = true; // 解析不出来 = 含未教内容，与旧侧字符不在已教集合里同一结论
      }
      if (ids && !isSingleLetterSegmentation(ids, sounds)) { tallySkip(); continue; } // §3.9 语料前置断言
      assert.equal(oldUntaught, newUntaught, `W${box.META.week} "${word}" 已教范围判定不一致：old=${oldUntaught} new=${newUntaught}`);
      n++;
    }
  }
  assert(n > 50, `差分 4 语料太少（仅 ${n} 次比较）`);
  tally(n);
  console.log(`PASS diff4 陌生度/已教范围：字符级成员检查 vs 字位级成员检查（含解析失败=未教内容，含 W4 ASSESS_TEXT 分词语料），共 ${n} 次比较`);
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

      // §3.9 语料前置断言：两侧任一词含多字母字位就跳过这一对，不计入比较。
      if ((idsA && !isSingleLetterSegmentation(idsA, sounds)) || (idsB && !isSingleLetterSegmentation(idsB, sounds))) {
        tallySkip();
        continue;
      }

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
regressionCanSpellOldCharsAcceptsArrayRack();
diffFirstGrapheme();
diffGraphemeCount();
diffTaughtRange();
diffMinimalPair();

assert(checked > 200, `全部差分合计比较次数过少（${checked}），怀疑真实语料没有被正确加载`);

// 跳过数的自适应断言：光有 checked > 200 挡不住"前置断言判定写错、误跳掉一大批词"这种
// 退化——只要剩下的词还够 200 次比较，测试照样绿。所以再按数据现状卡一道：
// 先探测四周 SOUNDS 里到底有没有多字母字位；一个都没有（= 第 7 步尚未迁移）时，
// 合法的跳过数只能是 0，非零即判定逻辑有问题。第 7 步迁入双字母后本条自动放松，
// 不需要回来改测试。
const anyMultiLetterInData = WEEKS.some(({ sounds }) =>
  Object.keys(sounds).some(id => String(sounds[id].grapheme).length > 1)
);
if (!anyMultiLetterInData) {
  assert.equal(
    skippedMultiLetter, 0,
    `四周数据里没有任何多字母字位，跳过数本应为 0，实际跳过 ${skippedMultiLetter} 个词——` +
    `说明 isSingleLetterSegmentation 的判定逻辑有问题，正在静默削减语料`
  );
} else {
  // 已有多字母字位（第 7 步之后）：不能再要求跳过数为 0，但仍要保证没有把语料跳空。
  assert(checked > 200, `迁移后单字母子集的比较次数过少（${checked}），语料已被跳空`);
}
console.log(`PASS migration diff: 五项差分全部一致，合计 ${checked} 次比较，覆盖真实 W1–W4；语料前置断言跳过 ${skippedMultiLetter} 个含多字母字位的词（第 7 步前应为 0）`);
