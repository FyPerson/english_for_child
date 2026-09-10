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
 * `TODO_realWeekDataSemanticsSuite` 占位）已实作并在文件末尾调用。
 *
 * ⚠️（H2，外审 high，2026-09-10 修订）上一版实作只收"box.W[word] 已经声明了
 * segments"的词，若语料为空就整体 SKIP——这个判据本身有漏洞：W5 起若某个严格
 * 消费词因新教字位变多解、却漏写 segments，会被"只收已有 segments 的词"这行
 * 直接静默跳过，套件甚至可能一直保持"语料为空"的假象，不会因为漏写而报错。
 * 已改为对四周**全部严格消费词**（word_consumers.js 的共享抽取器，与差分测试
 * 同源）在完整 SOUNDS 下调用 segmentWord 四分类（唯一解/显式消歧解/零解/
 * 多解未消歧即 FAIL），套件恒执行、不再有"语料为空就整体跳过"的分支——详见
 * classifyStrictConsumptionWordsFromRealWeeks 与 realWeekDataSemanticsSuite。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { segmentWord, surfaceOf, graphemeLabel } = require('../../frontend/src/shared/graphemes');
const { loadData } = require('../../tools/validation/load_data');
const { collectWordConsumption, ENTRY_KINDS } = require('../../tools/validation/word_consumers');
const { withGraphemeFallback } = require('../../tools/validation/sounds_grapheme_adapter');

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
// 真实周数据语义套件（H2，外审 high，2026-09-10 重写；原 H-3/第 7 步的"枚举已声明
// segments 的词、语料为空则整体 SKIP"判据已作废——见下方函数头注释的完整说明）。
// ============================================================================
/* H2（外审 high，2026-09-10）：改前 collectMultiLetterWordsFromRealWeeks 只收
 * "box.W[word] 已经声明了 segments 数组"的词（`if (!entry || !Array.isArray(
 * entry.segments)) return;`）——W5 起若某个严格消费词因新教 `ai` 而变成多解、却
 * 漏写 segments，会被这行直接静默跳过，套件甚至可能语料为空（这批词从未出现在
 * "已有 segments"的集合里，永远进不了下面的枚举）。
 *
 * 改法：语料来源换成第 3 步已建的共享严格消费词抽取器
 * tools/validation/word_consumers.js（差分测试 tests/unit/test_migration_diff.js
 * 引用的同一个模块，见该文件头 import），对四周每个严格消费词在**完整 SOUNDS**下
 * 调 segmentWord(word, sounds, explicit)，按方案 §3.4/§3.9 四分类：
 *   - 唯一解（无需 explicit）→ 计入 executed。
 *   - segment-ambiguous 但 box.W[word].segments 有显式声明 → 交给
 *     assertWordSemantics 验证表面串还原与每个 ID 在 SOUNDS 里存在，计入 executed
 *     （resolved，非独占地额外记入 explicitResolvedWords 供报告可见性）。
 *   - segment-unknown（零解，真的含未教字位）→ **按记录来源精确豁免**（H1，外审
 *     high，2026-09-10）：改前无条件把全部 segment-unknown 归 skippedUnknown，
 *     严格消费来源（book-page/words/sentences/wordforge-* 等）里真出现零解也会
 *     被悄悄放过——那是数据错误（词形超纲或漏写 explicitSegments），不是"教学
 *     设计的正常产物"。改为只允许两类记录豁免，其余一律直接 FAIL（见
 *     isZeroSolutionExemptRecord 头注释）。
 *   - segment-ambiguous 且 box.W[word].segments 缺失 → **必须 FAIL**（方案 §3.4：
 *     多解且无 segments 即校验器必须失败，本套件与生产校验器同一口径）。
 * 按 §3.9「逐来源守恒」：每个 word_consumers 来源（kind）各自断言
 * executed + skippedUnknown === total，并核对来源集合与 ENTRY_KINDS 逐字相等
 * （防止抽取器整类漏收）。 */
/* classifyOneWordForSemantics(word, sounds, explicitSegments)：单词四分类的决策核心，
 * 抽成独立函数——既是 classifyStrictConsumptionWordsFromRealWeeks 真正调用的逻辑，
 * 也让下面的「分辨力验证」（verifyClassifyOneWordForSemanticsMustFailOnAmbiguity）
 * 能直接喂合成输入证明"多解且未声明 explicitSegments"分支真的会抛错，不必等真实
 * 数据出现这种情况才能验证它不是一段永远不会被触发的死代码。
 * 返回 {status: 'unique'|'zero'|'explicit', ids}；multi-without-explicit 直接抛错
 * （不是返回值，因为这是本函数唯一没有"正常结果"可返回的分支）。 */
function classifyOneWordForSemantics(word, sounds, explicitSegments) {
  try {
    const ids = segmentWord(word, sounds);
    return { status: 'unique', ids: ids };
  } catch (e) {
    if (e && e.code === 'segment-unknown') return { status: 'zero', ids: null };
    if (e && e.code === 'segment-ambiguous') {
      if (!explicitSegments) {
        const err = new Error(
          `H2：多解且未声明 explicit segments："${word}"——方案 §3.4 规定「多解且缺 segments ` +
          `即校验器必须失败」，本套件按同一口径判定为测试失败，不允许静默跳过`
        );
        err.code = 'segment-ambiguous-missing-segments';
        throw err;
      }
      return { status: 'explicit', ids: segmentWord(word, sounds, explicitSegments) };
    }
    throw e; // 其他任何错误码：不许吞，直接抛出
  }
}

/* 分辨力验证（"改坏副本"办法的合成语料版——真实四周数据当前不含任何歧义词，无法
 * 靠真实数据触发这个分支，只能用合成 SOUNDS 直接证明）。
 *
 * ① 正例：无歧义词（tan）应正常返回 unique。
 * ② 零解：含未教字位的词（zap，z 未在合成表里）应正常返回 zero，不抛错。
 * ③ 核心：多解（rain，r/a/i/n/ai 共存）且不传 explicitSegments，必须抛出
 *   segment-ambiguous-missing-segments——这正是 H2 要求的"多解且无 segments 即
 *   校验器必须失败"，证明该分支不是死代码。
 * ④ 反例：同样的多解词 rain，传入正确 explicitSegments 后应正常返回 explicit，
 *   ids 与传入的 segments 完全一致——证明"有 segments 就该正常放行"没有被
 *   ③ 的修复连带破坏。 */
function verifyClassifyOneWordForSemanticsMustFailOnAmbiguity() {
  const sounds = {
    r: { grapheme: 'r', type: 'c' }, a: { grapheme: 'a', type: 'v' },
    i: { grapheme: 'i', type: 'v' }, n: { grapheme: 'n', type: 'c' },
    t: { grapheme: 't', type: 'c' }, ai: { grapheme: 'ai', type: 'v' }
  };

  const uniqueResult = classifyOneWordForSemantics('tan', sounds, null);
  assert.equal(uniqueResult.status, 'unique');
  assert.deepEqual(uniqueResult.ids, ['t', 'a', 'n']);

  const zeroResult = classifyOneWordForSemantics('zap', sounds, null);
  assert.equal(zeroResult.status, 'zero', '含未教字位（z 不在合成表里）的词应归为 zero，不应抛错');
  assert.equal(zeroResult.ids, null);

  const caught = assertThrows(
    () => classifyOneWordForSemantics('rain', sounds, null),
    e => assert.equal(e.code, 'segment-ambiguous-missing-segments'),
    'H2 核心分支：多解（rain，r/a/i/n/ai 共存）且未传 explicitSegments 必须抛错'
  );
  assert(/rain/.test(caught.message), '抛错信息应点名具体的词');

  const explicitResult = classifyOneWordForSemantics('rain', sounds, ['r', 'ai', 'n']);
  assert.equal(explicitResult.status, 'explicit');
  assert.deepEqual(explicitResult.ids, ['r', 'ai', 'n'],
    '传入正确 explicitSegments 后应正常放行——证明 H2 的修复只堵住"缺 segments"这一种输入，不误伤"有 segments"的合法输入');

  console.log('PASS grapheme semantics H2 分辨力验证：classifyOneWordForSemantics 的 unique/zero 分支按预期返回，' +
    '"多解且未声明 explicitSegments"分支确实会抛出 segment-ambiguous-missing-segments（不是死代码），' +
    '传入正确 explicitSegments 后同一个多解词仍能正常放行');
}

/* isZeroSolutionExemptRecord(rec, cumulativeSightWords, normalizedWord) -> boolean
 * （H1 原版，外审 high，2026-09-10；H3 轮 D 复审再次修订，2026-09-10）：判定某条
 * word_consumers 记录的零解（segment-unknown）是否属于教学设计的正常产物、可以
 * 豁免，而不是数据缺陷。
 *
 * H3 指出 H1 版本两个方向都判宽/判窄了：
 *   ① 判宽——认读词豁免改前"按拼写、不管来源"：只要这个词本周（或调用方传入的
 *      任何一批）曾被声明为认读词，它在**任何** kind 的记录里零解都会被豁免，
 *      包括 wordforge-family/wordforge-swap/blend/initialpick/pair/flash/
 *      g3-pairs/g4-words/g5-whitelist/wall-hint 这类"字位操作类来源"——这些位置
 *      要求的是"能被当前字位表拆解/拼读"，跟"认读词允许整词记忆、不要求解码"是
 *      两件不同的事：认读词被拿去当换头造词的头/尾、或塞进积木白名单，零解仍然
 *      是数据缺陷（教学设计上不该把认读词塞进这些"要求可拼读"的位置）。改法：
 *      认读词豁免只对"阅读文本类来源"生效——`sight`（认读词声明本身）、
 *      `sentences`（整句朗读）、`book-page`（小书正文）——这三类是孩子"读一段
 *      连续文本时顺带认出已知词"的场景，其余 kind 一律不享有认读词豁免。
 *   ② 判窄——`sightWordsThisWeek` 只收当前处理的这一周自己的 `kind==='sight'`
 *      记录，历史周教过的认读词（比如 W1 教的 see）若出现在**后续周**的
 *      book-page/sentences 里，因为不在"当周"这个临时集合里，反而不被豁免，
 *      与①判宽的方向恰好相反地误判为数据缺陷。改法：调用方改传"累计认读词
 *      集合"（跨 W1..当前周），不是"仅本周"。
 *
 * kind === 'g1-rounds' 的豁免维持 H1 原判（与认读词豁免完全独立，见下方原注释）：
 * G1"声音抓抓乐"整场是听力辨音游戏，孩子只听不看不拼读，pos（目标音正例）与
 * neg（干扰词反例）两个桶都不要求可解码——实测 W1 真实数据：a 轮的 pos 桶
 * cat/hat/map/bat、s 轮的 pos 桶 sun/sock/snake 在 W1 字位表下同样是零解（本周
 * 只教 s a t i p n，这些词的其余字母都还没教），与 neg 桶（如 dog/bag/milk/
 * fish）是同一种"只听不判断拼写"的性质——不是只有 neg 桶才该豁免，W2+ 恰好
 * pos 桶词都可解码只是内容选取的巧合，不是规则要求。
 *
 * 其余组合（非阅读文本类来源的零解、或阅读文本类来源但词形本身根本不是认读词）
 * 一律不豁免——这些位置的词按数据设计恒由当周已教字位组成，零解就是数据错误
 * （词形超纲，或该给的 W[word].segments 没给）。 */
/* H1+H2 同根修复（轮 D 复审第三轮，外审 high，2026-09-10）：本文件原有的 G1 判据
 * （`rec.kind === 'g1-rounds'` 无条件豁免，不分桶不分周）与
 * tools/validation/check_data.js ③ 原有的 G1 判据（只精确处理 `bucket==='neg' ||
 * (week===1 && bucket==='pos')`，但另有一条独立的整词 SIGHT 跳过）各自只改对了
 * 一半、互相矛盾。两处已统一抽到共享模块 tools/validation/exemptions.js 的
 * `isExemptConsumptionRecord`，本文件不再维护本地判据，直接 require 共享实现。
 * `isZeroSolutionExemptRecord` 这个名字保留作薄包装（沿用本文件既有调用点的
 * 三/四参数调用习惯：`(rec, cumulativeSightWords, normalizedWord, week?)`），
 * 内部转调共享函数，不重新实现判据本体。 */
const { isExemptConsumptionRecord, SIGHT_EXEMPT_READING_KINDS } = require('../../tools/validation/exemptions');
function isZeroSolutionExemptRecord(rec, cumulativeSightWords, normalizedWord, week) {
  return isExemptConsumptionRecord(Object.assign({}, rec, { word: normalizedWord }), { cumulativeSightWords, week });
}

/* H1+H2 表驱动测试（轮 D 复审第三轮，外审 high，2026-09-10）：直接验证共享模块
 * `isExemptConsumptionRecord`（经 isZeroSolutionExemptRecord 薄包装）本身的判定
 * 力，不依赖真实周数据里恰好存在哪些零解词（真实数据会随内容变化，这里用构造
 * 的 rec 对象钉死判据本身）。覆盖任务点名的六种情形（W1 pos / W2 pos / 任意周
 * neg / 认读词在 book-page / 认读词在 wordforge-family / 认读词在 words），
 * G1 部分是本轮新增的核心修复点——改前本文件的 G1 判据不分桶不分周，与
 * check_data.js 早前已经修好的"仅 W1 pos 豁免"矛盾。 */
function verifyIsZeroSolutionExemptRecordDiscriminates() {
  const noSightWords = new Set();
  const withSee = new Set(['see']);

  const TABLE = [
    { label: 'W1 pos', rec: { kind: 'g1-rounds', bucket: 'pos' }, sight: noSightWords, word: 'cat', week: 1, expect: true },
    { label: 'W2 pos', rec: { kind: 'g1-rounds', bucket: 'pos' }, sight: noSightWords, word: 'cat', week: 2, expect: false },
    { label: '任意周 neg（W1）', rec: { kind: 'g1-rounds', bucket: 'neg' }, sight: noSightWords, word: 'dog', week: 1, expect: true },
    { label: '任意周 neg（W3）', rec: { kind: 'g1-rounds', bucket: 'neg' }, sight: noSightWords, word: 'dog', week: 3, expect: true },
    { label: '认读词在 book-page', rec: { kind: 'book-page' }, sight: withSee, word: 'see', week: 2, expect: true },
    { label: '认读词在 sentences', rec: { kind: 'sentences' }, sight: withSee, word: 'see', week: 2, expect: true },
    { label: '认读词在 sight 声明本身', rec: { kind: 'sight' }, sight: withSee, word: 'see', week: 1, expect: true },
    { label: '认读词在 wordforge-family', rec: { kind: 'wordforge-family' }, sight: withSee, word: 'see', week: 2, expect: false },
    { label: '认读词在 words', rec: { kind: 'words' }, sight: withSee, word: 'see', week: 2, expect: false },
    { label: '非认读词在 book-page', rec: { kind: 'book-page' }, sight: noSightWords, word: 'zzq', week: 2, expect: false },
  ];
  for (const t of TABLE) {
    assert.equal(isZeroSolutionExemptRecord(t.rec, t.sight, t.word, t.week), t.expect,
      `H1+H2 表驱动「${t.label}」：期望 ${t.expect}，实际相反（rec=${JSON.stringify(t.rec)}, week=${t.week}, word=${t.word}）`);
  }
  console.log(`PASS grapheme semantics H1+H2 表驱动（${TABLE.length} 例）：W1 pos 豁免 / W2 pos 不豁免 / 任意周 neg 豁免 / 认读词在阅读文本类来源豁免 / 认读词在字位操作类来源不豁免，全部与共享判据 isExemptConsumptionRecord 一致`);

  // 反例②（H3 新增，堵住"判宽"的方向）：即使词形是认读词，出现在**字位操作类
  // 来源**（wordforge-family/wordforge-swap/blend/initialpick/pair/flash/
  // g3-pairs/g4-words/g5-whitelist/wall-hint 等）时也不应豁免——这些位置要求
  // 词能被当前字位表拆解/拼读，认读词允许整词记忆、不代表允许出现在这类要求
  // 可拼读的位置却拼不出来。逐一核对 word_consumers.ENTRY_KINDS 里除
  // sight/sentences/book-page/g1-rounds 之外的全部 kind，防止只测了
  // wordforge-family 一个代表就当作"其余同理"。
  const nonReadingKinds = ['blend', 'initialpick', 'words', 'day-pair', 'flash',
    'wordforge-family', 'wordforge-swap', 'g3-pairs', 'g4-words', 'g5-whitelist', 'wall-hint'];
  for (const kind of nonReadingKinds) {
    assert.equal(isZeroSolutionExemptRecord({ kind: kind }, withSee, 'see'), false,
      `H3 反例：认读词 "see" 出现在字位操作类来源 "${kind}" 时不应豁免（哪怕它在别处是认读词）`);
  }
  assert.equal(isZeroSolutionExemptRecord({ kind: 'wordforge-family' }, noSightWords, 'zzq'), false,
    'H1 反例：wordforge-family 记录的零解（词不是认读词）不应豁免');

  console.log('PASS grapheme semantics H1/H3 分辨力验证：isZeroSolutionExemptRecord 对 G1 记录（pos/neg 皆豁免）、' +
    '认读词在阅读文本类来源（sight/sentences/book-page）里正确豁免、认读词出现在字位操作类来源（' +
    nonReadingKinds.length + ' 种逐一核对）时正确拒绝豁免、以及非认读词在阅读文本类来源里的零解仍不豁免，全部正确判定');
}

/* H3 新增两条集成测试（轮 D 复审，2026-09-10）：用与 classifyStrictConsumptionWordsFromRealWeeks
 * 同样的"累计认读词集合 + isZeroSolutionExemptRecord 逐条判定"流程，喂合成的两"周"
 * 数据（不读真实四周文件——真实数据当前没有触发这两条分支的场景，只能用合成语料
 * 直接证明）。合成字位表只含 's'（type:'c'），'see' 因此在任何一"周"都零解
 * （s 已教，e 未教），用来做零解载体。 */
/* M2（轮 D 复审第三轮，外审 medium，2026-09-10）：改前这里自建 cumulativeSightWords
 * 并重写了一份"按周顺序处理、累计认读词、逐条分类"的循环——与
 * classifyConsumptionRecordsForWeeks（生产路径真正的核心循环）各自独立维护，两份
 * 逻辑一旦分叉，这个测试验证的就不是真实生产路径。改法：喂合成两周数据直接走
 * classifyConsumptionRecordsForWeeks 这个真实入口，不在测试里复制循环。 */
function verifyCumulativeSightWordsAndReadingKindScope() {
  const sounds = { s: { grapheme: 's', type: 'c' } };

  // 场景①：同一"周"里，'see' 既被声明为 sight（本身豁免，符合预期），又被塞进
  // wordforge-family（字位操作类来源）——即便认读词集合已经包含 'see'，
  // wordforge-family 不在 SIGHT_EXEMPT_READING_KINDS 里，必须不豁免：走真实入口
  // classifyConsumptionRecordsForWeeks 应该直接抛出 zero-solution-not-exempt。
  {
    const weekSources = [{
      week: 1,
      records: [{ word: 'see', kind: 'sight' }, { word: 'see', kind: 'wordforge-family' }],
      sounds: sounds,
      wEntries: {},
      label: '合成场景①（同周 sight + wordforge-family）'
    }];
    const caught = assertThrows(
      () => classifyConsumptionRecordsForWeeks(weekSources),
      e => assert.equal(e.code, 'zero-solution-not-exempt'),
      'H3 集成①：认读词 see 同拼写出现在 wordforge-family 时，真实入口应该抛出 zero-solution-not-exempt（不能因为它在别处是认读词就放行）'
    );
    assert(/wordforge-family/.test(caught.message), `抛错信息应点名来源 wordforge-family，实际：${caught.message}`);
  }

  // 场景①b（入口级配对，2026-09-10）：与 tests/unit/test_check_data_g1_exemption_
  // granularity.py 的 test_sight_word_in_sight_and_words_block_unspellable_still_checked
  // 同一个场景（认读词同时在 sight 与 words 块、且不可分词），改用 kind='words'
  // 而不是 'wordforge-family'，证明两个入口（check_data.js 真实 CLI + 本语义
  // 套件）对同一场景给出一致的结论——words 同样是"字位操作类来源"，不在
  // SIGHT_EXEMPT_READING_KINDS 里，理应同样不豁免、同样抛错。
  {
    const weekSources = [{
      week: 1,
      records: [{ word: 'see', kind: 'sight' }, { word: 'see', kind: 'words' }],
      sounds: sounds,
      wEntries: {},
      label: '合成场景①b（同周 sight + words，与 check_data 入口级测试同一场景）'
    }];
    const caught = assertThrows(
      () => classifyConsumptionRecordsForWeeks(weekSources),
      e => assert.equal(e.code, 'zero-solution-not-exempt'),
      'H3 集成①b：认读词 see 同拼写出现在 words 块时，真实入口应该抛出 zero-solution-not-exempt——与 check_data.js 入口级测试（words 块场景）结论一致'
    );
    assert(/words/.test(caught.message), `抛错信息应点名来源 words，实际：${caught.message}`);
  }

  // 场景②：模拟两"周"顺序处理——第 1 周只有一条 sight 记录声明 'see'；第 2 周
  // （历史周之后）只有一条 book-page 记录引用 'see'，第 2 周自己完全没有声明过
  // 'see' 是 sight。走真实入口，证明第 2 周的 book-page 记录能正确读到第 1 周
  // 留下的累计认读词身份而被豁免——这是 H3 要修的"判窄"方向：改前的
  // sightWordsThisWeek 每周重新构造，历史周教过的认读词到了后续周会被误判为
  // 不豁免。不抛错即视为豁免生效，再核对 book-page 那条确实被计入 skippedUnknown
  // （零解但豁免），而不是被判定失败或误判成 executed。
  {
    const weekSources = [
      { week: 1, records: [{ word: 'see', kind: 'sight' }], sounds: sounds, wEntries: {}, label: '合成场景②·W1（sight 声明）' },
      { week: 2, records: [{ word: 'see', kind: 'book-page' }], sounds: sounds, wEntries: {}, label: '合成场景②·W2（book-page 引用）' }
    ];
    const result = classifyConsumptionRecordsForWeeks(weekSources);
    const bookPageStat = result.bySource.get('book-page');
    assert(bookPageStat, 'book-page 来源应该出现在统计里');
    assert.equal(bookPageStat.skippedUnknown, 1, 'H3 集成②：第 2 周 book-page 的 see 应被计入 skippedUnknown（零解但豁免），不是失败也不是 executed');
    assert.equal(bookPageStat.executed, 0, 'book-page 那条是零解豁免，不应计入 executed');
    const sightStat = result.bySource.get('sight');
    assert.equal(sightStat.skippedUnknown, 1, '第 1 周 sight 声明本身也是零解（e 未教），豁免生效');
  }

  console.log('PASS grapheme semantics H3 集成验证（M2 改走真实入口 classifyConsumptionRecordsForWeeks）：① 认读词同拼写出现在 wordforge-family 时真实入口直接抛 zero-solution-not-exempt；' +
    '② 第 1 周声明的认读词在第 2 周的 book-page 引用里正确沿用累计集合豁免（不受"仅本周"范围限制），且被正确计入 skippedUnknown');
}

/* classifyConsumptionRecordsForWeeks(weekSources) -> {bySource, zeroSolutionWords,
 * explicitResolvedWords, totalWords}（M2，轮 D 复审第三轮，外审 medium，
 * 2026-09-10）：真正的分类核心循环，从 classifyStrictConsumptionWordsFromRealWeeks
 * 里抽出来——改前 `verifyCumulativeSightWordsAndReadingKindScope` 自己又写了一份
 * "累计认读词集合 + 逐条分类判定"的循环去跑合成两周数据，与这里的生产循环各自
 * 独立维护，两份逻辑一旦分叉（比如这里改了累计集合的更新时机，那边没跟着改），
 * 测试验证的就不是真实生产路径，而是另一份平行实现。改法：把"喂周数据、按周
 * 顺序处理、维护累计认读词集合、逐条分类+豁免判定"这套核心逻辑抽成本函数，
 * 输入改为调用方注入的 `weekSources`（不在函数内部读文件），真实四周与合成
 * 周（测试用）都走这同一份实现。
 *
 * weekSources: 按周号升序排列的数组，每项 {week, records, sounds, wEntries, label}：
 *   - week: 周号（number），豁免判据里"仅 W1 pos 桶豁免"需要用到。
 *   - records: word_consumers.collectWordConsumption(box) 的输出（或等价合成记录，
 *     形如 [{word, kind, ...}]）。
 *   - sounds: 已经过 withGraphemeFallback 的 SOUNDS 表。
 *   - wEntries: 该周的词典（取 segments 用），形如 {word: {segments: [...]}}，可选，
 *     缺省当作 {}。
 *   - label: 失败信息里用来指代这一周的标签（真实周传 "file: <path>"，合成周传
 *     调用方自定义的字符串）。 */
function classifyConsumptionRecordsForWeeks(weekSources) {
  const bySource = new Map();
  const statFor = kind => {
    if (!bySource.has(kind)) bySource.set(kind, { total: 0, executed: 0, skippedUnknown: 0 });
    return bySource.get(kind);
  };
  const zeroSolutionWords = new Set();
  const explicitResolvedWords = [];
  // H3：累计集合，声明在周循环之外——认读词身份一旦在某一周被声明
  // （kind==='sight'），从那周起对后续所有周都持续有效（历史周教过的 see 出现在
  // 后续周的 book-page 里，应该仍然豁免），不是"只在教它的那一周内有效"。
  const cumulativeSightWords = new Set();

  for (const weekSource of weekSources) {
    const n = weekSource.week;
    const records = weekSource.records;
    const sounds = weekSource.sounds;
    const wEntries = weekSource.wEntries || {};
    const label = weekSource.label || `week ${n}`;
    records.filter(r => r.kind === 'sight').forEach(r => cumulativeSightWords.add(r.word.toLowerCase()));

    records.forEach(rec => {
      const word = rec.word.toLowerCase();
      const stat = statFor(rec.kind);
      stat.total++;
      const entry = wEntries[word];
      const explicitSegments = entry && Array.isArray(entry.segments) ? entry.segments : null;
      let result;
      try {
        result = classifyOneWordForSemantics(word, sounds, explicitSegments);
      } catch (e) {
        if (e && e.code === 'segment-ambiguous-missing-segments') {
          e.message = `week ${n}，来源 "${rec.kind}"，${label}：` + e.message;
        }
        throw e;
      }
      if (result.status === 'zero') {
        // H1+H2：豁免判据改传 week（G1 pos 桶仅第一周豁免需要它），不再是改前
        // 缺 week 参数、G1 判据不分桶不分周的旧行为。
        if (!isZeroSolutionExemptRecord(rec, cumulativeSightWords, word, n)) {
          const err = new Error(
            `H1：来源 "${rec.kind}" 的词 "${word}"（week ${n}，${label}）分词零解` +
            `（含未教字位）——这个来源不在豁免清单（阅读文本类来源的认读词/G1 neg 桶/仅第一周的 G1 pos 桶）里，零解是数据缺陷` +
            `（词形超纲，或漏写 W["${word}"].segments），不允许静默跳过`
          );
          err.code = 'zero-solution-not-exempt';
          throw err;
        }
        stat.skippedUnknown++; zeroSolutionWords.add(word); return;
      }
      if (result.status === 'explicit') {
        assertWordSemantics({ week: n, file: label, word: word, segments: explicitSegments, sounds: sounds });
        explicitResolvedWords.push({ week: n, word: word, kind: rec.kind });
      }
      stat.executed++;
    });
  }

  let totalWords = 0;
  for (const [, stat] of bySource) totalWords += stat.total;
  return { bySource: bySource, zeroSolutionWords: zeroSolutionWords, explicitResolvedWords: explicitResolvedWords, totalWords: totalWords };
}

function classifyStrictConsumptionWordsFromRealWeeks() {
  const weekSources = [];
  for (let n = 1; n <= 4; n++) {
    const file = 'frontend/src/weeks/week0' + n + '.data.js';
    const raw = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const box = loadData(raw, false);
    const sounds = withGraphemeFallback(box.SOUNDS);
    const records = collectWordConsumption(box); // 不去重：来源统计要按原始记录逐条计数（同 test_migration_diff.js tallySourceCoverage 的做法）
    weekSources.push({ week: n, records: records, sounds: sounds, wEntries: box.W || {}, label: 'file: ' + file });
  }
  const { bySource, zeroSolutionWords, explicitResolvedWords, totalWords } = classifyConsumptionRecordsForWeeks(weekSources);

  assert.deepEqual([...bySource.keys()].sort(), ENTRY_KINDS.slice().sort(),
    'H2：来源分布实际收到的 kind 集合应与 word_consumers.ENTRY_KINDS 逐字相等——' +
    '某个来源整类消失会让"executed+skippedUnknown===total"逐来源守恒抓不住（该来源根本不出现在统计里）');

  for (const [kind, stat] of bySource) {
    assert.equal(stat.executed + stat.skippedUnknown, stat.total,
      `H2：来源 "${kind}" 的 executed(${stat.executed}) + skippedUnknown(${stat.skippedUnknown}) 应等于 total(${stat.total})——` +
      '逐来源守恒，防止"抽取器少收一类"或"判定写错误跳一大批"被更宽松的总量阈值掩盖');
  }
  assert(totalWords > 50, `H2：真实四周严格消费词语料太少（仅 ${totalWords} 条），怀疑抽取器没吃到真实数据`);

  return { bySource: bySource, zeroSolutionWords: zeroSolutionWords, explicitResolvedWords: explicitResolvedWords, totalWords: totalWords };
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
  // 无论合成语料还是真实语料（真实语料当前 explicitResolvedWords 恒为空，见
  // classifyStrictConsumptionWordsFromRealWeeks：当前 SOUNDS 全是单字母，没有词会
  // 走到 segment-ambiguous 分支）都没有任何输入让这个分支真正执行过。这里用能通过
  // segmentWord 的正确输入去跑它，证明它不是死代码（哪怕它必然为真，见函数头注释）。
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

/* realWeekDataSemanticsSuite()：H2 重写（原 H-3/第 7 步"枚举已声明 segments 的词、
 * 语料为空则整体 SKIP"的判据已作废，完整理由见 classifyStrictConsumptionWordsFromRealWeeks
 * 头注释）。现在语料源是四周全部严格消费词（word_consumers 共享抽取器），套件恒执行，
 * 不再有"语料为空"这个分支。 */
function realWeekDataSemanticsSuite() {
  verifyAssertWordSemanticsHasDiscriminatingPower();
  verifyClassifyOneWordForSemanticsMustFailOnAmbiguity();
  verifyIsZeroSolutionExemptRecordDiscriminates();
  verifyCumulativeSightWordsAndReadingKindScope();

  // H2：不再按"语料是否含多字母字位"分 SKIP/执行两支——真实严格消费词语料
  // （word_consumers 的全部 15 个来源）恒非空，四分类（唯一解/显式消歧解/零解/
  // 多解未消歧即 FAIL）本身就是有效判据，即使当前 SOUNDS 仍全是单字母、显式消歧
  // 分支的计数恰好是 0，也要显式跑一遍并打印真实计数（不是悄悄不跑）。
  const result = classifyStrictConsumptionWordsFromRealWeeks();
  let executed = 0, skippedUnknown = 0;
  for (const stat of result.bySource.values()) { executed += stat.executed; skippedUnknown += stat.skippedUnknown; }
  assert(executed > 0, 'H2：真实周数据语义套件不得跳空——executed 必须大于 0');

  console.log(`PASS grapheme semantics 真实周数据语义套件：${result.totalWords} 条严格消费记录` +
    `（word_consumers 全部 ${result.bySource.size} 个来源，逐来源 executed+skippedUnknown===total 守恒），` +
    `唯一解/显式消歧解共 executed=${executed}，零解（未教字位，教学设计正常产物）skippedUnknown=${skippedUnknown}` +
    `（去重后 ${result.zeroSolutionWords.size} 个不同的词），显式消歧解 ${result.explicitResolvedWords.length} 个` +
    '（当前 SOUNDS 仍全是单字母字位，此数应为 0；未来某周新教多字母字位后若含该字形的已教词漏写 segments，' +
    '会在上面的分类循环里以"多解且未声明 segments"直接 FAIL，不会被静默跳过或漏收）。');
}
realWeekDataSemanticsSuite();
module.exports = { realWeekDataSemanticsSuite };
