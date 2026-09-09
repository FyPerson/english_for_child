/* 里程碑 2 第 4b 步收口：colorStrictWord/colorLenientWord/colorPlainText/
 * validateSoundsSchema 的单测（H2 修复——这四个共约 140 行的新公开函数此前零单测，
 * critical 1（demo 词走严格分词白屏）与 critical 2（着色丢大小写）都是从这个空洞
 * 漏出去的）。覆盖清单对应本批收口任务 H2 明确点名的四类：
 *   ① 不可解码词（demo 类）渲染不抛——C1 的回归断言
 *   ② 大小写往返——C2 的回归断言
 *   ③ 整句路径的标点、多空格、句首句尾
 *   ④ validateSoundsSchema 的正反例
 * 每条断言在编写时都用"精准破坏"单独验证过会红（把对应修复点改回收口前的写法，
 * 跑这条断言必须失败；改回来又必须变绿）——这是本项目在 feedback_revision_
 * consistency_check 里踩过三次「粗破坏红在别的断言上」后立下的规矩，验证过程见
 * 本批收口报告，不是断言本身要做的事。 */
const assert = require('node:assert/strict');
const {
  segmentWord, colorStrictWord, colorLenientWord, colorPlainText, validateSoundsSchema,
  escapeHtmlText
} = require('../../frontend/src/shared/graphemes');

function assertThrows(fn, check, label) {
  let caught = null;
  try { fn(); } catch (e) { caught = e; }
  assert(caught, label + ': expected to throw, did not');
  if (check) check(caught);
  return caught;
}

// stripTags：拿掉着色包的 <span class="v word-vowel">...</span>，只留文字，用来做
// "着色前后应该是同一段文字（含大小写）"的往返断言。这份实现里的着色函数不产出
// 任何其它标签，简单的标签剥离足够。
function stripTags(html) { return html.replace(/<[^>]+>/g, ''); }

// ---- 字位表：s/a/t/i/n/e，覆盖 CVC 与含 e 的简单句 ----
const SOUNDS = {
  s: { grapheme: 's', type: 'c' }, a: { grapheme: 'a', type: 'v' },
  t: { grapheme: 't', type: 'c' }, i: { grapheme: 'i', type: 'v' },
  n: { grapheme: 'n', type: 'c' }, e: { grapheme: 'e', type: 'v' }
};
const ctx = { sounds: SOUNDS, segmentsOf: () => undefined };

// ============================================================================
// ① C1 回归：不可解码词（demo 类）不抛，原样转义输出
// ============================================================================
// 'moon' 含 SOUNDS 里没有的 'm'/'oo'——按 demo 词的真实故障模式（未知片段）。
assertThrows(() => colorStrictWord('moon', ctx), e => assert.equal(e.code, 'segment-unknown'),
  '对照组：colorStrictWord 对不可解码词必须抛（证明下面 colorLenientWord 不抛不是因为词表凑巧能分）');
assert.equal(colorLenientWord('moon', ctx), 'moon', 'colorLenientWord 对未知片段的词不抛，原样转义输出');

// 分词歧义（segment-ambiguous）也要走同一条降级路径，不只是未知片段这一种失败模式。
const AMBIGUOUS_SOUNDS = Object.assign({}, SOUNDS, { ai: { grapheme: 'ai', type: 'v' } });
const ambiguousCtx = { sounds: AMBIGUOUS_SOUNDS, segmentsOf: () => undefined };
assertThrows(() => segmentWord('sain', AMBIGUOUS_SOUNDS), e => assert.equal(e.code, 'segment-ambiguous'),
  '对照组：这张表下 sain 确实多解（s/a/i/n 与 s/ai/n 都成立）');
assert.equal(colorLenientWord('sain', ambiguousCtx), 'sain', 'colorLenientWord 对分词歧义的词同样不抛，原样转义输出');

// 但数据本身坏了（sounds 形状非法）不属于"该降级"的情形，colorLenientWord 必须重抛，
// 不能把它也吞成一次安静的原样输出（这正是 M1 裸 catch 的故障模式）。
assertThrows(() => colorLenientWord('sat', { sounds: null, segmentsOf: () => undefined }),
  e => assert.equal(e.code, 'sounds-invalid'),
  'colorLenientWord 对 sounds 形状非法必须重抛，不能降级成原样输出');
console.log('PASS word_coloring（C1 回归）：colorLenientWord 对未知片段/歧义两种"该降级"情形都不抛，对数据形状错误仍重抛');

// ============================================================================
// ② C2 回归：大小写往返——着色/降级前后剥掉标签必须还原成原文（含大小写）
// ============================================================================
['Nat', 'nat', 'NAT', 'Sat', 'tan', 'Ant'].forEach(w => {
  const colored = colorStrictWord(w, ctx);
  assert.equal(stripTags(colored), w, `colorStrictWord("${w}") 剥掉标签后应等于原词（大小写不变）`);
});
// 元音确实被包了着色 span，不是 stripTags 掩盖了"其实没着色"这件事。
assert(/<span class="v word-vowel">a<\/span>/.test(colorStrictWord('sat', ctx)), 'colorStrictWord 确实给元音包了着色 span（不是纯转义直出）');
assert(/<span class="v word-vowel">A<\/span>/.test(colorStrictWord('SAT', ctx)), '大写词的元音 span 内文字同样保留大写');

// colorPlainText：句子级往返，含大小写、标点、句首句尾、多空格。
['I see Nat.', 'Nat sees a cat.', 'NAT!', '  Nat  is  in.  '].forEach(sentence => {
  const colored = colorPlainText(sentence, ctx);
  assert.equal(stripTags(colored), sentence, `colorPlainText("${sentence}") 剥掉标签后应逐字符还原（大小写/标点/空格都不变）`);
});
console.log('PASS word_coloring（C2 回归）：colorStrictWord/colorPlainText 大小写往返，元音 span 内文字同样保留大小写');

// ============================================================================
// ③ colorPlainText：标点/多空格/句首句尾降级，以及降级判据的白名单边界（M1）
// ============================================================================
// 句子里含无法解码的专有名词/未知片段——降级为原样输出，不影响其余能分词的词。
const mixed = colorPlainText('Moon and Nat play.', ctx);
assert.equal(stripTags(mixed), 'Moon and Nat play.', '句子里分不出的词（moon/and/play 含未教字位）逐个降级，不影响整句往返');
assert(/<span class="v word-vowel">a<\/span>/.test(mixed), '句子里能分词的 Nat 仍然正常着色，不因为邻居词分不出就一起降级');

// 数据坏了（sounds 非普通对象）在整句路径里同样必须重抛，不能被裸 catch 吞掉
// （2026-09-09 核实 critical 2 时真实踩过这个坑：ctx 构造错，被裸 catch 吞成假象）。
assertThrows(() => colorPlainText('Nat sees a cat.', { sounds: 42, segmentsOf: () => undefined }),
  e => assert.equal(e.code, 'sounds-invalid'),
  'colorPlainText 对 sounds 形状非法必须重抛，不能吞成"看起来正常"的降级输出');
console.log('PASS word_coloring（M1 回归）：colorPlainText 标点/多空格/混合可解码不可解码词，降级判据白名单外重抛');

// ============================================================================
// ④ validateSoundsSchema 正反例
// ============================================================================
const VALID_SOUNDS = {
  s: { grapheme: 's', type: 'c', ipa: '/s/', mem: 'm', cue: 'c', challenge: 'ch', try: 't', pass: 'p', how: 'h', warn: 'w', demo: [['sat', '坐']] }
};
assert.deepEqual(validateSoundsSchema(VALID_SOUNDS), [], '合法表且不要求教学字段时应无 issue');
assert.deepEqual(validateSoundsSchema(VALID_SOUNDS, { requireTeachingFields: true }), [], '合法表且要求教学字段齐全时应无 issue');

// 反例①：ID 字符集不合法
assert.deepEqual(
  validateSoundsSchema({ S: { grapheme: 's', type: 'c' } }).map(i => i.code),
  ['sound-id-invalid'],
  '大写 ID 应报 sound-id-invalid'
);
// 反例②：grapheme 缺失/非法
assert.deepEqual(
  validateSoundsSchema({ s: { grapheme: '', type: 'c' } }).map(i => i.code),
  ['grapheme-invalid'],
  '空 grapheme 应报 grapheme-invalid'
);
// 反例③：遗留 L 字段
assert.deepEqual(
  validateSoundsSchema({ s: { grapheme: 's', type: 'c', L: 's' } }).map(i => i.code),
  ['legacy-l-field'],
  '仍有遗留 L 字段应报 legacy-l-field'
);
// 反例④：sounds 本身不是普通对象
assert.deepEqual(validateSoundsSchema(null).map(i => i.code), ['sounds-invalid'], 'sounds 非普通对象应报 sounds-invalid 并短路返回');
// 反例⑤（L2 修复回归）：原型链上挂了额外数据应报 sounds-prototype-chain
const proto = { s: { grapheme: 's', type: 'c' } };
const poisoned = Object.create(proto);
assert.deepEqual(validateSoundsSchema(poisoned).map(i => i.code), ['sounds-prototype-chain'], '原型链携带额外数据应报 sounds-prototype-chain（L2 修复前这里不会报任何问题）');
// 反例⑥：要求教学字段时缺字段
const missingTeaching = validateSoundsSchema({ s: { grapheme: 's', type: 'c' } }, { requireTeachingFields: true });
assert(missingTeaching.some(i => i.code === 'ipa-missing'), '缺 ipa 应报 ipa-missing');
assert(missingTeaching.some(i => i.code === 'teaching-field-missing' && i.message.includes('demo')), '缺 demo 应报 teaching-field-missing（demo）');
console.log('PASS word_coloring: validateSoundsSchema 正例 + 六类反例（含 L2 新增的原型链检查）');

// ============================================================================
// ⑤ M5（外审 medium，2026-09-09）：可着色词/grapheme 仅支持 ASCII A-Z/a-z——
//    组合字符、全角字母、土耳其 İ 的拒绝/降级行为固定断言
// ============================================================================
// 组合字符："é" 写成 "e" + U+0301（组合重音符），toLowerCase 前后 UTF-16 长度不变，
// 但视觉上是一个字符两个 code unit——colorizeToken 按 grapheme.length 切原串的假设
// 在这种输入上并不成立，必须在切片前就被挡住，而不是切出乱码。
const COMBINING_ACCENT = 'é'; // "é"（NFD 形式，两个 code unit）
// 全角字母：Ａ-Ｚ／ａ-ｚ（U+FF21-FF3A / U+FF41-FF5A），常规 toLowerCase 不会把它们
// 映射成 ASCII，长度和字符集都对不上字位表。
const FULLWIDTH_WORD = 'Ｓａｔ'; // "Ｓａｔ"
// 土耳其语 İ（U+0130，带点大写 I）：在土耳其语言环境下 toLowerCase() 可能产出
// "i̇"（i + 组合点，两个 code unit），与 ASCII 'i' 不是同一回事。
const TURKISH_DOTTED_I = 'İat'; // "İat"

[COMBINING_ACCENT, FULLWIDTH_WORD, TURKISH_DOTTED_I].forEach(word => {
  assertThrows(() => colorStrictWord(word, ctx), e => assert.equal(e.code, 'colorize-non-ascii'),
    `M5：colorStrictWord("${JSON.stringify(word)}") 遇非 ASCII 输入应抛 colorize-non-ascii，不应尝试按长度切片`);
  assert.equal(colorLenientWord(word, ctx), escapeHtmlText(word),
    `M5：colorLenientWord("${JSON.stringify(word)}") 遇非 ASCII 输入应降级为原样转义输出，不抛`);
});
// colorPlainText：WORD_TOKEN_PATTERN（/([A-Za-z]+)/）本身就只捕获 ASCII 字母片段，
// 非 ASCII 字符会落进"非词"分隔符段，直接转义拼回——colorizeToken 在这条路径上
// 根本不会被非 ASCII 输入触发，这里断言的是这条防线本身成立（不会把 é/全角/İ 误判
// 成"词"送进分词器）。
const plainSentence = `Nat and ${FULLWIDTH_WORD} play caf${COMBINING_ACCENT}.`;
assert.equal(stripTags(colorPlainText(plainSentence, ctx)), plainSentence,
  'M5：colorPlainText 里夹杂非 ASCII 字符的句子应逐字符原样往返（非 ASCII 段落不会被当成词送进分词器）');
console.log('PASS word_coloring（M5）：组合字符/全角字母/土耳其 İ 的拒绝（colorStrictWord）与降级（colorLenientWord/colorPlainText）行为固定');

// validateSoundsSchema：grapheme 含非 ASCII 字符应报 grapheme-invalid（M5 的 schema 半边）。
assert.deepEqual(
  validateSoundsSchema({ e: { grapheme: COMBINING_ACCENT, type: 'v' } }).map(i => i.code),
  ['grapheme-invalid'],
  'M5：grapheme 含非 ASCII 组合字符应报 grapheme-invalid'
);
assert.deepEqual(
  validateSoundsSchema({ s: { grapheme: FULLWIDTH_WORD, type: 'c' } }).map(i => i.code),
  ['grapheme-invalid'],
  'M5：grapheme 是全角字母应报 grapheme-invalid'
);
console.log('PASS word_coloring（M5 schema）：validateSoundsSchema 对非 ASCII grapheme 报 grapheme-invalid');

// ============================================================================
// ⑥ L1（外审 low，2026-09-09）：多字母字位 + 显式 segments 消歧的精确 HTML 断言
//    （不只是"剥标签比较"——那种断言证明不了标签结构本身合法、也发现不了错误嵌套/
//    多余属性；这里对固定输入断言完整、逐字符精确期望的 HTML 输出）
// ============================================================================
const AI_SOUNDS = Object.assign({}, SOUNDS, { ai: { grapheme: 'ai', type: 'v' }, r: { grapheme: 'r', type: 'c' } });
// rain 在 AI_SOUNDS 下天然多解（r/a/i/n 与 r/ai/n 都成立），必须用显式 segments 消歧，
// 与 check_data.js/render-blocks.js 真实调用点同一种 ctx.segmentsOf 用法一致。
const explicitCtx = {
  sounds: AI_SOUNDS,
  segmentsOf: normalized => (normalized === 'rain' ? ['r', 'ai', 'n'] : undefined)
};
assert.equal(
  colorStrictWord('rain', explicitCtx),
  'r<span class="v word-vowel">ai</span>n',
  'L1：显式 segments 消歧的多字母字位（rain -> r/ai/n）应精确输出该 HTML，元音 span 包住整个 "ai" 而不是拆成两个字符'
);
// 大小写混合的多字母字位词：显式 segments 仍按同一份 ID 序列消歧，展示文字保留原大小写。
assert.equal(
  colorStrictWord('Rain', explicitCtx),
  'R<span class="v word-vowel">ai</span>n',
  'L1：大小写混合词 "Rain" 经显式 segments 消歧后，首字母大写保留，"ai" 段落大小写与原词一致'
);
assert.equal(
  colorStrictWord('RAIN', explicitCtx),
  'R<span class="v word-vowel">AI</span>N',
  'L1：全大写词 "RAIN" 经显式 segments 消歧后，元音 span 内文字同样保留全大写'
);
console.log('PASS word_coloring（L1）：多字母字位 + 显式 segments 消歧的精确 HTML 断言（含大小写混合）');

console.log('PASS word_coloring contract: all fixtures green');
