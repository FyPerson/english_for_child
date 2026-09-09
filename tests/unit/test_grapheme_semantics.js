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
 */
const assert = require('node:assert/strict');
const { segmentWord, surfaceOf, graphemeLabel } = require('../../frontend/src/shared/graphemes');

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
