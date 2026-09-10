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

/* isZeroSolutionExemptRecord(rec, sightWordsThisWeek, normalizedWord) -> boolean
 * （H1，外审 high，2026-09-10）：判定某条 word_consumers 记录的零解
 * （segment-unknown）是否属于教学设计的正常产物、可以豁免，而不是数据缺陷。
 * 只允许两类：
 *   - 认读词：不是"kind === 'sight' 的记录才豁免"，而是"这个词本周有没有被
 *     声明为认读词"——认读词教会之后会作为已知词继续出现在 sentences/
 *     book-page 等其他来源的句子里（实测：W1 的 see 同时以 sight/sentences/
 *     book-page 三种 kind 出现），那些位置的零解同样是设计本身，不是数据缺陷。
 *     用调用方按本周 kind==='sight' 记录预先收集的 sightWordsThisWeek 集合按
 *     词（不是按当前记录的 kind）判定。
 *   - kind === 'g1-rounds'：G1"声音抓抓乐"整场是听力辨音游戏，孩子只听不看不
 *     拼读，pos（目标音正例）与 neg（干扰词反例）两个桶都不要求可解码——实测
 *     W1 真实数据：a 轮的 pos 桶 cat/hat/map/bat、s 轮的 pos 桶 sun/sock/snake
 *     在 W1 字位表下同样是零解（本周只教 s a t i p n，这些词的其余字母都还没
 *     教），与 neg 桶（如 dog/bag/milk/fish）是同一种"只听不判断拼写"的性质——
 *     不是只有 neg 桶才该豁免，W2+ 恰好 pos 桶词都可解码只是内容选取的巧合，
 *     不是规则要求。
 * 其余来源（book-page/words/sentences/wordforge-family/wordforge-swap/blend/
 * initialpick/pair/flash/g3-pairs/g4-words/g5-whitelist/wall-hint）零解一律不
 * 豁免——这些位置的词按数据设计恒由当周已教字位组成，零解就是数据错误
 * （词形超纲，或该给的 W[word].segments 没给）。 */
function isZeroSolutionExemptRecord(rec, sightWordsThisWeek, normalizedWord) {
  if (sightWordsThisWeek && sightWordsThisWeek.has(normalizedWord)) return true;
  return rec.kind === 'g1-rounds';
}

/* H1 正反测试（外审 high，2026-09-10）：直接验证 isZeroSolutionExemptRecord 本身的
 * 判定力，不依赖真实周数据里恰好存在哪些零解词（真实数据会随内容变化，这里用
 * 构造的 rec 对象钉死判据本身）。 */
function verifyIsZeroSolutionExemptRecordDiscriminates() {
  const noSightWords = new Set();
  const withSee = new Set(['see']);

  // 正例①：G1 记录（pos 或 neg 桶皆可）应豁免，与是否在认读词集合无关。
  assert.equal(isZeroSolutionExemptRecord({ kind: 'g1-rounds', bucket: 'pos' }, noSightWords, 'cat'), true,
    'H1 正例：G1 pos 桶记录的零解应豁免');
  assert.equal(isZeroSolutionExemptRecord({ kind: 'g1-rounds', bucket: 'neg' }, noSightWords, 'dog'), true,
    'H1 正例：G1 neg 桶记录的零解应豁免');

  // 正例②：认读词在非 sight 来源（如 sentences/book-page）里出现时也应豁免——
  // 豁免身份跟的是"这个词本周是不是认读词"，不是"这条记录自己的 kind 是不是 sight"。
  assert.equal(isZeroSolutionExemptRecord({ kind: 'sentences' }, withSee, 'see'), true,
    'H1 正例：认读词 see 出现在 sentences 记录里也应豁免');
  assert.equal(isZeroSolutionExemptRecord({ kind: 'book-page' }, withSee, 'see'), true,
    'H1 正例：认读词 see 出现在 book-page 记录里也应豁免');

  // 反例：book-page（严格消费来源）的零解，词不在认读词集合里，必须不豁免——
  // 这是本次要堵住的口子：改前无条件豁免全部 segment-unknown，这类真实数据错误
  // 会被静默放过。
  assert.equal(isZeroSolutionExemptRecord({ kind: 'book-page' }, noSightWords, 'zzq'), false,
    'H1 反例：book-page 记录的零解（词不是认读词）不应豁免');
  assert.equal(isZeroSolutionExemptRecord({ kind: 'wordforge-family' }, noSightWords, 'zzq'), false,
    'H1 反例：wordforge-family 记录的零解（词不是认读词）不应豁免');

  console.log('PASS grapheme semantics H1 分辨力验证：isZeroSolutionExemptRecord 对 G1 记录（pos/neg 皆豁免）与' +
    '"认读词跨来源出现"两类正例正确放行，对 book-page/wordforge-family 等严格消费来源的非认读词零解正确拒绝');
}

function classifyStrictConsumptionWordsFromRealWeeks() {
  const bySource = new Map();
  const statFor = kind => {
    if (!bySource.has(kind)) bySource.set(kind, { total: 0, executed: 0, skippedUnknown: 0 });
    return bySource.get(kind);
  };
  const zeroSolutionWords = new Set();
  const explicitResolvedWords = [];

  for (let n = 1; n <= 4; n++) {
    const file = 'frontend/src/weeks/week0' + n + '.data.js';
    const raw = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const box = loadData(raw, false);
    const sounds = withGraphemeFallback(box.SOUNDS);
    const records = collectWordConsumption(box); // 不去重：来源统计要按原始记录逐条计数（同 test_migration_diff.js tallySourceCoverage 的做法）
    // 认读词是"整词记忆、不走解码"的一次性豁免身份，不是"只有 sight 这个 kind 的
    // 记录才豁免"——同一个认读词（如 W1 的 see）教会之后，会作为已知词继续出现在
    // sentences/book-page 等其他来源的句子里，那里同样不该被判成零解数据缺陷。
    // 按本周 kind==='sight' 的记录预先收集"本周认读词集合"，供下面按词（不是按
    // 当前记录的 kind）豁免。
    const sightWordsThisWeek = new Set(
      records.filter(r => r.kind === 'sight').map(r => r.word.toLowerCase())
    );

    records.forEach(rec => {
      const word = rec.word.toLowerCase();
      const stat = statFor(rec.kind);
      stat.total++;
      const entry = box.W && box.W[word];
      const explicitSegments = entry && Array.isArray(entry.segments) ? entry.segments : null;
      let result;
      try {
        result = classifyOneWordForSemantics(word, sounds, explicitSegments);
      } catch (e) {
        if (e && e.code === 'segment-ambiguous-missing-segments') {
          e.message = `week ${n}，来源 "${rec.kind}"，file: ${file}：` + e.message;
        }
        throw e;
      }
      if (result.status === 'zero') {
        if (!isZeroSolutionExemptRecord(rec, sightWordsThisWeek, word)) {
          const err = new Error(
            `H1：来源 "${rec.kind}" 的词 "${word}"（week ${n}，file: ${file}）分词零解` +
            `（含未教字位）——这个来源不在豁免清单（sight/g1-rounds）里，零解是数据缺陷` +
            `（词形超纲，或漏写 W["${word}"].segments），不允许静默跳过`
          );
          err.code = 'zero-solution-not-exempt';
          throw err;
        }
        stat.skippedUnknown++; zeroSolutionWords.add(word); return;
      }
      if (result.status === 'explicit') {
        assertWordSemantics({ week: n, file: file, word: word, segments: explicitSegments, sounds: sounds });
        explicitResolvedWords.push({ week: n, word: word, kind: rec.kind });
      }
      stat.executed++;
    });
  }

  assert.deepEqual([...bySource.keys()].sort(), ENTRY_KINDS.slice().sort(),
    'H2：来源分布实际收到的 kind 集合应与 word_consumers.ENTRY_KINDS 逐字相等——' +
    '某个来源整类消失会让"executed+skippedUnknown===total"逐来源守恒抓不住（该来源根本不出现在统计里）');

  let totalWords = 0;
  for (const [kind, stat] of bySource) {
    assert.equal(stat.executed + stat.skippedUnknown, stat.total,
      `H2：来源 "${kind}" 的 executed(${stat.executed}) + skippedUnknown(${stat.skippedUnknown}) 应等于 total(${stat.total})——` +
      '逐来源守恒，防止"抽取器少收一类"或"判定写错误跳一大批"被更宽松的总量阈值掩盖');
    totalWords += stat.total;
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
