/* 里程碑 2 第 2 步：frontend/src/shared/graphemes.js 的纯函数单测（node 跑，不接线）。
 * 覆盖清单对应 docs/里程碑2实施方案_20260908_v1.7.md §3.2/§3.5/§5 与
 * S2 交付要求逐条列出的 fixture；每组用例前的注释标注对应哪一条。
 *
 * “同一份实现同时供浏览器与 Node 使用”的证据：这里直接 require 的是
 * frontend/src/shared/graphemes.js 本体，不是 tools/validation/ 下的另一份拷贝。 */
const assert = require('node:assert/strict');
const {
  segmentWord, surfaceOf, graphemeLabel, soundType, normalizeIdList,
  isValidGraphemeId, assertValidGraphemeId,
  escapeHtmlText, escapeHtmlAttribute, encodeIdListAttribute
} = require('../../frontend/src/shared/graphemes');

function assertThrows(fn, check, label) {
  let caught = null;
  try { fn(); } catch (e) { caught = e; }
  assert(caught, label + ': expected to throw, did not');
  if (check) check(caught);
  return caught;
}

// ---- 基础字位表：单字母词、同长度多个 grapheme ----
// 注意：这里刻意不放 'ai'——如果同一张表里同时有单字母 a/i 和双字母 ai，
// 'rain' 会真的产生 r-a-i-n / r-ai-n 两个完整解，这正是 abc 例子的同构情形
// （见下面「全局多解失败」一节），不是 bug；双字母词单测另用不含单字母 a/i 的
// RAIN_TABLE，把"验证 rain -> r/ai/n"与"验证多解检测"这两件事分开验。
const BASE = {
  s: { grapheme: 's', type: 'c' }, a: { grapheme: 'a', type: 'v' }, t: { grapheme: 't', type: 'c' },
  i: { grapheme: 'i', type: 'v' }, p: { grapheme: 'p', type: 'c' }, n: { grapheme: 'n', type: 'c' },
  r: { grapheme: 'r', type: 'c' }, c: { grapheme: 'c', type: 'c' }
};
const RAIN_TABLE = {
  r: { grapheme: 'r', type: 'c' }, ai: { grapheme: 'ai', type: 'v' }, n: { grapheme: 'n', type: 'c' }
};

assert.deepEqual(segmentWord('cat', BASE), ['c', 'a', 't'], '单字母词');
assert.deepEqual(segmentWord('rain', RAIN_TABLE), ['r', 'ai', 'n'], '双字母词 rain -> r/ai/n（一块积木不是一个字母）');
assert.deepEqual(segmentWord('sit', BASE), ['s', 'i', 't'], '同长度的多个 grapheme（s/i/t 均长度 1，互不混淆）');
assert.deepEqual(segmentWord('RAIN', RAIN_TABLE), ['r', 'ai', 'n'], '大小写：word 先 toLowerCase 再匹配');
console.log('PASS graphemes: 单字母词 / 双字母词 / 同长度多 grapheme / 大小写');

// ---- 附带发现：同一张表里若单字母 a/i 与双字母 ai 共存，rain 会真的多解 ----
// 不是本实现的缺陷——这与方案 §3.2 的 abc 例子（a/ab/bc/c）是同一种"可分解成
// 更短已教字位"的歧义，按契约必须报歧义，交给 W[word].segments 显式消歧。
// 这里顺带验证 segmentWord 确实能抓到这类情形，供后续步骤（数据迁移）参考。
assertThrows(() => segmentWord('rain', Object.assign({}, BASE, { ai: { grapheme: 'ai', type: 'v' } })), e => {
  assert.equal(e.code, 'segment-ambiguous');
}, 'rain 在单字母 a/i 与双字母 ai 共存的表里会真的多解（非缺陷，需 W[word].segments 消歧）');
console.log('PASS graphemes: 单字母与双字母共表时的组合多解会被正确抓到（非缺陷）');

// ---- 重复 grapheme：表里存在与被测词无关的重复 grapheme，不干扰结果 ----
const WITH_DUP_ELSEWHERE = Object.assign({}, BASE, {
  z1: { grapheme: 'z', type: 'c' }, z2: { grapheme: 'z', type: 'c' }
});
assert.deepEqual(segmentWord('cat', WITH_DUP_ELSEWHERE), ['c', 'a', 't'], '重复 grapheme（z1/z2 与被测词无关）不影响其余词的分词');
console.log('PASS graphemes: 重复 grapheme 不干扰无关词');

// ---- 空串 / 未知片段 ----
assertThrows(() => segmentWord('', BASE), e => assert.equal(e.code, 'word-empty'), '空串');
assertThrows(() => segmentWord('zoo', BASE), e => {
  assert.equal(e.code, 'segment-unknown');
  assert.equal(e.word, 'zoo');
}, '未知片段（z/o 不在表里）');
console.log('PASS graphemes: 空串 / 未知片段');

// ---- 全局多解失败：a/ab/bc/c 上的 abc，两个完整解，首段长度不同（0 vs 2），offset=0 ----
function tableFromOrder(entries, order) {
  const table = {};
  order.forEach(k => { table[k] = entries[k]; });
  return table;
}
const ABC_ENTRIES = {
  a: { grapheme: 'a', type: 'v' }, ab: { grapheme: 'ab', type: 'v' },
  bc: { grapheme: 'bc', type: 'c' }, c: { grapheme: 'c', type: 'c' }
};
const abcOrder1 = tableFromOrder(ABC_ENTRIES, ['a', 'ab', 'bc', 'c']);
const abcOrder2 = tableFromOrder(ABC_ENTRIES, ['c', 'bc', 'ab', 'a']); // 打乱插入顺序
[abcOrder1, abcOrder2].forEach((table, idx) => {
  assertThrows(() => segmentWord('abc', table), e => {
    assert.equal(e.code, 'segment-ambiguous');
    assert.equal(e.offset, 0);
    assert.deepEqual(e.candidates, ['a', 'ab']); // 按 grapheme 长度升序：a(1) 先于 ab(2)
  }, '全局多解失败：abc 在 a/ab/bc/c 下（顺序变体 ' + idx + '）');
});
console.log('PASS graphemes: 全局多解失败（不同首段长度）+ 打乱 SOUNDS 插入顺序结果不变（歧义分支）');

// ---- 打乱插入顺序：非歧义词结果也不变（唯一解重建分支）----
assert.deepEqual(
  segmentWord('cat', tableFromOrder(BASE, Object.keys(BASE).slice().reverse())),
  ['c', 'a', 't'],
  '打乱 SOUNDS 插入顺序后唯一解不变'
);
console.log('PASS graphemes: 打乱 SOUNDS 插入顺序结果不变（唯一解分支）');

// ---- 同长度多解失败 + 同一 grapheme 对应多个 ID + 不同分叉深度（分歧点不在词首）----
// book: b 唯一 forced -> offset0 只有一个候选；位置 1 的 'oo' 同时匹配 oo_short/oo_long，
// 两者 grapheme 长度相同（都是 2），是本例的"同长度多解"；分歧位置在 1，不在词首。
const OO_TABLE = {
  b: { grapheme: 'b', type: 'c' }, k: { grapheme: 'k', type: 'c' },
  oo_short: { grapheme: 'oo', type: 'v' }, oo_long: { grapheme: 'oo', type: 'v' }
};
assertThrows(() => segmentWord('book', OO_TABLE), e => {
  assert.equal(e.code, 'segment-ambiguous');
  assert.equal(e.offset, 1, '分歧点不在词首');
  assert.deepEqual(e.candidates, ['oo_long', 'oo_short']); // 长度相同，按 ID 码点升序
}, '同长度多解失败 + 同一 grapheme 对应多个 ID（oo_short/oo_long）');
console.log('PASS graphemes: 同长度多解失败 / 同一 grapheme 多 ID / 分歧点不在词首（长度相同分支）');

// ---- 不同分叉深度：分歧位置不在词首，且两个候选长度不同（区别于上面"同长度"那组）----
const PABC_TABLE = {
  p: { grapheme: 'p', type: 'c' }, a: { grapheme: 'a', type: 'v' },
  ab: { grapheme: 'ab', type: 'v' }, bc: { grapheme: 'bc', type: 'c' }, c: { grapheme: 'c', type: 'c' }
};
assertThrows(() => segmentWord('pabc', PABC_TABLE), e => {
  assert.equal(e.code, 'segment-ambiguous');
  assert.equal(e.offset, 1, '分歧点在 p 之后，不在词首');
  assert.deepEqual(e.candidates, ['a', 'ab']);
}, '不同分叉深度：分歧点不在词首（长度不同分支）');
console.log('PASS graphemes: 不同分叉深度（分歧点不在词首，长度不同）');

// ---- 三解及以上，且同一分歧位置存在三个可完成候选（防止实现从有限见证反推候选集合）----
const TRIPLE_TABLE = {
  x1: { grapheme: 'x', type: 'c' }, x2: { grapheme: 'x', type: 'c' }, x3: { grapheme: 'x', type: 'c' }
};
assertThrows(() => segmentWord('x', TRIPLE_TABLE), e => {
  assert.equal(e.code, 'segment-ambiguous');
  assert.equal(e.offset, 0);
  assert.deepEqual(e.candidates, ['x1', 'x2', 'x3']);
}, '三解及以上，同一分歧位置三个可完成候选');
console.log('PASS graphemes: 三解及以上，同一分歧位置三个可完成候选');

// ---- explicitSegments 四类非法输入 ----
assertThrows(() => segmentWord('cat', BASE, []), e => assert.equal(e.code, 'explicit-segments-invalid'), 'explicitSegments 空数组');
assertThrows(() => segmentWord('cat', BASE, 'cat'), e => assert.equal(e.code, 'explicit-segments-invalid'), 'explicitSegments 非数组（字符串）');
assertThrows(() => segmentWord('cat', BASE, ['c', 5, 't']), e => assert.equal(e.code, 'explicit-segments-invalid'), 'explicitSegments 含非字符串元素');
assertThrows(() => segmentWord('cat', BASE, ['c', 'a', 'zzz']), e => {
  assert.equal(e.code, 'explicit-segments-invalid');
  assert.equal(e.id, 'zzz');
}, 'explicitSegments 含未知字位 ID（非 sounds 自有键）');
assertThrows(() => segmentWord('cat', BASE, ['c', 'ai', 't']), e => assert.equal(e.code, 'explicit-segments-invalid'), 'explicitSegments 表面串与 word 不一致');
console.log('PASS graphemes: explicitSegments 四类非法输入');

// ---- explicitSegments 正例 + displayOnWall:false 不影响分词资格 ----
assert.deepEqual(segmentWord('cat', BASE, ['c', 'a', 't']), ['c', 'a', 't'], 'explicitSegments 正例');
const WITH_HIDDEN = Object.assign({}, BASE, { hidden_h: { grapheme: 'h', type: 'c', displayOnWall: false } });
assert.deepEqual(
  segmentWord('cath', WITH_HIDDEN, ['c', 'a', 't', 'hidden_h']),
  ['c', 'a', 't', 'hidden_h'],
  'displayOnWall:false 只影响墙展示，不影响分词资格'
);
console.log('PASS graphemes: explicitSegments 正例 + displayOnWall:false 不影响分词资格');

// ---- 输入 schema 四类非法：word 非字符串 / sounds 非普通映射 / grapheme 空或非字符串 / 原型链键 ----
assertThrows(() => segmentWord(123, BASE), e => assert.equal(e.code, 'word-invalid'), 'word 非字符串');
assertThrows(() => segmentWord('cat', ['s', 'a', 't']), e => assert.equal(e.code, 'sounds-invalid'), 'sounds 非普通映射（数组）');
assertThrows(() => segmentWord('cat', 'not-an-object'), e => assert.equal(e.code, 'sounds-invalid'), 'sounds 非普通映射（字符串）');
assertThrows(() => segmentWord('cat', null), e => assert.equal(e.code, 'sounds-invalid'), 'sounds 非普通映射（null）');
// Map 的原型不是 Object.prototype，被归入"原型链"这一类而不是"非普通映射"——
// 两者用同一条 assertSoundsShape 判断，只是细分成两个可区分的错误码。
assertThrows(() => segmentWord('cat', new Map([['s', BASE.s]])), e => assert.equal(e.code, 'sounds-prototype-chain'), 'sounds 原型非 Object.prototype（Map）');
assertThrows(() => segmentWord('cat', Object.assign({}, BASE, { bad: { grapheme: '', type: 'c' } })),
  e => { assert.equal(e.code, 'grapheme-invalid'); assert.equal(e.id, 'bad'); }, 'grapheme 空字符串');
assertThrows(() => segmentWord('cat', Object.assign({}, BASE, { bad: { grapheme: 5, type: 'c' } })),
  e => { assert.equal(e.code, 'grapheme-invalid'); assert.equal(e.id, 'bad'); }, 'grapheme 非字符串');
(() => {
  const proto = { ghost: { grapheme: 'gh', type: 'c' } };
  const polluted = Object.create(proto);
  polluted.a = { grapheme: 'a', type: 'v' };
  assertThrows(() => segmentWord('a', polluted), e => assert.equal(e.code, 'sounds-prototype-chain'), '原型链键（sounds 原型上挂着数据）');
})();
console.log('PASS graphemes: 输入 schema 四类非法（word / sounds / grapheme / 原型链）');

// ---- sounds 只读自有键、不走原型链：即便 hasOwnProperty 被同名字位 ID 覆盖也不崩溃 ----
// 'hasOwnProperty' 本身也是一个合法的 SOUNDS 键名（只是巧合地与 Object.prototype 上的方法同名）。
// 实现内部判断"是不是自有键"必须用 Object.prototype.hasOwnProperty.call(sounds, id)，
// 不能直接调 sounds.hasOwnProperty(id)——那样这里会因为它被数据覆盖成非函数而直接崩溃。
(() => {
  const shadowed = Object.create(null);
  shadowed.hasOwnProperty = { grapheme: 'x', type: 'c' };
  shadowed.a = { grapheme: 'a', type: 'v' };
  assert.deepEqual(segmentWord('a', shadowed), ['a'], 'sounds.hasOwnProperty 被同名字位数据覆盖时仍能正确分词');
  assert.equal(graphemeLabel('hasOwnProperty', shadowed), 'x', 'resolveSoundEntry 用 Object.prototype.hasOwnProperty.call 而非 sounds.hasOwnProperty(...)');
})();
console.log('PASS graphemes: sounds 只读自有键，hasOwnProperty 被遮蔽也不崩溃');

// ---- surfaceOf / graphemeLabel / soundType：正例 + 未知 ID 统一错误码 ----
assert.equal(surfaceOf(['r', 'ai', 'n'], RAIN_TABLE), 'rain', 'surfaceOf 正例');
assert.equal(graphemeLabel('ai', RAIN_TABLE), 'ai', 'graphemeLabel 正例');
assert.equal(soundType('ai', RAIN_TABLE), 'v', 'soundType 正例（元音）');
assert.equal(soundType('r', RAIN_TABLE), 'c', 'soundType 正例（辅音）');
assertThrows(() => surfaceOf(['r', 'zzz'], RAIN_TABLE), e => assert.equal(e.code, 'unknown-id'), 'surfaceOf 未知 ID');
assertThrows(() => graphemeLabel('zzz', RAIN_TABLE), e => assert.equal(e.code, 'unknown-id'), 'graphemeLabel 未知 ID');
assertThrows(() => soundType('zzz', RAIN_TABLE), e => assert.equal(e.code, 'unknown-id'), 'soundType 未知 ID');
console.log('PASS graphemes: surfaceOf / graphemeLabel / soundType 正例与未知 ID 统一错误');

// ---- normalizeIdList 两种入口 ----
assert.deepEqual(normalizeIdList('satipn'), ['s', 'a', 't', 'i', 'p', 'n'], 'normalizeIdList 字符串入口（旧单字符 schema 展开）');
assert.deepEqual(normalizeIdList(['r', 'ai', 'n']), ['r', 'ai', 'n'], 'normalizeIdList 数组入口（原样保留）');
(() => {
  const src = ['a', 'b'];
  const out = normalizeIdList(src);
  src.push('c');
  assert.equal(out.length, 2, 'normalizeIdList 数组入口返回浅拷贝，不与调用方数组共享引用');
})();
assertThrows(() => normalizeIdList(123), e => assert.equal(e.code, 'id-list-invalid'), 'normalizeIdList 非字符串非数组');
assertThrows(() => normalizeIdList([1, 2, 3]), e => assert.equal(e.code, 'id-list-invalid'), 'normalizeIdList 数组含非字符串元素');
console.log('PASS graphemes: normalizeIdList 两种入口 + 非法输入');

// ---- ID 字符集与编码：引号 / 尖括号 / & / 非法 ID 四类失败 fixture ----
assert.equal(isValidGraphemeId('r'), true, 'isValidGraphemeId 正例（单字母）');
assert.equal(isValidGraphemeId('oo_short'), true, 'isValidGraphemeId 正例（下划线 + 数字字符集）');
assert.equal(isValidGraphemeId('r"o'), false, 'ID 字符集：引号');
assert.equal(isValidGraphemeId('r<o'), false, 'ID 字符集：尖括号');
assert.equal(isValidGraphemeId('r&o'), false, 'ID 字符集：&');
assert.equal(isValidGraphemeId('Ai'), false, 'ID 字符集：非法 ID（大写开头）');
assertThrows(() => assertValidGraphemeId('1a'), e => assert.equal(e.code, 'invalid-id-format'), 'assertValidGraphemeId 对非法 ID 抛错');
console.log('PASS graphemes: ID 字符集四类失败 fixture（引号/尖括号/&/非法 ID）');

// ---- HTML 文本转义 / 属性值转义（两个分开的函数） ----
assert.equal(escapeHtmlText('<b>&"\''), '&lt;b&gt;&amp;"\'', 'escapeHtmlText 只转义 & < >，不转义引号');
assert.equal(escapeHtmlAttribute('<b>&"\''), '&lt;b&gt;&amp;&quot;&#39;', 'escapeHtmlAttribute 额外转义引号');
console.log('PASS graphemes: HTML 文本转义与属性值转义是两个分开的函数');

// ---- 数组型 data-* 用 JSON 编码，不是逗号拼接 ----
assert.equal(encodeIdListAttribute(['r', 'ai', 'n']), '["r","ai","n"]', 'encodeIdListAttribute 用 JSON 编码');
assert.equal(
  escapeHtmlAttribute(encodeIdListAttribute(['r', 'ai'])),
  '[&quot;r&quot;,&quot;ai&quot;]',
  'JSON 编码后再套 escapeHtmlAttribute 才能安全嵌入属性值'
);
assertThrows(() => encodeIdListAttribute(['bad id']), e => assert.equal(e.code, 'invalid-id-format'), 'encodeIdListAttribute 拒绝非法 ID');
assertThrows(() => encodeIdListAttribute('not-array'), e => assert.equal(e.code, 'id-list-invalid'), 'encodeIdListAttribute 拒绝非数组');
console.log('PASS graphemes: 数组型 data-* 用 JSON 编码，不用逗号拼接');

console.log('PASS graphemes contract: all fixtures green');
