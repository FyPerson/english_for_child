/* 里程碑 2：迁移后语义测试（方案 §3.9，2026-09-09 用户拍板·原 P7 拆两套的第二套）。
 *
 * 与 tests/unit/test_migration_diff.js 的分工（方案 §3.9 表格）：
 *   - test_migration_diff.js = **迁移前兼容差分**：判据是"字符级结果 == 字位级结果"，
 *     只用单字母基线语料，第 7 步前必须全绿，第 7 步后仍对单字母词保持全绿。
 *   - 本文件 = **迁移后语义测试**：判据是**明确的预期差异**逐项断言，不要求两侧相等——
 *     双字母词上"字符级 == 字位级"反而是错的（`rain` 的字符级"4 个字母"与字位级
 *     "3 个字位"本就该不同）。
 *
 * 本文件用**合成 SOUNDS**（不依赖任何真实周数据；第 7 步真实数据迁移完成前，
 * 四周真实数据仍是纯单字母，无法验证这些差异是否真的发生），含 `ai` 这个双字母字位
 * 与它的组成字母 `a`/`i` 并存，逐项证明方案指定的四类预期差异**确实发生**：
 *   1. `rain` 在字位级是 3 个字位而不是 4 个字符
 *   2. 首字位：`aid` 的第一个字位是 `ai` 不是 `a`；去掉首字位后是 `d` 不是 `id`
 *   3. 已教字位集合：字符级认为 `rain` 含 4 个"已教字符"，字位级是 3 个"已教字位"
 *   4. 最小对立：字位级的最小对立对与字符级不同（`rain`/`ran`：字符级因长度不等
 *      直接判"不是最小对立"，字位级因字位数相等、仅一处不同而判"是最小对立"）
 *
 * 断言要锁元素类型与配对关系，不锁瞬时状态（项目已有实证教训，
 * 见 memory/feedback_degrade_by_swapping_form.md）：下面每条"预期差异"都同时断言
 * 完整的 ID 数组（deepEqual）与差异发生的具体位置/取值，不只断言长度这类数字。
 *
 * explicitSegments（W[词].segments）路径覆盖：`rain`（r/a/i/n 与 ai 共存导致多解）与
 * `aid`（a/i/d 与 ai 共存导致多解）都必须靠显式 segments 消歧——先各自断言"不给
 * segments 会真的抛 segment-ambiguous"，再断言"给了正确 segments 才能拿到预期结果"，
 * 这正是 P3 指出的机制：多解且缺 segments 时校验器必须失败。
 *
 * ⚠️ 分辨力证明（"改坏副本"办法，方案 §3.9 补的已知缺口）：本文件的分辨力已用一份
 * 故意改坏的 graphemes.js 副本验证过（segmentWord 退化成逐字符切分后，本文件的
 * assertion 1/2/3/4 全部转红）——过程与结果见本次任务收口报告，验证用的临时副本已
 * 删除，不在仓库里留痕。
 *
 * ⚠️（M5，2026-09-09 里程碑 2 收口批）本文件证明的范围与不证明的范围要分清楚：
 *   - **证明的**：字位级实现（frontend/src/shared/graphemes.js 的 segmentWord/
 *     surfaceOf/graphemeLabel 等公开导出）在合成语料上按预期动作——即"新实现自己是
 *     否内部一致、行为是否符合方案 §3.9 规定的四类差异"。
 *   - **不证明的**：不证明"被替换掉的那一行生产算法（games.js/check_data.js/
 *     render-blocks.js 里被点名的旧字符级逻辑）在同一批词上确实会给出不同结果"——
 *     那是 tests/unit/test_migration_diff.js（迁移前兼容差分）的职责，它直接照抄
 *     生产代码里被点名的那一行作为"旧侧"，与本文件的合成对照组不是同一套可信度。
 *   本文件字符级一侧全是当场写的 `'rain'.length` / `[...'rain']` / `'aid'.slice(1)`
 *   这类就地手写的字符级参照，不是照抄生产代码；虽然四类差异断言本身确实锁住了
 *   元素与位置（不是松断言），但"这就是生产代码会给出的旧结果"这件事，靠的是
 *   test_migration_diff.js 而不是本文件——两套测试合起来才构成完整证明链，不能
 *   把本文件单独当作"新旧算法确实不同"的证据。
 *
 * ⚠️（H-3，2026-09-09 里程碑 2 收口批）覆盖缺口——本文件前半段只用合成语料（不消费
 * 任何真实 frontend/src/weeks/week0N.data.js）。真实周数据里显式声明 `segments` 的词、
 * 真实消费者输入是否真的按这套新语义运作，前半段完全不覆盖；test_migration_diff.js
 * 同样不覆盖（它排除全部多字母词）。
 *
 * 2026-09-09 里程碑 2 第 7 步：文末 `realWeekDataSemanticsSuite()`（原
 * `TODO_realWeekDataSemanticsSuite` 占位）已实作并在文件末尾调用。**当前语料仍为空**：
 * 本步向 SOUNDS 迁入的四个字段只是形态变化（字符串→数组），开工前的字位表扩充分析
 * 已证明未引入任何新的多字母字位 ID——四周真实数据仍全部是单字母字位，没有任何词的
 * `W[word].segments` 会含多字母字位。该函数因此显式打印这一点并跳过（不是悄悄断言
 * "0 个词全部通过"），判据清单原样保留，供未来某个真正教多字母字位的周（W5 起）
 * 声明多字母 `segments` 后自动激活。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { segmentWord, surfaceOf, graphemeLabel } = require('../../frontend/src/shared/graphemes');
const { loadData } = require('../../tools/validation/load_data');

const ROOT = path.resolve(__dirname, '..', '..');

function assertThrows(fn, check, label) {
  let caught = null;
  try { fn(); } catch (e) { caught = e; }
  assert(caught, label + ': expected to throw, did not');
  if (check) check(caught);
  return caught;
}

// ---- 合成字位表：r/a/i/n/d 单字母字位 与 双字母字位 ai 共存 ----
// （对照 tests/unit/test_graphemes.js 的 RAIN_TABLE：那里只放 r/ai/n 三个 ID，专门
//  验证"rain -> r/ai/n"这一条正例；这里刻意把组成字母 a/i 也放进同一张表，
//  是为了让 rain/aid 真的产生"字符级路径 vs 字位级路径"两种完整解——正是方案 §3.9
//  说的"含 ai 这类双字母字位与它的组成字母 a/i 并存"的合成语料。）
const SOUNDS = {
  r: { grapheme: 'r', type: 'c' },
  a: { grapheme: 'a', type: 'v' },
  i: { grapheme: 'i', type: 'v' },
  n: { grapheme: 'n', type: 'c' },
  d: { grapheme: 'd', type: 'c' },
  ai: { grapheme: 'ai', type: 'v' }
};

// ============================================================================
// 前置：rain / aid 在这张表下都必须是多解——不给 explicitSegments 时 segmentWord
// 必须抛 segment-ambiguous（P3 讲的机制：多解且缺 segments，校验器必须失败）。
// ============================================================================
assertThrows(() => segmentWord('rain', SOUNDS), e => assert.equal(e.code, 'segment-ambiguous'),
  '前置：rain 在 r/a/i/n 与 ai 共存的表里若不给 explicitSegments 必须抛歧义错误');
assertThrows(() => segmentWord('aid', SOUNDS), e => assert.equal(e.code, 'segment-ambiguous'),
  '前置：aid 在 a/i/d 与 ai 共存的表里若不给 explicitSegments 必须抛歧义错误');
console.log('PASS grapheme semantics 前置：rain / aid 均需 explicitSegments 消歧（无 segments 时确实抛歧义）');

// ============================================================================
// 预期差异 1：rain 在字位级是 3 个字位，不是 4 个字符。
// ============================================================================
const rainIds = segmentWord('rain', SOUNDS, ['r', 'ai', 'n']);
assert.deepEqual(rainIds, ['r', 'ai', 'n'], '预期差异①：rain 的字位 ID 序列锁定为 [r, ai, n]（配对关系，不只锁长度）');
assert.equal(rainIds.length, 3, '预期差异①：rain 字位级长度 === 3');
assert.equal('rain'.length, 4, '预期差异①：rain 字符级长度 === 4（对照组，同一个词两套判据给出不同数字）');
assert.notEqual(rainIds.length, 'rain'.length, '预期差异①：字位数（3）与字符数（4）确实不同，双字母词上"两侧相等"反而是错的');
assert.equal(graphemeLabel(rainIds[1], SOUNDS), 'ai', '预期差异①辅助：rain 第二个字位的显示字形是 "ai"，一块积木不是一个字母');
assert.equal(surfaceOf(rainIds, SOUNDS), 'rain', '预期差异①辅助：三个字位拼回的表面串仍等于 rain');
console.log('PASS grapheme semantics ①：rain 字位级 3 个字位（非 4 个字符），ID 序列与显示字形均锁定');

// ============================================================================
// 预期差异 2：首字位——aid 的第一个字位是 "ai" 不是 "a"；去掉首字位后是 "d" 不是 "id"。
// ============================================================================
const aidIds = segmentWord('aid', SOUNDS, ['ai', 'd']);
assert.deepEqual(aidIds, ['ai', 'd'], '预期差异②：aid 的字位 ID 序列锁定为 [ai, d]');
assert.equal(aidIds[0], 'ai', '预期差异②：aid 第一个字位 ID 是 "ai"，不是 "a"');
assert.notEqual(aidIds[0], 'a', '预期差异②：显式排除误判成 "a" 的可能');
assert.equal(graphemeLabel(aidIds[0], SOUNDS), 'ai', '预期差异②：首字位的显示字形是 "ai"（不是 "a"）');
const aidTail = surfaceOf(aidIds.slice(1), SOUNDS);
assert.equal(aidTail, 'd', '预期差异②：去掉首字位后的表面串是 "d"（字位级），不是字符级 slice(1) 会给出的 "id"');
assert.equal('aid'.slice(1), 'id', '预期差异②辅助（对照组）：字符级 word.slice(1) 给出的是 "id"');
assert.notEqual(aidTail, 'aid'.slice(1), '预期差异②：字位级"去掉首字位"（d）与字符级 slice(1)（id）确实不同');
console.log('PASS grapheme semantics ②：aid 首字位是 ai 不是 a；去掉首字位后是 d 不是 id');

// ============================================================================
// 预期差异 3：已教字位集合——字符级会认为 rain 含 4 个"已教字符"，
// 字位级是 3 个"已教字位"。
// （对照 check_data.js:133 `[...w.toLowerCase()]` 这类字符级已教范围判定的口径：
//  逐字符查表；字位级改成逐 ID 查表。）
// ============================================================================
const TAUGHT_CHARS = new Set(Object.keys(SOUNDS).filter(id => SOUNDS[id].grapheme.length === 1)); // 单字符 ID 的字面量恰好等于"已教字符"
const TAUGHT_IDS = new Set(Object.keys(SOUNDS));
const rainChars = [...'rain'];
assert.deepEqual(rainChars, ['r', 'a', 'i', 'n'], '预期差异③：rain 的字符序列锁定为 [r,a,i,n]');
const taughtCharsInRain = rainChars.filter(c => TAUGHT_CHARS.has(c));
assert.deepEqual(taughtCharsInRain, ['r', 'a', 'i', 'n'], '预期差异③：字符级判定下，rain 的 4 个字符全部"已教"（配对关系：哪几个字符，不只数量）');
assert.equal(taughtCharsInRain.length, 4, '预期差异③：字符级"已教字符"计数 === 4');
const taughtIdsInRain = rainIds.filter(id => TAUGHT_IDS.has(id));
assert.deepEqual(taughtIdsInRain, ['r', 'ai', 'n'], '预期差异③：字位级判定下，rain 的 3 个字位全部"已教"（配对关系：哪几个字位，不只数量）');
assert.equal(taughtIdsInRain.length, 3, '预期差异③：字位级"已教字位"计数 === 3');
assert.notEqual(taughtCharsInRain.length, taughtIdsInRain.length, '预期差异③：字符级已教计数（4）与字位级已教计数（3）确实不同');
console.log('PASS grapheme semantics ③：rain 字符级"已教字符"4 个 vs 字位级"已教字位"3 个，两套集合内容均已锁定');

// ============================================================================
// 预期差异 4：最小对立——字位级的最小对立对与字符级不同。
// rain（字符级 4 字符）/ ran（字符级 3 字符）：
//   字符级：长度不等，直接判定"不是最小对立"。
//   字位级：rain = [r,ai,n]（3 字位），ran = [r,a,n]（3 字位，无歧义、唯一解），
//           字位数相等，且仅第 2 位不同（ai vs a），字位级判定"是最小对立"。
// ============================================================================
const ranIds = segmentWord('ran', SOUNDS); // 唯一解，不需要 explicitSegments：ra/an 都不是合法字位
assert.deepEqual(ranIds, ['r', 'a', 'n'], '预期差异④：ran 唯一解锁定为 [r, a, n]');

const oldEqualLen = 'rain'.length === 'ran'.length;
const oldMinimal = oldEqualLen && [...'rain'].filter((c, i) => c !== 'ran'[i]).length === 1;
assert.equal(oldEqualLen, false, '预期差异④（字符级）：rain（4 字符）与 ran（3 字符）长度不相等');
assert.equal(oldMinimal, false, '预期差异④（字符级）：因长度不等，字符级判定"不是最小对立"');

const newEqualLen = rainIds.length === ranIds.length;
assert.equal(newEqualLen, true, '预期差异④（字位级）：rain（3 字位）与 ran（3 字位）字位数相等');
const diffIndexes = rainIds.map((id, i) => id === ranIds[i] ? -1 : i).filter(i => i >= 0);
assert.deepEqual(diffIndexes, [1], '预期差异④（字位级）：唯一的不同发生在索引 1（配对关系：不只数出有几处不同，还锁定是哪一处）');
assert.deepEqual([rainIds[1], ranIds[1]], ['ai', 'a'], '预期差异④（字位级）：该处两侧的字位 ID 分别是 "ai" 与 "a"');
const newMinimal = newEqualLen && diffIndexes.length === 1;
assert.equal(newMinimal, true, '预期差异④（字位级）：字位数相等且仅一处不同，字位级判定"是最小对立"');

assert.notEqual(oldMinimal, newMinimal, '预期差异④：rain/ran 这一对，字符级判定（不是最小对立）与字位级判定（是最小对立）确实不同');
console.log('PASS grapheme semantics ④：rain/ran 字符级"不是最小对立" vs 字位级"是最小对立"，差异位置与取值均已锁定');

console.log('PASS grapheme semantics: 四类预期差异（字位数/首字位/已教集合/最小对立）全部按明确断言验证发生，且均经 explicitSegments 路径消歧');

// ============================================================================
// H-3（2026-09-09 里程碑 2 收口批）：真实周数据语义套件接入点占位。
// 本批只做两件事之一（另一件是上面的头注释）：预留接入点，不实作——第 7 步把双字母
// 字位真的迁进 frontend/src/weeks/week0N.data.js 之前，没有真实语料可用，写了也是
// 对着空集合断言，没有验证力。
//
// 第 7 步要在这里断言什么（判据）：
//   1. 枚举全部 4 周真实数据里声明了多字母 `segments` 的词（`box.W[word].segments`
//      存在且数组含至少一个 grapheme.length > 1 的字位 ID）——不能只挑几个手选例子，
//      必须是"枚举"，理由见 test_migration_diff.js 头注释与 feedback_dont_relist_
//      what_source_already_lists.md：源头（真实 W 声明）已经是权威清单，不能自己
//      再挑一份更窄的子集当作"有代表性"。
//   2. 对每个词，逐项断言：
//      - 分词结果：segmentWord(word, sounds, box.W[word].segments) 的 ID 数组
//        与声明的 segments 完全一致（deepEqual，不只对比长度）。
//      - 表面串：surfaceOf(ids, sounds) 应等于该词本身（规范化后）。
//      - 首字位：ids[0] 的 graphemeLabel 与"这个词真实的第一个书写单元"是否相符
//        （不是 word.charAt(0)——双字母首字位时两者本该不同，这正是差异①/②在
//        合成语料上已经证明过的形状，第 7 步要在真实词上重新证明一次）。
//      - 长度：ids.length（字位数）与 word.length（字符数）在含多字母字位的词上
//        应不相等（除非这个词恰好所有字位都单字母，那时才允许相等）。
//      - 相关消费者语义：games.js/render-blocks.js/check_data.js 等第 4b/7 步已接线
//        的消费点，对这批真实词的行为应与 test_migration_diff.js 的差分逻辑给出的
//        "新侧"结果一致（不是本文件重新发明一套判据，是复用差分测试已验证过的算法）。
//   3. 语料为空（当前 SOUNDS 均是单字母，没有任何词声明了多字母 segments）时，
//      这道套件本身应显式跳过并打印原因，不能悄悄"断言 0 个词全部通过"而误报绿色
//      （同 test_migration_diff.js 文件头 `assert(n > 50, ...)` 一类的"语料太少"
//      防御，第 7 步实作时补上）。
/* realWeekDataSemanticsSuite()：第 7 步实作（原 TODO_realWeekDataSemanticsSuite 占位）。
 *
 * 判据 1（枚举，不挑例子）：扫描全部 4 周真实 frontend/src/weeks/week0N.data.js 的
 * W[word].segments 声明，收集其中"含至少一个多字母字位（grapheme.length > 1）"的词——
 * 这是权威源头（真实 W 声明）本身给出的清单，不自己另挑一份子集（同头注释判据 1）。
 *
 * 判据 3（语料为空时的处置）：本步（第 7 步）迁的是四个字段的形态（字符串→数组），
 * 开工前的字位表扩充分析已证明本步不引入任何新的多字母字位 ID——四周 SOUNDS 仍全部
 * 是单字母字位（见本任务收口报告「开工前字位表扩充分析」一节的实测结论）。因此本步
 * 完成后，语料仍然为空（没有任何真实词的 W[word].segments 含多字母字位），这道套件
 * 必须显式跳过并打印原因，不能悄悄"断言 0 个词全部通过"而误报绿色——这正是判据 3
 * 明写的处置，也是"没有引入新字位就不会有新歧义"这条结论在测试层面的直接体现。
 * 语料非空的分支（判据 2 的四类逐项断言）保留实现，供未来某个双字母周（W5 起）真的
 * 声明了多字母 segments 时自动激活，不需要再回来改这个函数本身。 */
function collectMultiLetterWordsFromRealWeeks() {
  const multiLetterWords = [];
  for (let n = 1; n <= 4; n++) {
    const file = 'frontend/src/weeks/week0' + n + '.data.js';
    const raw = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const box = loadData(raw, false);
    const sounds = box.SOUNDS || {};
    Object.keys(box.W || {}).forEach(word => {
      const entry = box.W[word];
      if (!entry || !Array.isArray(entry.segments)) return;
      const hasMultiLetter = entry.segments.some(id => sounds[id] && String(sounds[id].grapheme).length > 1);
      if (hasMultiLetter) multiLetterWords.push({ week: n, file: file, word: word, segments: entry.segments, sounds: sounds });
    });
  }
  return multiLetterWords;
}

/* assertWordSemantics(entry)：判据 2 的四类逐项断言，抽成独立函数——既是
 * realWeekDataSemanticsSuite 语料非空分支真正调用的逻辑，也让下面的「分辨力验证」
 * 能够喂合成数据直接调用它，不必等真实数据出现多字母 segments 才能证明这套断言
 * 真的会因为坏数据而红（不是恒真式）。 */
function assertWordSemantics({ week, file, word, segments, sounds }) {
  const ids = segmentWord(word, sounds, segments);
  assert.deepEqual(ids, segments,
    `W${week}（${file}）"${word}"：segmentWord(word, sounds, W[word].segments) 应精确等于声明的 segments，实际：${JSON.stringify(ids)}`);

  const normalized = word.toLowerCase();
  assert.equal(surfaceOf(ids, sounds), normalized,
    `W${week}（${file}）"${word}"：surfaceOf(ids, sounds) 应等于该词本身（规范化后），实际：${surfaceOf(ids, sounds)}`);

  const firstLabel = graphemeLabel(ids[0], sounds);
  if (firstLabel.length > 1) {
    assert.notEqual(firstLabel.toLowerCase(), normalized.charAt(0),
      `W${week}（${file}）"${word}"：首字位是多字母字位时，graphemeLabel(ids[0]) 不应等于 word.charAt(0)` +
      `（这正是差异②在真实词上的重新证明：双字母首字位时两者本该不同）`);
  }

  const anyMultiLetter = ids.some(id => sounds[id].grapheme.length > 1);
  if (anyMultiLetter) {
    assert.notEqual(ids.length, word.length,
      `W${week}（${file}）"${word}"：含多字母字位时，字位数（${ids.length}）应不等于字符数（${word.length}）` +
      `（这正是差异①在真实词上的重新证明）`);
  }
}

/* 分辨力验证（"改坏副本"办法，同本文件头注释「分辨力证明」一节的既有做法）。
 *
 * ⚠️（HIGH-3，2026-09-10 里程碑 2 收口批预筛，第七次"测试看起来在验证 X、实际验证
 * Y"）改前这里只喂了一组"故意写错的 segments"（['r','ai']，缺 n），它的抛错来自
 * assertWordSemantics 第一行调用的 segmentWord 自己的一致性校验（错误码
 * explicit-segments-invalid）——那是 segmentWord 的契约，不是 assertWordSemantics
 * 那四条 assert 抓住的：四条 assert 一条都没被执行到，把它们全删掉这个验证照样通过。
 *
 * 逐条核实这四条断言能不能被"通过 segmentWord、却违反断言本身"的输入触发：
 *   1.（deepEqual(ids, segments)）segmentWord 的 explicitSegments 分支恒返回
 *      `explicitSegments.slice()`（graphemes.js validateExplicitSegments 最后一行）——
 *      只要没抛错，ids 必然与 segments 深度相等，不存在能让它独立落空的合法输入，
 *      这条断言钉的是 segmentWord 的契约，不是可被破坏的数据判据。
 *   3.（firstLabel.length>1 时不应等于 word.charAt(0)）多字符字符串与单字符字符串
 *      按 === 永远不相等，这条断言在类型层面必然成立，同样不存在能让它落空的输入
 *      ——但它此前在全仓库任何地方（合成语料与当前为空的真实语料）都没有被真正
 *      执行过一次，是死代码。
 *   4.（anyMultiLetter 时 ids.length !== word.length）只要参与拼接的每个 grapheme
 *      都至少 1 个字符（真实数据恒如此），出现一个 length>1 的字位就必然让拼接后
 *      的字符数多于字位数，同样不存在能让它落空的输入。
 *   2.（surfaceOf(ids,sounds) 应等于该词本身）是唯一一条能被独立触发的：segmentWord
 *      内部的一致性校验是大小写不敏感的（拼接结果 .toLowerCase() 后再比较），而
 *      assertWordSemantics 调 surfaceOf() 时不转小写——grapheme 带大写字母时，
 *      segmentWord 判定"一致"通过，surfaceOf 断言却会因为大小写不同而落空，这就是
 *      "通过 segmentWord 但违反某一条断言"的真实案例。
 *
 * 因此本函数做三件事：
 *   ① 正例：正确 segments（合成 rain）应无异常通过；顺带用首字位多字符的合成词
 *      aid 真正执行一次断言 3 的 firstLabel.length>1 分支——证明它不是死代码，
 *      即使按上面的分析它必然为真。
 *   ② 断言 2 的真红例：grapheme 带大写字母的合成字位表，证明这条断言确实有独立于
 *      segmentWord 的判定力，且抛错信息点名 surfaceOf（不是 segmentWord 的错误码）。
 *   ③ 保留原有"缺字位"用例，但改口为它验证的是 segmentWord 自己的前置契约
 *      （explicit-segments-invalid），不再声称这是 assertWordSemantics 的分辨力。 */
function verifyAssertWordSemanticsHasDiscriminatingPower() {
  const sounds = { r: { grapheme: 'r', type: 'c' }, ai: { grapheme: 'ai', type: 'v' }, n: { grapheme: 'n', type: 'c' } };

  // ① 正例：正确 segments 应无异常通过。
  assertWordSemantics({ week: 0, file: '(synthetic)', word: 'rain', segments: ['r', 'ai', 'n'], sounds: sounds });

  // ①b：首字位多字符（断言 3 的 firstLabel.length>1 分支）——合成 aid/[ai,d]，此前
  // 无论合成语料还是真实语料（真实语料当前为空，见 realWeekDataSemanticsSuite 的
  // SKIP 分支）都没有任何输入让这个分支真正执行过。这里用能通过 segmentWord 的正确
  // 输入去跑它，证明它不是死代码（哪怕它必然为真，见函数头注释）。
  const aidSounds = { ai: { grapheme: 'ai', type: 'v' }, d: { grapheme: 'd', type: 'c' } };
  assertWordSemantics({ week: 0, file: '(synthetic)', word: 'aid', segments: ['ai', 'd'], sounds: aidSounds });

  // ② 断言 2 的真红例：grapheme 带大写字母（ID 本身仍合法小写），segmentWord 的
  // explicitSegments 一致性校验大小写不敏感、能通过；assertWordSemantics 里
  // surfaceOf(ids,sounds) 不转小写，应该因大小写不同而落空。
  const mixedCaseSounds = { r: { grapheme: 'r', type: 'c' }, ai: { grapheme: 'AI', type: 'v' }, n: { grapheme: 'n', type: 'c' } };
  let assertion2Caught = null;
  try {
    assertWordSemantics({ week: 0, file: '(synthetic)', word: 'rain', segments: ['r', 'ai', 'n'], sounds: mixedCaseSounds });
  } catch (e) { assertion2Caught = e; }
  assert(assertion2Caught,
    '分辨力验证：assertWordSemantics 断言 2（surfaceOf 应等于该词本身）在 grapheme 大小写不一致时应该抛错——' +
    'segmentWord 自己的一致性校验大小写不敏感、能通过，这里抛错必须来自 assertWordSemantics 自己的逻辑');
  assert(/surfaceOf/.test(assertion2Caught.message),
    `分辨力验证：断言 2 的抛错信息应点名 surfaceOf（证明红在预期的那一条断言），实际：${assertion2Caught.message}`);

  // ③ 前置契约用例（沿用改前的写法，但改口它验证的是什么）：拼接对不上词形的
  // segments，抛错发生在 assertWordSemantics 第一行调用 segmentWord 的那一刻，
  // assertWordSemantics 自己的四条 assert 一条都不会执行到。
  let segmentWordCaught = null;
  try {
    assertWordSemantics({ week: 0, file: '(synthetic)', word: 'rain', segments: ['r', 'ai'], sounds: sounds }); // 故意写错：缺 n，拼接对不上词形
  } catch (e) { segmentWordCaught = e; }
  assert(segmentWordCaught, '前置契约：拼接对不上词形的 segments 应该抛错（segmentWord 自己的 explicitSegments 一致性校验）');
  assert.equal(segmentWordCaught.code, 'explicit-segments-invalid',
    `前置契约：抛错应来自 segmentWord 的 explicit-segments-invalid（证明这是 segmentWord 的契约，不是 assertWordSemantics 那四条 assert 里的哪一条），实际错误码：${segmentWordCaught.code}`);

  console.log('PASS grapheme semantics 分辨力验证：① 正确 segments（合成 rain + 首字位多字符的 aid）无异常通过，' +
    '顺带执行了此前从未跑过的 firstLabel.length>1 分支（断言 3）；② 大小写不一致的合成字位表让 assertWordSemantics ' +
    '自己的 surfaceOf 断言（断言 2）真正落空，证明它独立于 segmentWord 有判定力；③ 拼接对不上词形的 segments 仍会' +
    '抛错，但明确这抛错来自 segmentWord 的前置契约，不是 assertWordSemantics 那四条 assert 的分辨力——断言 1/3/4 由 ' +
    'segmentWord 契约与字符串长度不等即不相等这两点保证恒真，不存在能让它们独立落空的合法输入（见函数头注释）');
}

/* realWeekDataSemanticsSuite()：第 7 步实作（原 TODO_realWeekDataSemanticsSuite 占位）。
 *
 * 判据 1（枚举，不挑例子）：扫描全部 4 周真实 frontend/src/weeks/week0N.data.js 的
 * W[word].segments 声明，收集其中"含至少一个多字母字位（grapheme.length > 1）"的词——
 * 这是权威源头（真实 W 声明）本身给出的清单，不自己另挑一份子集（同头注释判据 1）。
 *
 * 判据 3（语料为空时的处置）：本步（第 7 步）迁的是四个字段的形态（字符串→数组），
 * 开工前的字位表扩充分析已证明本步不引入任何新的多字母字位 ID——四周 SOUNDS 仍全部
 * 是单字母字位（见本任务收口报告「开工前字位表扩充分析」一节的实测结论）。因此本步
 * 完成后，语料仍然为空（没有任何真实词的 W[word].segments 含多字母字位），这道套件
 * 必须显式跳过并打印原因，不能悄悄"断言 0 个词全部通过"而误报绿色——这正是判据 3
 * 明写的处置，也是"没有引入新字位就不会有新歧义"这条结论在测试层面的直接体现。
 * 语料非空的分支（判据 2 的四类逐项断言，见 assertWordSemantics）保留实现，供未来
 * 某个双字母周（W5 起）真的声明了多字母 segments 时自动激活，不需要再回来改这个
 * 函数本身。 */
function realWeekDataSemanticsSuite() {
  verifyAssertWordSemanticsHasDiscriminatingPower();

  const multiLetterWords = collectMultiLetterWordsFromRealWeeks();
  if (multiLetterWords.length === 0) {
    console.log('SKIP grapheme semantics 真实周数据语义套件：四周真实数据（frontend/src/weeks/week01–04.data.js）' +
      '当前没有任何词在 W[word].segments 里声明含多字母字位——本步（第 7 步）只迁移四个字段的形态' +
      '（字符串→数组），开工前的字位表扩充分析已证明未引入任何新的多字母字位 ID，SOUNDS 仍全部是' +
      '单字母字位，语料因此为空。本条判据显式打印这一点并跳过，不悄悄断言"0 个词全部通过"（那会' +
      '误报绿色）。判据清单保留在本函数里，供未来某个真正教多字母字位的周（W5 起）声明多字母' +
      'segments 后自动激活，无需再改这个函数。');
    return;
  }

  // 语料非空分支：逐词枚举全部四类预期差异（判据 2），复用差分测试已验证过的字位级算法
  // （segmentWord/surfaceOf/graphemeLabel），不重新发明判据。
  multiLetterWords.forEach(assertWordSemantics);
  console.log(`PASS grapheme semantics 真实周数据语义套件：真实四周数据里 ${multiLetterWords.length} 个声明了多字母 segments 的词` +
    '（枚举，不是手选例子），逐项验证分词结果/表面串/首字位/长度不等四类预期差异均成立');
}
realWeekDataSemanticsSuite();
module.exports = { realWeekDataSemanticsSuite };
