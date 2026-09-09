/* H2（外审 high，2026-09-09）：扩表后严格着色会产生新歧义——回归测试。
 *
 * 背景：「当前可唯一解码」不是稳定的数据契约。第 7 步要向 SOUNDS 加 `ai`、`at` 这类
 * 多字母字位 ID，一旦加入，原本靠单字母字位就能唯一解出的旧词（比如 sat：s+a+t）会
 * 撞上新字位（at）产生第二种完整解（s+at），从"唯一解"变成"多解"——colorStrictWord
 * 内部调用 segmentWord 不传 explicitSegments 时，遇到多解会抛 segment-ambiguous
 * （方案 §3.2 契约），而 colorStrictWord 对这类错误不降级、原样抛出（graphemes.js
 * DEGRADABLE_ERROR_CODES 白名单只收 segment-unknown/segment-ambiguous 供
 * colorLenientWord/colorPlainText 用，colorStrictWord 从不捕获）——这些位置的词卡/
 * G2/G3/exam 等全部走 colorStrictWord（判据是"这个位置的词按数据设计恒由本周已教
 * 字位组成"），一旦抛错、且调用方也没有 try/catch，就是真实的白屏故障。
 *
 * 本文件不改真实数据（第 7 步才做迁移），只用合成字位表复现这个机制本身，留一个
 * "先绿后红、补 segments 后再绿"的判据，供第 7 步开工时核对：任何受新增字位影响的
 * 既有纯单字母词，都必须显式补 segments，缺了就该在这里（以及真实 check_data.js 的
 * `④ 积木架能摆出题库里的词`/词卡渲染路径）体现为失败，不能被无声吞掉。
 *
 * 三步结构：
 *   ① 旧表（无 at）：批量词唯一解，colorStrictWord 不传 explicitSegments 正常渲染。
 *   ② 扩表（加入与 a/t 重叠的 at）：同一批词从唯一解变成多解，不传 explicitSegments
 *      的 segmentWord/colorStrictWord 必须抛 segment-ambiguous——这就是"新歧义"，
 *      也是本条 high 要证明"存在"的那件事。同时验证不受影响的词（不含 at 片段）
 *      在扩表后仍然唯一解，证明这不是全表退化，只是重叠片段命中的那批词受影响。
 *   ③ 补 segments 后：ctx.segmentsOf 显式给出旧的 3 字位切法，colorStrictWord 在
 *      扩表后的字位表下仍能正常渲染，且渲染结果与扩表前完全一致——这是第 7 步开工时
 *      的现成判据："只要给受影响的词补 segments，严格渲染就能继续工作"。
 */
const assert = require('node:assert/strict');
const { segmentWord, colorStrictWord } = require('../../frontend/src/shared/graphemes');

function assertThrows(fn, check, label) {
  let caught = null;
  try { fn(); } catch (e) { caught = e; }
  assert(caught, label + ': expected to throw, did not');
  if (check) check(caught);
  return caught;
}

// ---- 旧表：只有单字母字位（s/a/t/p/c/r/m/h/n/i），没有任何多字母字位 ----
const OLD_SOUNDS = {
  s: { grapheme: 's', type: 'c' }, a: { grapheme: 'a', type: 'v' },
  t: { grapheme: 't', type: 'c' }, p: { grapheme: 'p', type: 'c' },
  c: { grapheme: 'c', type: 'c' }, r: { grapheme: 'r', type: 'c' },
  m: { grapheme: 'm', type: 'c' }, h: { grapheme: 'h', type: 'c' },
  n: { grapheme: 'n', type: 'c' }, i: { grapheme: 'i', type: 'v' }
};
const noExplicitCtx = sounds => ({ sounds, segmentsOf: () => undefined });

// "at" 结尾、按纯单字母字位本该唯一解的批量词（strict 消费词的真实故障模式）。
const AT_WORDS = ['sat', 'pat', 'cat', 'rat', 'mat', 'hat'];
// 不含 "at" 片段的对照词——扩表后应完全不受影响，证明新歧义只命中重叠片段那批词。
const UNAFFECTED_WORDS = ['pin', 'ram', 'nap'];

// ============================================================================
// ① 旧表：批量词唯一解，colorStrictWord 不传 explicitSegments 正常渲染
// ============================================================================
const oldCtx = noExplicitCtx(OLD_SOUNDS);
const oldRendered = {};
AT_WORDS.concat(UNAFFECTED_WORDS).forEach(w => {
  const ids = segmentWord(w, OLD_SOUNDS); // 不传 explicitSegments：唯一解应直接返回，不抛
  assert(Array.isArray(ids), `旧表下 "${w}" 应有唯一解`);
  const html = colorStrictWord(w, oldCtx); // 不传 explicitSegments 的 colorStrictWord 同样应成功
  oldRendered[w] = html;
});
console.log('PASS strict_render_ambiguity_regression（①）：旧表（无 at）下，AT_WORDS/UNAFFECTED_WORDS 全部唯一解，colorStrictWord 不传 explicitSegments 正常渲染');

// ============================================================================
// ② 扩表：加入与 a+t 重叠的多字母字位 at——AT_WORDS 从唯一解变成多解并抛
//    segment-ambiguous（新歧义，本条 high 要证明的核心事实）；UNAFFECTED_WORDS
//    不受影响，仍是唯一解。
// ============================================================================
const NEW_SOUNDS = Object.assign({}, OLD_SOUNDS, { at: { grapheme: 'at', type: 'v' } });
const newCtx = noExplicitCtx(NEW_SOUNDS);

AT_WORDS.forEach(w => {
  assertThrows(() => segmentWord(w, NEW_SOUNDS), e => assert.equal(e.code, 'segment-ambiguous'),
    `H2 核心断言：扩表后 "${w}" 应从唯一解变成多解（s+a+t 与 s+at 两解），segmentWord 不传 explicitSegments 必须抛 segment-ambiguous`);
  assertThrows(() => colorStrictWord(w, newCtx), e => assert.equal(e.code, 'segment-ambiguous'),
    `H2 核心断言：扩表后 colorStrictWord("${w}") 不传 explicitSegments 必须原样抛出 segment-ambiguous（不降级、不静默吞掉）——这正是真实场景里"扩表后突然白屏"的机制`);
});
UNAFFECTED_WORDS.forEach(w => {
  const ids = segmentWord(w, NEW_SOUNDS);
  assert.deepEqual(ids, segmentWord(w, OLD_SOUNDS), `不含 at 片段的 "${w}" 扩表前后分词结果应完全一致，证明新歧义只命中重叠片段那批词，不是全表退化`);
  assert.equal(colorStrictWord(w, newCtx), oldRendered[w], `不含 at 片段的 "${w}" 扩表后 colorStrictWord 渲染结果应与扩表前完全一致`);
});
console.log('PASS strict_render_ambiguity_regression（②）：扩表后 AT_WORDS 全部从唯一解变成多解并抛 segment-ambiguous，UNAFFECTED_WORDS 不受影响——证明"当前可唯一解码"不是稳定契约');

// ============================================================================
// ③ 补 segments 后：扩表后的字位表下，显式 segments（旧的 3 字位切法）应让
//    colorStrictWord 恢复正常渲染，且结果与扩表前完全一致——第 7 步开工时的判据。
// ============================================================================
const OLD_SEGMENTS = {
  sat: ['s', 'a', 't'], pat: ['p', 'a', 't'], cat: ['c', 'a', 't'],
  rat: ['r', 'a', 't'], mat: ['m', 'a', 't'], hat: ['h', 'a', 't']
};
const explicitCtx = {
  sounds: NEW_SOUNDS,
  segmentsOf: normalized => OLD_SEGMENTS[normalized]
};
AT_WORDS.forEach(w => {
  const ids = segmentWord(w, NEW_SOUNDS, OLD_SEGMENTS[w]);
  assert.deepEqual(ids, OLD_SEGMENTS[w], `显式 segments 应精确按 "${w}" 给定的旧切法消歧，不受新增 at 影响`);
  const html = colorStrictWord(w, explicitCtx);
  assert.equal(html, oldRendered[w],
    `H2 核心判据：扩表后补上显式 segments，colorStrictWord("${w}") 应恢复渲染，且与扩表前的渲染结果逐字符一致——第 7 步只要给受影响的词补 segments，严格渲染就能继续工作`);
});
console.log('PASS strict_render_ambiguity_regression（③）：扩表后补显式 segments，全部 AT_WORDS 严格调用恢复渲染，且与扩表前结果完全一致');

console.log('PASS strict_render_ambiguity_regression contract: all fixtures green');
