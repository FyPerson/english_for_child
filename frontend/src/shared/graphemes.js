/* 字位分词与字位安全的展示/编码工具（里程碑 2 第 2 步，不接线）。
 * 契约来源：docs/里程碑2实施方案_20260908_v1.7.md §3.1/§3.2/§3.5、
 *          docs/周课件数据层交接规范_20260908_v2.0.md §3「字位与积木的对应」。
 * 三层概念（方案 §3.1）：字位 ID（SOUNDS 的键）/ grapheme（SOUNDS[id].grapheme，显示字形）/
 * 表面串（各字位 grapheme 依次拼接，查词用）。
 *
 * 模块形态：本文件同时供浏览器构建（@include 逐字拼接成全局函数）与 Node `require` 使用，
 * 见文件末尾的双读导出守卫；不要另外复制一份实现（load_data.js 不得自写简化分词器）。
 */

var GRAPHEME_ID_PATTERN = /^[a-z][a-z0-9_]*$/;

/* ---- 结构化错误（segmentWord/surfaceOf/graphemeLabel/soundType/normalizeIdList/
   ID 校验与编码函数共用同一种错误形状：{code, message, ...细节字段}） ---- */
function GraphemeError(code, message, details) {
  var err = new Error(message);
  err.name = 'GraphemeError';
  err.code = code;
  if (details) {
    Object.keys(details).forEach(function (key) { err[key] = details[key]; });
  }
  return err;
}

/* sounds 必须是普通映射：不是 null/数组/基础类型，且原型链上不得携带额外数据
 * （方案 §3.2「输入 schema 先验」——只读自有键、不走原型链）。
 * 拆成两条独立判断，好让"非普通映射"与"原型链键"两类非法输入各自有可区分的错误码。
 *
 * 判据必须 realm 无关（S2 critical 修复）：真实 SOUNDS 唯一的加载通道
 * tools/validation/load_data.js 用 `vm.runInNewContext` 取值，得到的对象原型是
 * *那个 vm realm 的* Object.prototype，与宿主 `Object.prototype` 不是同一个对象——
 * `proto !== Object.prototype` 这种按引用比较的写法会把全部真实数据都判成非法。
 * 改用两段 realm 无关的判据：
 *   1) `Object.prototype.toString.call(sounds)` 品牌标签判"是不是普通对象"——
 *      这是 spec 定义的通用算法，不看原型链是不是同一个对象，跨 realm 也成立；
 *      `Object.create(null)` 的标签同样是 '[object Object]'，会正确通过。
 *   2) 沿原型链逐层检查"是否真的挂着可枚举数据"（`Object.keys(p).length > 0`）。
 *      `Object.prototype`（包括任何 realm 自己的 Object.prototype）本身没有自有
 *      可枚举属性，这一条天然跨 realm 成立；只有像 `Object.create({ghost:...})`
 *      这种原型上真被塞了数据的情况才会命中。 */
function assertSoundsShape(sounds) {
  if (Object.prototype.toString.call(sounds) !== '[object Object]') {
    throw GraphemeError('sounds-invalid', 'sounds 必须是普通映射对象', { value: sounds });
  }
  for (var p = Object.getPrototypeOf(sounds); p !== null; p = Object.getPrototypeOf(p)) {
    if (Object.keys(p).length > 0) {
      throw GraphemeError(
        'sounds-prototype-chain',
        'sounds 的原型链上不得携带额外数据，请使用普通对象字面量或 Object.create(null)',
        { value: sounds }
      );
    }
  }
}

function isValidSoundEntryGrapheme(entry) {
  return !!entry && typeof entry === 'object' && typeof entry.grapheme === 'string' &&
    entry.grapheme.length > 0 && entry.grapheme.toLowerCase().length > 0;
}

/* segmentWord 建索引前的全表校验：sounds 形状 + 每个自有键是合法字位 ID + 每一项
 * grapheme 非空字符串。只读 Object.keys 返回的自有键，不走原型链。
 *
 * 两条依据：
 * - 方案 §3.2：「空 grapheme 必须在进 DP 前失败——否则会产生零长度转移，DP 状态图
 *   出现自环而不前进」
 * - 方案 §5「ID 字符集与属性编码」：字位 ID 限定为 ^[a-z][a-z0-9_]*$。**这条先验不能省**
 *   （codex 2026-09-09 判 high）：不校验键，`__proto__`、大写、空格、非 ASCII 的 ID 都能
 *   进到分词里，而 sortCandidates 用 `<` 比较 ID 正是以「ID 是纯 ASCII」为前提的——
 *   前提不成立时浏览器与 Node 的候选顺序可能漂移。 */
function validateSoundsTable(sounds) {
  assertSoundsShape(sounds);
  var ids = Object.keys(sounds);
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    if (!isValidGraphemeId(id)) {
      throw GraphemeError('sound-id-invalid', 'SOUNDS 的键不是合法字位 ID（须匹配 ^[a-z][a-z0-9_]*$）：' + id, { id: id });
    }
    if (!isValidSoundEntryGrapheme(sounds[id])) {
      throw GraphemeError('grapheme-invalid', 'SOUNDS.' + id + '.grapheme 必须是非空字符串', { id: id });
    }
  }
}

/* surfaceOf/graphemeLabel/soundType 共用：按 ID 取校验过的 sounds 条目，
 * 未知 ID（包括不是自有键、entry 缺失、grapheme 非法）一律同一种结构化错误
 * （方案 §3.2：「遇到未知 ID 一律抛同一种结构化错误，不返回 undefined」）。 */
function resolveSoundEntry(sounds, id) {
  assertSoundsShape(sounds);
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(sounds, id)) {
    throw GraphemeError('unknown-id', '未知字位 ID：' + id, { id: id });
  }
  var entry = sounds[id];
  if (!isValidSoundEntryGrapheme(entry)) {
    throw GraphemeError('unknown-id', '字位 ID 缺少合法 grapheme：' + id, { id: id });
  }
  return entry;
}

/* 按 grapheme 的规范化长度分桶建索引：Map<长度, Map<规范化grapheme文本, id[]>>。
 * 同一 grapheme 对应多个 ID（如 oo_short/oo_long）时，桶内数组保留全部 ID。
 * 调用前 sounds 已经过 validateSoundsTable 校验，这里不再重复校验。 */
function buildGraphemeIndex(sounds) {
  var byLength = new Map();
  var lengthSet = new Set();
  var ids = Object.keys(sounds);
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    var grapheme = sounds[id].grapheme.toLowerCase();
    var len = grapheme.length;
    lengthSet.add(len);
    if (!byLength.has(len)) byLength.set(len, new Map());
    var bucket = byLength.get(len);
    if (!bucket.has(grapheme)) bucket.set(grapheme, []);
    bucket.get(grapheme).push(id);
  }
  var lengths = Array.from(lengthSet).sort(function (a, b) { return a - b; });
  return { byLength: byLength, lengths: lengths };
}

/* 三态 DP（方案 §3.2「复杂度有界」）：count3[i] ∈ {0,1,2}，2 表示"两解及以上"，
 * 不枚举全部解析，只按 offset 记忆化「0 解 / 唯一解 / 多解」。
 * count3[i] 累加的是"从 i 出发、且能到达终点"的全部完整解析条数（capped）。 */
function computeCount3(normalizedWord, index) {
  var n = normalizedWord.length;
  var count3 = new Array(n + 1).fill(0);
  count3[n] = 1;
  for (var i = n - 1; i >= 0; i--) {
    var total = 0;
    for (var li = 0; li < index.lengths.length; li++) {
      var len = index.lengths[li];
      if (i + len > n) continue;
      var text = normalizedWord.slice(i, i + len);
      var bucket = index.byLength.get(len);
      var matched = bucket && bucket.get(text);
      if (!matched) continue;
      for (var k = 0; k < matched.length; k++) {
        var target = i + len;
        if (count3[target] > 0) total = Math.min(2, total + count3[target]);
      }
    }
    count3[i] = total;
  }
  return count3;
}

/* 位置 pos 上"能延伸到完整解析"的全部下一字位 ID（去重），不设上限——
 * 候选必须从可达且能到达终点的状态边直接算出，不能从留存的有限见证解析里反推
 * （方案 §3.2 九审 L-3：否则三解以上会漏候选）。 */
function candidateIdsAt(pos, normalizedWord, index, count3) {
  var n = normalizedWord.length;
  var seen = new Set();
  var options = [];
  for (var li = 0; li < index.lengths.length; li++) {
    var len = index.lengths[li];
    if (pos + len > n) continue;
    var text = normalizedWord.slice(pos, pos + len);
    var bucket = index.byLength.get(len);
    var matched = bucket && bucket.get(text);
    if (!matched) continue;
    for (var k = 0; k < matched.length; k++) {
      var id = matched[k];
      var target = pos + len;
      if (count3[target] > 0 && !seen.has(id)) {
        seen.add(id);
        options.push({ id: id, len: len });
      }
    }
  }
  return options;
}

/* 从词首沿"唯一可行转移"前进；只要当前位置只有一个候选就是被迫的，走到底就是
 * count3[0]===1 时的唯一解重建；第一次遇到 >=2 个候选，就是 offset 的定义——
 * 「在所有能够延伸到完整解析的路径中，最早出现两个及以上不同下一字位 ID 的位置」
 * （方案 §3.2 八审 H-1，按位置定义、与见证无关）。 */
function forcedWalk(normalizedWord, index, count3) {
  var n = normalizedWord.length;
  var path = [];
  var i = 0;
  while (i < n) {
    var options = candidateIdsAt(i, normalizedWord, index, count3);
    if (options.length === 0) {
      // count3[i] > 0 保证此处至少有一条出边；到这里说明 DP 状态不一致（内部缺陷）。
      throw GraphemeError('internal-error', '分词内部状态不一致', { offset: i });
    }
    if (options.length >= 2) {
      return { branch: true, offset: i, options: options };
    }
    path.push(options[0].id);
    i += options[0].len;
  }
  return { branch: false, path: path };
}

/* 歧义 fixture 诊断用：贪心最长匹配找一个"卡住"的位置。方案没有为「0 解」定义
 * offset 语义（只对歧义的 offset 写死了定义），这里只是尽力而为的诊断信息，
 * 不是契约的一部分。 */
function findUnknownOffset(normalizedWord, index) {
  var n = normalizedWord.length;
  var lengthsDesc = index.lengths.slice().sort(function (a, b) { return b - a; });
  var i = 0;
  while (i < n) {
    var matchedLen = 0;
    for (var li = 0; li < lengthsDesc.length; li++) {
      var len = lengthsDesc[li];
      if (i + len > n) continue;
      var text = normalizedWord.slice(i, i + len);
      var bucket = index.byLength.get(len);
      if (bucket && bucket.has(text)) { matchedLen = len; break; }
    }
    if (matchedLen === 0) return i;
    i += matchedLen;
  }
  return n;
}

/* candidates 排序（方案 §3.2 九审 L-2）：先按 grapheme 规范化后的 UTF-16 长度升序，
 * 再按 ID 的 Unicode 码点字典序升序。禁止 localeCompare。 */
function sortCandidates(ids, sounds) {
  return ids.slice().sort(function (a, b) {
    var la = sounds[a].grapheme.toLowerCase().length;
    var lb = sounds[b].grapheme.toLowerCase().length;
    if (la !== lb) return la - lb;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/* explicitSegments 的完整校验（方案 §3.2 复审 H-5）：非空字符串数组；每个元素是
 * sounds 的自有键；表面串（未规范化拼接后再规范化）必须等于规范化后的 word。 */
function validateExplicitSegments(word, normalizedWord, sounds, explicitSegments) {
  if (!Array.isArray(explicitSegments) || explicitSegments.length === 0 ||
      !explicitSegments.every(function (s) { return typeof s === 'string'; })) {
    throw GraphemeError('explicit-segments-invalid', 'explicitSegments 必须是非空字符串数组', { word: word });
  }
  for (var i = 0; i < explicitSegments.length; i++) {
    var id = explicitSegments[i];
    if (!Object.prototype.hasOwnProperty.call(sounds, id)) {
      throw GraphemeError('explicit-segments-invalid', 'explicitSegments 含未知字位 ID：' + id, { word: word, id: id });
    }
  }
  // 此时 sounds 已经过 validateSoundsTable 校验，grapheme 均合法，直接拼接。
  var surface = explicitSegments.map(function (id) { return sounds[id].grapheme; }).join('').toLowerCase();
  if (surface !== normalizedWord) {
    throw GraphemeError('explicit-segments-invalid', 'explicitSegments 拼接结果与 word 不一致', { word: word });
  }
  return explicitSegments.slice();
}

/* segmentWord(word, sounds, explicitSegments?) -> string[]（字位 ID 数组）
 * 契约：方案 §3.2「segmentWord 契约」全条，含 0 解报未知 / 恰好 1 解返回 / 多于 1
 * 解报歧义、offset/candidates 的按位置定义、复杂度有界（三态 DP，不枚举全部解）。 */
function segmentWord(word, sounds, explicitSegments) {
  if (typeof word !== 'string') {
    throw GraphemeError('word-invalid', 'word 必须是字符串', { value: word });
  }
  validateSoundsTable(sounds);
  var normalizedWord = word.toLowerCase();
  if (normalizedWord.length === 0) {
    throw GraphemeError('word-empty', 'word 不能是空字符串', { word: word });
  }
  if (explicitSegments !== undefined) {
    return validateExplicitSegments(word, normalizedWord, sounds, explicitSegments);
  }
  var index = buildGraphemeIndex(sounds);
  var count3 = computeCount3(normalizedWord, index);
  if (count3[0] === 0) {
    throw GraphemeError('segment-unknown', '无法识别的字位片段：' + word, {
      word: word,
      offset: findUnknownOffset(normalizedWord, index),
      candidates: []
    });
  }
  var walk = forcedWalk(normalizedWord, index, count3);
  if (walk.branch) {
    throw GraphemeError('segment-ambiguous', '分词歧义，需要显式 segments 消歧：' + word, {
      word: word,
      offset: walk.offset,
      candidates: sortCandidates(walk.options.map(function (o) { return o.id; }), sounds)
    });
  }
  return walk.path;
}

/* surfaceOf(ids, sounds) -> string：字位 ID 数组 → 表面串（方案 §3.1 第三层，
 * 各字位 grapheme 按原样依次拼接，不做规范化）。未知 ID 抛统一的 'unknown-id'。 */
function surfaceOf(ids, sounds) {
  assertSoundsShape(sounds);
  if (!Array.isArray(ids)) {
    throw GraphemeError('ids-invalid', 'ids 必须是数组', { value: ids });
  }
  return ids.map(function (id) { return resolveSoundEntry(sounds, id).grapheme; }).join('');
}

/* graphemeLabel(id, sounds) -> string：字位 ID → 显示字形（方案 §3.1「凡是给人看
 * 的——用 grapheme」）。返回值保留 SOUNDS[id].grapheme 的原始大小写，不规范化。 */
function graphemeLabel(id, sounds) {
  return resolveSoundEntry(sounds, id).grapheme;
}

/* soundType(id, sounds) -> 'c' | 'v'：字位 ID → 辅音/元音分类。
 * 注意："遇到未知 ID 一律抛同一种结构化错误"这条统一契约管的是"ID 找不到"这一种
 * 情形（resolveSoundEntry 已经处理）；ID 存在但 `type` 字段本身不合法是另一类数据
 * 错误（该条目 schema 坏了，不是 ID 不存在），用独立的 'sound-type-invalid' 错误码，
 * 好和 check_data.js 那边 SOUNDS schema 报错的口径对得上（S2 medium M-3）。 */
function soundType(id, sounds) {
  var entry = resolveSoundEntry(sounds, id);
  if (entry.type !== 'c' && entry.type !== 'v') {
    throw GraphemeError('sound-type-invalid', '字位 ID 的 type 字段非法：' + id, { id: id });
  }
  return entry.type;
}

/* normalizeIdList(value) -> string[]：迁移期双读（方案 §3.5）。
 * 只按 value 的类型分派，不靠内容猜版本：字符串按旧单字符 schema 逐字符展开；
 * 数组按 ID 原样保留（浅拷贝，不修改调用方数组）。既不是字符串也不是数组则拒绝。
 * 注意：这一步不校验展开/传入的每个字符是否真的是 sounds 里的 ID——那属于消费方
 * 自己的校验职责（比如 segmentWord 的 explicitSegments 分支），也是第 8 步
 * `assertIdList` 要收紧成"只收数组、逐项验证存在"时才收窄的部分。 */
function normalizeIdList(value) {
  if (typeof value === 'string') {
    return value.split('');
  }
  if (Array.isArray(value)) {
    if (!value.every(function (item) { return typeof item === 'string'; })) {
      throw GraphemeError('id-list-invalid', 'normalizeIdList 的数组元素必须都是字符串', { value: value });
    }
    return value.slice();
  }
  throw GraphemeError('id-list-invalid', 'normalizeIdList 只接受字符串或数组', { value: value });
}

/* ---- ID 字符集与属性编码（方案 §5「ID 字符集与属性编码」，第 2 步开始前冻结） ---- */

/* isValidGraphemeId(id) -> boolean：字位 ID 限定 ^[a-z][a-z0-9_]*$。 */
function isValidGraphemeId(id) {
  return typeof id === 'string' && GRAPHEME_ID_PATTERN.test(id);
}

/* assertValidGraphemeId(id) -> id：不合法则抛结构化错误，合法则原样返回，
 * 方便 `ids.forEach(assertValidGraphemeId)` 这种写法。 */
function assertValidGraphemeId(id) {
  if (!isValidGraphemeId(id)) {
    throw GraphemeError('invalid-id-format', '字位 ID 格式不合法：' + String(id), { id: id });
  }
  return id;
}

/* escapeHtmlText(value) -> string：HTML 文本节点转义，只转义 & < >。 */
function escapeHtmlText(value) {
  return String(value).replace(/[&<>]/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch];
  });
}

/* escapeHtmlAttribute(value) -> string：HTML 属性值转义，在文本转义的三个字符
 * 基础上再转义引号，使结果可以安全嵌入单引号或双引号包裹的属性值。 */
function escapeHtmlAttribute(value) {
  return String(value).replace(/[&<>"']/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}

/* encodeIdListAttribute(ids) -> string：数组型 data-* 用 JSON 编码，不用逗号拼接。
 * 编码前逐项校验 ID 字符集；返回的是原始 JSON 字符串，嵌入 HTML 属性前调用方还需
 * 再过一次 escapeHtmlAttribute（两件事分开：编码格式 vs. 转义）。 */
function encodeIdListAttribute(ids) {
  if (!Array.isArray(ids)) {
    throw GraphemeError('id-list-invalid', 'ids 必须是数组', { value: ids });
  }
  ids.forEach(assertValidGraphemeId);
  return JSON.stringify(ids);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    segmentWord: segmentWord,
    surfaceOf: surfaceOf,
    graphemeLabel: graphemeLabel,
    soundType: soundType,
    normalizeIdList: normalizeIdList,
    isValidGraphemeId: isValidGraphemeId,
    assertValidGraphemeId: assertValidGraphemeId,
    escapeHtmlText: escapeHtmlText,
    escapeHtmlAttribute: escapeHtmlAttribute,
    encodeIdListAttribute: encodeIdListAttribute
  };
}
