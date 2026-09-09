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

/* ---- 结构化错误（segmentWord/surfaceOf/graphemeLabel/soundType/assertIdList/
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

/* M5（外审 medium，2026-09-09）：可着色词/grapheme 的字符集显式限定为 ASCII 字母
 * A-Z/a-z——不是新限制，是把一直隐含成立、从未写进 schema 的前提显式化。colorizeToken
 * 按 graphemeLabel(id).length 在*原始* word 字符串上切片（graphemes.js 头部注释），
 * 这条切片逻辑只对"规范化前后 UTF-16 长度不变"的输入可靠：Unicode 组合字符（如
 * "e" + U+0301 组合重音，toLowerCase 前后长度不变但视觉上是一个字符两个 code unit）、
 * 全角字母（Ａ-Ｚ，toLowerCase 通常不处理全角，长度也不匹配 ASCII grapheme 表）、
 * 部分大小写映射（土耳其语 İ.toLowerCase() 在土耳其语言环境下可能产出多字符结果）
 * 都会被切错位置或触发长度不一致。真实四周数据的 grapheme 与词全部是 ASCII 字母
 * （见本文件校验），这条判据不影响现状，只是把"支持范围"从"没写"变成"写死并校验"。 */
var ASCII_ALPHA_PATTERN = /^[A-Za-z]+$/;
function isAsciiAlpha(str) {
  return typeof str === 'string' && ASCII_ALPHA_PATTERN.test(str);
}

function isValidSoundEntryGrapheme(entry) {
  return !!entry && typeof entry === 'object' && typeof entry.grapheme === 'string' &&
    entry.grapheme.length > 0 && entry.grapheme.toLowerCase().length > 0 &&
    isAsciiAlpha(entry.grapheme);
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

/* assertIdList(value, sounds) -> string[]：收紧后的最终形态（方案 §3.5 + §4 第 8 行，
 * 2026-09-09/10 里程碑 2 第 8 步「收紧兼容层」）。
 *
 * 沿革：第 2 步引入时函数名为 normalizeIdList(value, options)，靠 `options.legacy`
 * 双读——字符串按旧单字符 schema 展开、数组原样保留——供第 4b～7 步的迁移期消费者
 * 兼容新旧两种数据形态。第 7 步四个字段（wallLetters/rackG4/rackG5/newPatterns）已
 * 全部迁成 ID 数组，迁移期双读的存在理由随之消失。本步删除"legacy 字符串展开"这个
 * 分支本身（连同 legacy 选项一起删除），函数收口改名为 assertIdList：
 *
 * - **只接受数组**：字符串输入一律拒绝，不再有任何选项能让它通过——错误码沿用
 *   `id-list-legacy-string-rejected`（历史命名延续，语义不变："你传了字符串"）。
 *   反解析/数据层入口若把 "ai" 这样的字符串误当成 ID 数组传进来，这里会直接拒绝，
 *   不会被静默拆成 ['a','i'] 两个字符（方案 §3.5：「反解析侧同样要能区分新旧格式，
 *   不能把字符串 "ai" 错当成两个 ID」）。
 * - **数组元素必须都是字符串**：否则 `id-list-invalid`，与收口前一致。
 * - **逐项验证每个 ID 在 sounds 里存在**：这是本步新加的一层校验（收口前的
 *   normalizeIdList 明确声明"不校验展开/传入的每个字符是否真的是 sounds 里的
 *   ID"，把这层校验留给消费方自己——现在收进来了）。复用 resolveSoundEntry 同一套
 *   判据（ID 是自有键、entry 含合法 grapheme），未知 ID 抛同一种结构化错误
 *   `unknown-id`，与 surfaceOf/graphemeLabel/soundType 未知 ID 时的错误码一致
 *   （方案 §3.2：「遇到未知 ID 一律抛同一种结构化错误」）。
 * - **既不是字符串也不是数组**：拒绝（`id-list-invalid`），与收口前一致。
 * - 返回值是浅拷贝（不修改调用方数组），与收口前一致。
 *
 * 调用方因此必须能拿到一份 sounds 表——四处生产调用点（games.js 两处、四个模板各
 * 一处）都在能访问全局 SOUNDS 的作用域内调用，check_data.js 的调用点本就持有从
 * box 解构出的 SOUNDS，无需额外改造。 */
function assertIdList(value, sounds) {
  if (typeof value === 'string') {
    throw GraphemeError(
      'id-list-legacy-string-rejected',
      'assertIdList 不再接受字符串输入：里程碑 2 第 8 步已删除旧单字符 schema 的迁移期兼容' +
        '（不再有选项可以声明"这是旧格式数据"），请把上游数据迁成 ID 数组',
      { value: value }
    );
  }
  if (!Array.isArray(value)) {
    throw GraphemeError('id-list-invalid', 'assertIdList 只接受 ID 数组', { value: value });
  }
  value.forEach(function (id, index) {
    if (typeof id !== 'string') {
      throw GraphemeError('id-list-invalid', 'assertIdList 的数组元素必须都是字符串（第 ' + index + ' 项）', { value: value, index: index });
    }
  });
  value.forEach(function (id) { resolveSoundEntry(sounds, id); });
  return value.slice();
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

/* ---- 消费者兼容层新增导出（里程碑 2 第 4b 步）---- */

/* normalizeWord(word) -> string：着色器与拆词消费方共用的唯一规范化函数
 * （方案 §3.2「着色器先用唯一的 normalizeWord 得到查表键再调用」）。目前只是
 * toLowerCase，但集中成一个函数是为了不让 colorStrictWord/colorPlainText/
 * 未来的消费方各自选择不同的规范化方式——那样显式消歧仍会因为查表键不一致而丢
 * （方案 §3.2 五审 H-4）。 */
function normalizeWord(word) {
  if (typeof word !== 'string') {
    throw GraphemeError('word-invalid', 'word 必须是字符串', { value: word });
  }
  return word.toLowerCase();
}

/* colorizeToken(word, ctx) -> string：单个"词"token（不含空白/标点）的字位着色，
 * strict/lenient/plain 三条路径共用。ctx.segmentsOf 的返回值按契约（方案 §3.2）不得被
 * 就地修改：这里只读，交给 segmentWord 自己 slice。
 *
 * 显示文字取原字符不是 grapheme 标签（里程碑 2 第 4b 步收口 critical 2 修复）：
 * graphemeLabel(id, sounds) 返回的是 SOUNDS[id].grapheme，数据里这个字段恒小写
 * （grapheme 是查表键的规范化形式，不是展示原文）。原先直接拼 graphemeLabel 的结果，
 * 会把 "Nat"/"I see Nat." 这类首字母大写的词/句着色成全小写，且遇到分不出的词走
 * 降级分支时反而保住原样，同一页面大小写混杂。
 * 正确做法：分词只用来定位「切几刀、切多长、每一段是不是元音」，展示文字改成按每个
 * ID 的 grapheme 长度，在*原始* word 字符串上依次切片取出来的原文（保留大小写）。
 * segmentWord 内部对大小写做规范化匹配（'Sat' 与 'sat' 分词结果相同），
 * 所以「按长度切原串」在字符数上总能对齐；这里仍然显式断言切片总长度等于原词长度，
 * 断言失败说明实现出了错（比如 grapheme 长度与规范化长度不一致的非 ASCII 情形），
 * 直接抛出而不是静默吞掉——错误的大小写比抛错更难被发现。 */
function colorizeToken(word, ctx) {
  /* M5（外审 medium，2026-09-09）：先显式拒绝非 ASCII 输入，不让它流进按长度切片的
   * 逻辑——见本函数上方大段注释与 isAsciiAlpha 定义处的说明。这是"拒绝"这一半：
   * colorStrictWord 直接调用本函数，遇到这个错误码会照常原样抛出（不在白名单
   * DEGRADABLE_ERROR_CODES 里的错误一律不降级）；colorLenientWord/colorPlainText
   * 把这个码加进了白名单，走的是"降级"那一半——原样转义输出，不影响整页渲染。 */
  if (!isAsciiAlpha(word)) {
    throw GraphemeError('colorize-non-ascii',
      '着色仅支持 ASCII 字母 A-Z/a-z 组成的词，遇到非 ASCII 输入：' + word, { word: word });
  }
  var normalized = normalizeWord(word);
  var explicit = ctx.segmentsOf(normalized);
  var ids = segmentWord(word, ctx.sounds, explicit);
  var pos = 0;
  var out = ids.map(function (id) {
    var len = graphemeLabel(id, ctx.sounds).length;
    var original = word.slice(pos, pos + len);
    pos += len;
    var text = escapeHtmlText(original);
    return soundType(id, ctx.sounds) === 'v' ? '<span class="v word-vowel">' + text + '</span>' : text;
  }).join('');
  if (pos !== word.length) {
    throw GraphemeError('colorize-length-mismatch', '着色切片总长度与原词长度不一致：' + word, { word: word, pos: pos });
  }
  return out;
}

/* colorStrictWord(word, ctx) -> string：单个「可解码词」（词卡/tile/G2 积木态/
 * wordforge 词族/exam 保留测词等——这些位置的词按数据设计恒由本周已教字位组成）。
 * 分不出来是数据错误，直接把 segmentWord 的结构化错误原样抛出，不在这里吞
 * （方案 §3.3）。**判据**：这个位置的词是不是保证由本周已教字位（SOUNDS 的键）
 * 组成——是，才能用这条；不是，用下面的 colorLenientWord。 */
function colorStrictWord(word, ctx) {
  if (typeof word !== 'string') {
    throw GraphemeError('word-invalid', 'word 必须是字符串', { value: word });
  }
  return colorizeToken(word, ctx);
}

/* DEGRADABLE_ERROR_CODES：colorLenientWord 与 colorPlainText 共用的降级判据白名单
 * （M1 修复）。只有"这个词/片段本身分不出来"（segment-unknown/segment-ambiguous）
 * 才是「该降级」的情形；sounds-invalid/sound-type-invalid/内部实现的 TypeError 等
 * 是数据坏了或代码本身有 bug，裸 catch 会把这些也吞成"看起来正常的降级输出"，制造
 * 假象（2026-09-09 核实 critical 2 时真实踩过：ctx 构造错导致 TypeError，被裸 catch
 * 吞成"大小写全部保持"的假降级，险些据此驳回一条真 critical）。白名单外一律重抛。 */
var DEGRADABLE_ERROR_CODES = { 'segment-unknown': true, 'segment-ambiguous': true, 'colorize-non-ascii': true };

/* colorLenientWord(word, ctx) -> string：单个"不保证可解码的词"（里程碑 2 第 4b 步
 * 收口 critical 1 新增）。用于 SOUNDS[id].demo「放进单词里听」的展示性举例、G1
 * 干扰词/目标词反馈等——这些词是刻意选来展示某个音在真实单词里的样子，或用来训练
 * 耳朵辨音，本周字位表根本不保证能拼出它们（比如第一周只教 s/a 时 demo 里就有
 * sun/apple/snake）。分得出就像 colorStrictWord 一样着色；分不出（未知片段/歧义）
 * 按方案 §3.3「降级要换形态」原样转义输出，不抛——这是"举例词"的本质，不是数据错误。
 * 与 colorPlainText 的降级分支共享同一条白名单错误码判据（见该函数与 M1 的说明）：
 * 只吞 segment-unknown/segment-ambiguous，其余错误（数据形状错、内部缺陷）原样抛出。 */
function colorLenientWord(word, ctx) {
  if (typeof word !== 'string') {
    throw GraphemeError('word-invalid', 'word 必须是字符串', { value: word });
  }
  try {
    return colorizeToken(word, ctx);
  } catch (e) {
    if (e && DEGRADABLE_ERROR_CODES[e.code]) {
      return escapeHtmlText(word);
    }
    throw e;
  }
}

/* colorPlainText(text, ctx) -> string：含空格标点的整句（书名、书页正文）。
 * 按"保留分隔符地切词"（方案 §3.3）：用捕获组 split 出 [非词, 词, 非词, 词, ...]
 * 交替序列（偶数下标恒为非词分隔符，奇数下标恒为词，split 的固定语义，见下方
 * WORD_TOKEN_PATTERN 注释）。词 token 尝试严格分词着色，失败（含未知片段与歧义）
 * 一律降级为原样输出（转义后）——句子里出现的专有名词、语气词等不认识的片段，
 * 换的是渲染方式，不是删掉着色能力（方案 §3.3「降级要换形态」）。非词的每一段
 * （空格、标点）必须 HTML 转义后再拼回，不能假设分隔符天然安全。
 * 禁止对整句做严格分词——这正是本函数与 colorStrictWord 分开存在的原因。
 *
 * WORD_TOKEN_PATTERN 支持/不支持的边界（里程碑 2 第 4b 步收口 M3）：
 * 支持——纯字母词（大小写混合）、被空格/标点隔开的多个词。
 * 不支持——词内撇号缩写（don't/Nat's）与连字符复合词会被从撇号/连字符处切开，
 * 撇号/连字符本身与后半截各自当独立"非词"/"词"处理（比如 "don't" 会切成
 * "don" + "'" + "t"，"t" 会被单独尝试着色）。四周现有数据只含句点/逗号/引号，
 * 不撞到这条边界，但这是数据面的定时炸弹——W5 起若数据出现缩写或连字符词，
 * 必须先扩这条正则（比如 `/([A-Za-z]+(?:['’-][A-Za-z]+)*)/`，允许词内单个
 * 撇号/连字符再接字母），并补对应 fixture，不能假设未来数据仍然不撞。 */
var WORD_TOKEN_PATTERN = /([A-Za-z]+)/;
function colorPlainText(text, ctx) {
  if (typeof text !== 'string') {
    throw GraphemeError('word-invalid', 'text 必须是字符串', { value: text });
  }
  var parts = text.split(WORD_TOKEN_PATTERN);
  var out = '';
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    if (part === '') continue;
    var isWordToken = i % 2 === 1; // String#split 用捕获组时，奇数下标恒为捕获组命中的词
    if (!isWordToken) { out += escapeHtmlText(part); continue; }
    try {
      out += colorizeToken(part, ctx);
    } catch (e) {
      if (!e || !DEGRADABLE_ERROR_CODES[e.code]) throw e; // 数据坏/代码 bug：不降级，原样抛出
      out += escapeHtmlText(part); // 降级：分不出的词原样输出（转义后）
    }
  }
  return out;
}

/* colorRichText(html, ctx) -> string：受限富文本（允许 <b>/<span class="en">/<br>
 * 白名单标签的字段）。**本批（里程碑 2 第 4b 步）挂起，不实现**——它依赖"Node 侧
 * 怎么做 DOM 解析"这个尚未裁定的设计选择（方案 §5「Node 侧 DOM 解析」：本项目零
 * 外部依赖、Node 无原生 DOMParser，②-a 手写白名单片段解析器 vs ②-b 不走 DOM 改用
 * 两端共享的字符串扫描哪条路，属安全边界，按停机条款交给外审/用户裁定，2026-09-09
 * 已送审、结果未回）。四周现有数据的 line/title 实测都不含标签，42 个调用点里没有
 * 一处走这条路径（见 4b 收口报告「模板内字位展示来源清单」），所以本次不实现不阻塞
 * 任何现役消费点。裁定回来后在这里补白名单解析 + 只对文本节点着色的实现，
 * 判据：解析顺序固定为「先解析→再检查解析后的元素与属性→最后受控序列化输出」
 * （方案 §3.3 四审 M-7），白名单是完整结构不只是标签名（三审 M-8）。 */
function colorRichText(html, ctx) {
  throw GraphemeError(
    'rich-text-not-implemented',
    'colorRichText 尚未实现：Node 侧 DOM 解析方案（方案 §5「Node 侧 DOM 解析」）未裁定，' +
      '里程碑 2 第 4b 步按停机条款挂起本接口，见 graphemes.js 头注释与该函数上方说明',
    { html: html }
  );
}

/* validateSoundsSchema(sounds, options) -> Array<{code,id,message}>：SOUNDS 表的
 * 共享 schema 校验器（2026-09-09 外审 medium，四周迁移方案 §4 第 4b 行并入）。
 * 收集式返回全部问题而不是遇错即抛——check_data.js 的 ok(...) 消费模式需要拿到
 * "这个键有哪些问题"逐条报告，不能像 segmentWord 建索引前的 validateSoundsTable
 * 那样第一条不合法就中断（那个函数服务的是分词内部，两者用途不同、都保留）。
 * 现在 grapheme/非法字符集/遗留 L 字段这三类检测散落在 sounds_grapheme_adapter.js
 * （冲突/遗留检测，服务对象是"L→grapheme 迁移期适配"）与 check_data.js（内联的
 * `s.grapheme && s.ipa && ...` 真值检查）两处，同一份 SOUNDS 经不同入口得到不同
 * 严格程度的结论。本函数把"grapheme 字段是否合法"“ID 是否合法字位 ID”“是否仍有
 * 遗留自有键 L”这三条抽成共享判据，check_data.js／未来的生成器／审计工具共同调用；
 * L→grapheme 迁移期"两值不一致时报冲突、允许旧数据兜底派生"这类真正的旧数据派生
 * 逻辑不下放到这里——那是 sounds_grapheme_adapter.js 明确命名的 legacy 辅助职责，
 * 本函数只管"这份 sounds 现在合不合规"，不管"怎么把旧形态兼容成新形态"。
 * options.requireTeachingFields === true 时额外校验 check_data.js 现有的教学字段
 * 完整性（mem/cue/challenge/try/pass/how/warn/demo），供 check_data.js 复用同一遍
 * 遍历，不必再自己重写一份键存在性检查。 */
function validateSoundsSchema(sounds, options) {
  options = options || {};
  var issues = [];
  function issue(code, id, message) { issues.push({ code: code, id: id || null, message: message }); }
  if (Object.prototype.toString.call(sounds) !== '[object Object]') {
    issue('sounds-invalid', null, 'sounds 必须是普通映射对象');
    return issues;
  }
  /* L2 修复（2026-09-09 里程碑 2 第 4b 步收口）：与 assertSoundsShape 同一条判据，
   * 原型链上不得携带额外可枚举数据——本函数此前只做了 toString 品牌检查，缺这一层，
   * 与文档宣称的"共享判据"（同 segmentWord 内部 assertSoundsTable 的严格程度）不一致。 */
  for (var p = Object.getPrototypeOf(sounds); p !== null; p = Object.getPrototypeOf(p)) {
    if (Object.keys(p).length > 0) {
      issue('sounds-prototype-chain', null, 'sounds 的原型链上不得携带额外数据，请使用普通对象字面量或 Object.create(null)');
      break;
    }
  }
  var ids = Object.keys(sounds);
  ids.forEach(function (id) {
    var entry = sounds[id];
    if (!isValidGraphemeId(id)) {
      issue('sound-id-invalid', id, 'SOUNDS 的键不是合法字位 ID（须匹配 ^[a-z][a-z0-9_]*$）：' + id);
    }
    if (!entry || typeof entry !== 'object') {
      issue('grapheme-invalid', id, 'SOUNDS.' + id + ' 必须是对象');
      return;
    }
    var hasOwnGrapheme = Object.prototype.hasOwnProperty.call(entry, 'grapheme');
    if (!hasOwnGrapheme || typeof entry.grapheme !== 'string' || entry.grapheme.length === 0) {
      issue('grapheme-invalid', id, 'SOUNDS.' + id + '.grapheme 必须是非空字符串');
    } else if (!isAsciiAlpha(entry.grapheme)) {
      // M5（外审 medium，2026-09-09）：grapheme 字符集限定为 ASCII 字母，与
      // isValidSoundEntryGrapheme（segmentWord 内部硬校验）同一判据，理由见该函数
      // 上方注释——colorizeToken 按 grapheme 长度在原始 word 上切片，非 ASCII（组合
      // 字符/全角/部分大小写映射）会切错位置或长度不一致。
      issue('grapheme-invalid', id, 'SOUNDS.' + id + '.grapheme 必须只含 ASCII 字母 A-Z/a-z：' + entry.grapheme);
    }
    if (Object.prototype.hasOwnProperty.call(entry, 'L')) {
      issue('legacy-l-field', id, 'SOUNDS.' + id + ' 仍有遗留的自有键 L（4a 步应已收敛为 grapheme）');
    }
    if (options.requireTeachingFields) {
      if (!entry.ipa) issue('ipa-missing', id, 'SOUNDS.' + id + ' 缺 ipa');
      if (entry.type !== 'c' && entry.type !== 'v') issue('type-invalid', id, 'SOUNDS.' + id + ' 的 type 字段非法（须为 c 或 v）');
      var teachingFields = ['mem', 'cue', 'challenge', 'try', 'pass', 'how', 'warn'];
      teachingFields.forEach(function (f) {
        if (!entry[f]) issue('teaching-field-missing', id, 'SOUNDS.' + id + ' 缺教学字段 ' + f);
      });
      if (!Array.isArray(entry.demo)) issue('teaching-field-missing', id, 'SOUNDS.' + id + ' 缺教学字段 demo（须为数组）');
    }
  });
  return issues;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    segmentWord: segmentWord,
    surfaceOf: surfaceOf,
    graphemeLabel: graphemeLabel,
    soundType: soundType,
    assertIdList: assertIdList,
    isValidGraphemeId: isValidGraphemeId,
    assertValidGraphemeId: assertValidGraphemeId,
    escapeHtmlText: escapeHtmlText,
    escapeHtmlAttribute: escapeHtmlAttribute,
    encodeIdListAttribute: encodeIdListAttribute,
    normalizeWord: normalizeWord,
    colorStrictWord: colorStrictWord,
    colorLenientWord: colorLenientWord,
    colorPlainText: colorPlainText,
    colorRichText: colorRichText,
    validateSoundsSchema: validateSoundsSchema
  };
}
