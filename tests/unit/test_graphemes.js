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

// ---- 基础字位表：单字母词 ----
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
// 注意：这条只是验证 s/i/t 三个长度都是 1 的不同 grapheme 互不混淆，不是"同一位置
// 多个等长候选"那条 fixture——真正覆盖"同长度的多个 grapheme"这条的是下面的 OO_TABLE。
assert.deepEqual(segmentWord('sit', BASE), ['s', 'i', 't'], '多个长度相同但互不相同的 grapheme（s/i/t）互不混淆');
assert.deepEqual(segmentWord('RAIN', RAIN_TABLE), ['r', 'ai', 'n'], '大小写：word 先 toLowerCase 再匹配');
console.log('PASS graphemes: 单字母词 / 双字母词 / 多个同长度互异 grapheme / 大小写');

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

// ---- M-2：三解及以上的非退化用例（TRIPLE_TABLE 词长 1、候选全同长、分歧点在词首，
// 三个维度都退化；这里补一条三个候选长度互不相同、且都能各自延伸到完整解析的） ----
const TRIPLE_NONDEGENERATE_TABLE = {
  a: { grapheme: 'a', type: 'v' }, ab: { grapheme: 'ab', type: 'v' }, abc: { grapheme: 'abc', type: 'v' },
  b: { grapheme: 'b', type: 'c' }, bc: { grapheme: 'bc', type: 'c' }, c: { grapheme: 'c', type: 'c' },
  d: { grapheme: 'd', type: 'c' }, cd: { grapheme: 'cd', type: 'c' }
};
assertThrows(() => segmentWord('abcd', TRIPLE_NONDEGENERATE_TABLE), e => {
  assert.equal(e.code, 'segment-ambiguous');
  assert.equal(e.offset, 0);
  assert.deepEqual(e.candidates, ['a', 'ab', 'abc']); // 三个不同长度的候选，总解数 >= 3
}, '三解及以上（非退化）：不同长度候选，分歧点仍在词首但总解数与候选构造不再退化');
console.log('PASS graphemes: 三解及以上（非退化：三个不同长度候选）');

// ---- 候选必须"能延伸到完整解析"，不能只看局部是否匹配得上（方案 §3.2：
// 这个限定不可省；删掉 candidateIdsAt/computeCount3 里的 count3[target] > 0 判断，
// 下面两条会变红——见报告里"改坏副本"的验证记录） ----
// 正例：ab 在 pos0 匹配得上，但消费后剩下的 'c' 在这张表里没有任何 grapheme 能
// 匹配（没有独立的 'c'，也没有以 c 开头的），是死路，不算真候选；唯一解是 a+bc。
const DEADEND_POSITIVE_TABLE = {
  a: { grapheme: 'a', type: 'v' }, ab: { grapheme: 'ab', type: 'v' }, bc: { grapheme: 'bc', type: 'c' }
};
assert.deepEqual(segmentWord('abc', DEADEND_POSITIVE_TABLE), ['a', 'bc'], '候选必须能延伸到完整解析（正例）：ab 匹配得上但后续走不通，不算歧义，不抛错');

// 负例：abc 在 pos0 匹配得上，但消费后剩下的 'd' 在这张表里走不通（没有独立的
// 'd'、也没有以 d 开头的 grapheme），是死路；candidates 必须恰好是 ['a','ab']，
// 'abc' 不能混进去。
const DEADEND_NEGATIVE_TABLE = {
  a: { grapheme: 'a', type: 'v' }, ab: { grapheme: 'ab', type: 'v' }, abc: { grapheme: 'abc', type: 'v' },
  b: { grapheme: 'b', type: 'c' }, bc: { grapheme: 'bc', type: 'c' }, cd: { grapheme: 'cd', type: 'c' }
};
assertThrows(() => segmentWord('abcd', DEADEND_NEGATIVE_TABLE), e => {
  assert.equal(e.code, 'segment-ambiguous');
  assert.equal(e.offset, 0);
  assert.deepEqual(e.candidates, ['a', 'ab']); // abc 是死路（表里没有 'd'，'d' 之后走不通），必须被排除在 candidates 之外
}, '候选必须能延伸到完整解析（负例）：abc 匹配得上但后续走不通，candidates 里不能出现它');
console.log('PASS graphemes: 候选必须能延伸到完整解析（正例不误报歧义 + 负例 candidates 排除死路）');

// ---- M-1：candidates 排序"长度优先于 ID 码点"必须有可区分的用例——现有四个歧义
// 用例的期望值在纯码点排序下也恰好成立，删掉 sortCandidates 的长度分支单测仍会
// 全绿；这里 zz 的 grapheme 是 'a'（长度 1），ab 的 grapheme 是 'ab'（长度 2），
// 纯按 ID 码点排序会给 ['ab','zz']，长度优先则是 ['zz','ab']，两者不同。 ----
const LEN_FIRST_TABLE = {
  zz: { grapheme: 'a', type: 'v' }, ab: { grapheme: 'ab', type: 'v' },
  bc: { grapheme: 'bc', type: 'c' }, c: { grapheme: 'c', type: 'c' }
};
assertThrows(() => segmentWord('abc', LEN_FIRST_TABLE), e => {
  assert.equal(e.code, 'segment-ambiguous');
  assert.deepEqual(e.candidates, ['zz', 'ab'], 'candidates 必须按 grapheme 长度升序排列在先，ID 码点序在后');
}, 'sortCandidates 长度优先于 ID 码点（zz 的 grapheme 更短，排在 ab 前面而不是按字母序排在后面）');
console.log('PASS graphemes: candidates 排序长度优先于 ID 码点（可区分用例）');

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
// Map 不是普通对象——Object.prototype.toString.call(new Map()) 是 '[object Map]'，
// 在第一道品牌标签判据就被拒绝，落进 sounds-invalid（不是 sounds-prototype-chain：
// Map 的原型链上并没有"挂着可枚举数据"，它就是类型本身不对）。
assertThrows(() => segmentWord('cat', new Map([['s', BASE.s]])), e => assert.equal(e.code, 'sounds-invalid'), 'sounds 非普通映射（Map，品牌标签判据）');
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

// ---- assertSoundsShape 的判据是"沿原型链逐层查有没有可枚举数据"，不是"只看直接原型"----
// Object.create(null)：没有原型链可走，必须放行。
assert.deepEqual(segmentWord('a', Object.create(null, { a: { value: { grapheme: 'a', type: 'v' }, enumerable: true } })), ['a'], 'Object.create(null) 是合法的普通映射，必须放行');
// 两层原型链：直接原型是空的（Object.prototype 风格），但祖先原型上真的挂着数据——
// 判据必须沿整条链查，不能只看 Object.getPrototypeOf(sounds) 这一层就放行。
(() => {
  const grandparent = { ghost: { grapheme: 'gh', type: 'c' } };
  const parent = Object.create(grandparent); // parent 自己没有自有可枚举键
  const sounds = Object.create(parent);
  sounds.a = { grapheme: 'a', type: 'v' };
  assertThrows(() => segmentWord('a', sounds), e => assert.equal(e.code, 'sounds-prototype-chain'), '原型链上更深一层（祖先）挂着数据，也必须被拒绝，不能只查直接原型');
})();
console.log('PASS graphemes: assertSoundsShape 沿整条原型链判断（Object.create(null) 放行 / 深层祖先数据仍拒绝）');

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

// ---- M-3：soundType 对"ID 已知但 type 字段本身非法"要报独立错误码 ----
// "遇到未知 ID 一律抛同一种结构化错误"这条统一契约管的是"ID 找不到"；ID 存在但
// type 字段坏了是另一类数据 schema 错误，不能和 unknown-id 混在一起，否则跟
// check_data.js 那边 SOUNDS schema 报错的口径对不上。
const BAD_TYPE_TABLE = Object.assign({}, RAIN_TABLE, { weird: { grapheme: 'w', type: 'x' } });
assertThrows(() => soundType('weird', BAD_TYPE_TABLE), e => assert.equal(e.code, 'sound-type-invalid'), 'soundType 对已知 ID 但 type 非法报 sound-type-invalid（不是 unknown-id）');
console.log('PASS graphemes: soundType 的 type 字段非法用独立错误码，不与 unknown-id 混用');

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

// ---- C-1 回归 + M-4 模块形态："同一份实现同时供浏览器与 Node 使用"的真实证据 ----
// tools/build_lessons.py 的 expand() 只做逐字文本拼接（不套 IIFE），@include 进
// 模板的文件本质就是被整段塞进一个 <script> 标签。这里直接把源码丢进一个全新的
// vm context 跑，context 里没有 module/exports，模拟浏览器侧"函数变成全局"的
// 真实效果，而不是只满足于"require 的不是拷贝"这种较弱的证据。
(() => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const srcPath = path.join(__dirname, '..', '..', 'frontend', 'src', 'shared', 'graphemes.js');
  const src = fs.readFileSync(srcPath, 'utf8');
  const ctx = vm.createContext({}); // 没有 module，模拟浏览器全局环境
  assert.equal(typeof ctx.module, 'undefined', '新建的 vm context 本来就没有 module（确认这是个干净的对照环境）');
  new vm.Script(src, { filename: 'graphemes.js (vm, no module)' }).runInContext(ctx);
  assert.equal(typeof ctx.segmentWord, 'function', '模拟浏览器同构环境下 segmentWord 成为全局函数（文件末尾的导出守卫容忍没有 module）');
  assert.equal(typeof ctx.surfaceOf, 'function', '同上，surfaceOf 也成为全局函数');

  // C-1 核心回归：跨 realm 的普通对象（在这个全新 vm context 里造的字面量，原型
  // 是那个 context 自己的 Object.prototype，与宿主 Object.prototype 不是同一个
  // 对象）必须能正常通过宿主 require 出来的 segmentWord，不再被误判为
  // sounds-prototype-chain。
  const crossRealmSounds = vm.runInContext(
    '({c:{grapheme:"c",type:"c"}, a:{grapheme:"a",type:"v"}, t:{grapheme:"t",type:"c"}})',
    ctx
  );
  assert.notEqual(Object.getPrototypeOf(crossRealmSounds), Object.prototype, '造出来的确实是跨 realm 对象（原型不是宿主 Object.prototype，验证测试本身没有失效）');
  assert.deepEqual(segmentWord('cat', crossRealmSounds), ['c', 'a', 't'], 'C-1 回归：跨 realm 普通对象不再被误判为 sounds-prototype-chain');

  // M-4：同一份源码在"浏览器同构"环境下跑出的 segmentWord，对同一输入给出与
  // Node 侧 require 版本完全一致的结果——证明两边确实是同一份实现，不是两份拷贝。
  // 注意：ctx.segmentWord 返回的数组是那个 vm context 自己的 Array，[[Prototype]]
  // 与宿主 Array.prototype 不是同一个对象；assert/strict 的 deepEqual 按 === 比较
  // 原型，会把内容相同的跨 realm 数组误判为不等，所以先转成宿主数组只比较内容。
  assert.deepEqual(
    Array.from(ctx.segmentWord('cat', crossRealmSounds)),
    segmentWord('cat', crossRealmSounds),
    'vm 同构环境跑出的 segmentWord 与 Node require 版本结果一致（同一份源码）'
  );
})();
console.log('PASS graphemes: C-1 回归（跨 realm 普通对象不再被误判）+ M-4 模块形态（浏览器同构环境证据）');

console.log('PASS graphemes contract: all fixtures green');
