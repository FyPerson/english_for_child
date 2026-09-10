/* 独立教学顺序真相源（里程碑 2 第 7 步，DATA-WALL-01）。
 *
 * 契约来源：
 *   docs/里程碑2实施方案_20260908_v1.7.md §2.4「墙的顺序需要独立真相源」
 *     真相源定义为：按 project.json 的周序，依次累计各周 newPatterns，同周内按
 *     newPatterns 自身顺序追加。`DATA-WALL-01` 拿 wallLetters 与这个独立序列比，
 *     而不是与 Object.keys(SOUNDS) 比。
 *   同节「取数规则写死」：
 *     - 计算函数是纯函数，输入为按周排序的规范化周记录数组，不直接读工作树。
 *     - 当前被校验的文件替换仓库里的同周记录，不重复计入（调用方职责，见
 *       gatherWeekRecordsUpTo）。
 *     - 周号必须连续且唯一，不满足即失败。
 *     - 追加时重复即错误，不是静默去重。
 *     - 别名派生键（k 这类）必须出现在某周的 newPatterns 里，与本体同周按数组顺序
 *       表达（六审 M-6 拍板）。
 *
 * computeTeachingOrder 本身不读文件系统——它只吃调用方已经组装好的
 * {week, newPatterns} 数组，以及调用方显式传入的 expectedWeeks（源码树校验：取自
 * project.json 的 weeks 列表过滤到 <= 当前周，不是任何构建产物，见
 * getExpectedWeeksUpTo）。真正去读 frontend/src/weeks/weekNN.data.js 与
 * project.json 的是 gatherWeekRecordsUpTo/getExpectedWeeksUpTo，这样计算逻辑本身
 * 可以用独立 fixture 反复验证、不受仓库现状影响（方案 §2.4 明文要求）。
 *
 * M6（外审 medium，2026-09-10）：改前"周号连续"只按 `sorted[i].week === minWeek + i`
 * 相对第一条记录自身的最小周号判断——`computeTeachingOrder([{week:2},{week:3}])`
 * 会直接通过，因为 2/3 相对彼此是连续的，但这不是调用方真正想要的"从 week 1 起
 * 连续到当前周"，会静默漏掉缺开头周（比如漏了 week 1）这种情况。改为要求调用方
 * 显式传入 expectedWeeks（通常取自 project.json 的 weeks，过滤到 <= 当前周），
 * 用记录周号集合与 expectedWeeks 做精确前缀匹配，而不是只看记录内部彼此是否连续。
 */
const fs = require('fs');
const path = require('path');
const { loadData } = require('./load_data');

const REPO = path.resolve(__dirname, '..', '..');

function TeachingOrderError(code, message, details) {
  const err = new Error(message);
  err.name = 'TeachingOrderError';
  err.code = code;
  if (details) Object.keys(details).forEach(k => { err[k] = details[k]; });
  return err;
}

/* computeTeachingOrder(weekRecords, expectedWeeks) -> string[]
 * weekRecords: Array<{week:number, newPatterns:string[]}>，顺序任意（本函数自己按
 * week 排序），但周号必须唯一。
 * expectedWeeks: number[]，调用方显式传入的预期周序（通常来自
 * getExpectedWeeksUpTo(currentWeek)，即 project.json 的 weeks 过滤到 <= 当前周）——
 * 排序后必须与 weekRecords 的周号集合逐项相等，缺开头周、缺中间周、多余周号都会
 * 报错（M6，见上方头注释）。 */
function computeTeachingOrder(weekRecords, expectedWeeks) {
  if (!Array.isArray(weekRecords) || weekRecords.length === 0) {
    throw TeachingOrderError('teaching-order-empty', 'weekRecords 必须是非空数组', { value: weekRecords });
  }
  weekRecords.forEach((rec, i) => {
    if (!rec || typeof rec !== 'object') {
      throw TeachingOrderError('teaching-order-invalid-record', `weekRecords[${i}] 必须是对象`, { index: i, value: rec });
    }
    if (typeof rec.week !== 'number' || !Number.isInteger(rec.week) || rec.week <= 0) {
      throw TeachingOrderError('teaching-order-invalid-week', `weekRecords[${i}].week 必须是正整数`, { index: i, value: rec.week });
    }
  });
  const weeks = weekRecords.map(r => r.week);
  if (new Set(weeks).size !== weeks.length) {
    throw TeachingOrderError('teaching-order-duplicate-week', '周号必须唯一，weekRecords 含重复周号', { weeks: weeks });
  }
  // expectedWeeks 的合法性检查放在 weekRecords 自身结构校验之后：weekRecords 本身
  // 是主输入，先把它的结构问题（非对象/周号非法/重复）报清楚，再检查这个新增的
  // 辅助参数，避免"忘传 expectedWeeks"掩盖了 weekRecords 自身更基础的结构错误。
  if (!Array.isArray(expectedWeeks) || expectedWeeks.length === 0 ||
      !expectedWeeks.every(w => typeof w === 'number' && Number.isInteger(w) && w > 0)) {
    throw TeachingOrderError('teaching-order-expected-weeks-invalid',
      'expectedWeeks 必须是非空的正整数数组（调用方需显式传入预期周序，通常取自 project.json 的 weeks 过滤到 <= 当前周）',
      { value: expectedWeeks });
  }
  const sorted = weekRecords.slice().sort((a, b) => a.week - b.week);
  /* M6：不再只判断 weekRecords 内部彼此是否连续（那会漏掉"缺开头周"——比如只给
   * [{week:2},{week:3}] 相对彼此是连续的，但真正应该从 week 1 起）。改为与调用方
   * 显式传入的 expectedWeeks 做精确匹配：排序后长度、每一项都必须逐一相等。 */
  const actualWeeks = sorted.map(r => r.week);
  const expectedSorted = expectedWeeks.slice().sort((a, b) => a - b);
  const weekSetMatches = actualWeeks.length === expectedSorted.length &&
    actualWeeks.every((w, i) => w === expectedSorted[i]);
  if (!weekSetMatches) {
    throw TeachingOrderError('teaching-order-week-set-mismatch',
      `weekRecords 的周号集合与预期周序不一致（缺开头周/缺中间周/多余周号都会触发这条）。期望：[${expectedSorted.join(',')}]，实际：[${actualWeeks.join(',')}]`,
      { expected: expectedSorted, actual: actualWeeks });
  }
  const order = [];
  const seen = new Set();
  sorted.forEach(rec => {
    if (!Array.isArray(rec.newPatterns)) {
      throw TeachingOrderError('teaching-order-invalid-patterns', `week ${rec.week} 的 newPatterns 必须是数组`, { week: rec.week, value: rec.newPatterns });
    }
    rec.newPatterns.forEach(id => {
      if (typeof id !== 'string' || !id) {
        throw TeachingOrderError('teaching-order-invalid-id', `week ${rec.week} 的 newPatterns 含非法元素`, { week: rec.week, value: id });
      }
      if (seen.has(id)) {
        throw TeachingOrderError('teaching-order-duplicate-id',
          `字位 "${id}" 在累计教学顺序里重复出现（追加到 week ${rec.week} 时已存在）`, { week: rec.week, id: id });
      }
      seen.add(id);
      order.push(id);
    });
  });
  return order;
}

/* gatherWeekRecordsUpTo(currentBox, currentWeek) -> Array<{week, newPatterns}>
 *
 * 按 project.json 的 weeks 列表，取全部 week <= currentWeek 的周记录：
 *   - week === currentWeek：用调用方已经加载好的 currentBox.META（可能是正在校验
 *     的候选文件，未必已提交），不重复去读仓库里的同周文件——方案 §2.4「当前被
 *     校验的文件替换仓库里的同周记录，不重复计入」。
 *   - 其余周：从 frontend/src/weeks/weekNN.data.js 读取仓库现状。
 *
 * 这是本模块唯一读工作树的函数，computeTeachingOrder 本身保持纯函数。 */
/* extractNewPatterns(box, week, file)：从已加载的周数据 box 里取出 newPatterns，
 * 缺失或非数组一律结构化报错（M5，外审 medium，2026-09-10）——改前
 * `(box.META && box.META.newPatterns) || []` 把"字段缺失"悄悄当成了合法空数组，
 * 与规范"newPatterns 恒是数组，教新字位的周非空、否则显式空数组"的口径矛盾：
 * 数据层漏写这个字段（比如 META 里根本没有 newPatterns 键）应该被当结构性错误
 * 报出来，而不是被这条兜底悄悄纠正成"这周什么都没新教"再继续算下去——那样算出
 * 来的独立教学顺序会静默漏掉这一周本该累计的字位，且不会有任何报错提示问题出在
 * 哪一周、哪个文件。空数组现在只能由 META 里显式写 `newPatterns: []` 表达。 */
function extractNewPatterns(box, week, file) {
  const newPatterns = box && box.META ? box.META.newPatterns : undefined;
  if (!Array.isArray(newPatterns)) {
    throw TeachingOrderError('teaching-order-missing-patterns',
      `week ${week} 的 META.newPatterns 缺失或不是数组（file: ${file}）`,
      { week: week, file: file, value: newPatterns });
  }
  return newPatterns;
}

/* getExpectedWeeksUpTo(currentWeek) -> number[]（M6，外审 medium，2026-09-10）
 *
 * computeTeachingOrder 现在要求调用方显式传入"预期周序"（见该函数头注释），这里
 * 提供从源码树（project.json 的 weeks 列表，不是任何构建产物）取这份预期周序的
 * 唯一实现，供 gatherWeekRecordsUpTo 与调用方（check_data.js）共用，避免各自重复
 * 一份"filter(w => w <= currentWeek).sort(...)"逻辑而彼此漂移。 */
function getExpectedWeeksUpTo(currentWeek) {
  const projectPath = path.join(REPO, 'project.json');
  const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
  const weeks = (project.weeks || []).filter(w => w <= currentWeek).sort((a, b) => a - b);
  if (!weeks.includes(currentWeek)) {
    throw TeachingOrderError('teaching-order-week-not-in-project',
      `project.json 的 weeks 列表不含当前周 ${currentWeek}`, { week: currentWeek, projectWeeks: project.weeks });
  }
  return weeks;
}

function gatherWeekRecordsUpTo(currentBox, currentWeek) {
  const weeks = getExpectedWeeksUpTo(currentWeek);
  return weeks.map(w => {
    if (w === currentWeek) {
      // 当前被校验的文件——方案 §2.4「当前被校验的文件替换仓库里的同周记录，不
      // 重复计入」，这里没有独立磁盘路径，用固定标签让报错信息仍能定位到"是当前
      // 这一份"而不是仓库里的同周文件。
      return { week: w, newPatterns: extractNewPatterns(currentBox, w, '(当前被校验的文件)') };
    }
    const file = path.join(REPO, 'frontend', 'src', 'weeks', `week${String(w).padStart(2, '0')}.data.js`);
    /* 文件不存在 / 读取失败 / 解析失败三类分别包成带 week/file/cause 的结构化
     * 错误（M5）——改前 fs.readFileSync 与 loadData 的原生异常（ENOENT、语法错误
     * 等）未经包装直接冒出去，调用方（check_data.js 的 try/catch）只能报出一句
     * "无法计算独立教学顺序真相源"，看不出是哪一周、哪个文件、因为什么原因失败。 */
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (e) {
      throw TeachingOrderError('teaching-order-file-read-failed',
        `week ${w} 的历史周数据文件读取失败（file: ${file}）：${e.message}`,
        { week: w, file: file, cause: e });
    }
    let box;
    try {
      box = loadData(raw, false);
    } catch (e) {
      throw TeachingOrderError('teaching-order-file-parse-failed',
        `week ${w} 的历史周数据文件解析失败（file: ${file}）：${e.message}`,
        { week: w, file: file, cause: e });
    }
    /* M1（外审 medium，2026-09-10）：gatherWeekRecordsUpTo 与 getExpectedWeeksUpTo
     * 同源于 project.json 的 weeks 列表，历史记录的 week 字段改前直接写成"这份记录
     * 是从 week0N.data.js 这个文件名读出来的"里的 N，从未回头校验文件内容自己
     * 声明的 box.META.week 是否也等于 N——如果某份历史文件被误放错了文件名（比如
     * week03.data.js 里的 META.week 手滑写成了 2），这里会把它的 newPatterns 悄悄
     * 计入"week 3"的累计教学顺序，教学顺序真相源本身就会算错，且没有任何信号
     * 提示错在哪。这里补一道断言：文件内容自称的周次必须与文件名对应的周次一致，
     * 不等就抛结构化错误，带上 file/expected（文件名对应的周次）/actual（文件内容
     * 自称的周次），不静默信任文件名。
     *
     * M3（轮 D 复审，外审 medium，2026-09-10）：改前 `box.META && box.META.week !== w`
     * 用 `&&` 短路——`box.META` 本身缺失（falsy：undefined/null）时整个条件恒为
     * false，不会抛错，会带着一个没有 META 的 box 悄悄往下走进
     * `extractNewPatterns(box, w, file)`，那里如果也不做防御性检查就会在别处才
     * 崩溃（或者更糟：静默把这份坏数据当空记录处理）。同时 `!== w` 只在类型不同或
     * 值不同时为真——`box.META.week` 若是非整数（比如字符串 "3"、浮点数 3.5、
     * NaN）时，`"3" !== 3` 这类比较本身能查出类型不对，但错误信息里的"与文件名
     * 对应的周次不一致"这句措辞并不准确描述"周次字段本身不是合法整数"这类问题。
     * 改法：拆成三段独立判断，各自给出准确措辞——① META 整体缺失；② week 字段
     * 不是合法正整数；③ 都合法但与文件名周次不相等——全部复用同一个错误码
     * `teaching-order-week-mismatch`（调用方按 code 分支处理的逻辑不用跟着改），
     * 但 message 精确描述具体是哪一种情形，不再笼统地都说"不一致"。
     *
     * M3（轮 D 复审第三轮，外审 medium，2026-09-10）：上一版②的判据只查
     * `typeof === 'number' && Number.isInteger`，没有排除 `week <= 0`（0、负数）
     * 这类"是数字、是整数，但不是合法周次"的情形——0/-1 会被这条判据放过，只能
     * 依赖③"与文件名周次不相等"这条巧合兜底（文件名对应的 w 恒为正整数，
     * 0/-1 几乎必然不等于它），报出的错误信息却说成"周次不一致"，不是"周次本身
     * 不合法"，措辞不准确。改为 `typeof week === 'number' && Number.isInteger(week)
     * && week > 0`，让②真正覆盖"数字但不是合法正整数"的全部情形（0/负数/浮点数/
     * NaN/非 number 类型），不再依赖与 w 恰好不等这个巧合。 */
    if (!box.META) {
      throw TeachingOrderError('teaching-order-week-mismatch',
        `week ${w} 的历史周数据文件（file: ${file}）缺少 META 声明，无法确认它自称的周次`,
        { week: w, file: file, expected: w, actual: undefined });
    }
    if (!(typeof box.META.week === 'number' && Number.isInteger(box.META.week) && box.META.week > 0)) {
      throw TeachingOrderError('teaching-order-week-mismatch',
        `week ${w} 的历史周数据文件（file: ${file}）的 META.week 不是合法正整数，实际：${JSON.stringify(box.META.week)}`,
        { week: w, file: file, expected: w, actual: box.META.week });
    }
    if (box.META.week !== w) {
      throw TeachingOrderError('teaching-order-week-mismatch',
        `week ${w} 的历史周数据文件（file: ${file}）自称的 META.week 是 ${box.META.week}，与文件名对应的周次不一致`,
        { week: w, file: file, expected: w, actual: box.META.week });
    }
    return { week: w, newPatterns: extractNewPatterns(box, w, file) };
  });
}

/* expectedWallOrder(teachingOrder, sounds) -> string[]：DATA-WALL-01 断言①的比较
 * 目标——独立教学顺序序列，过滤 displayOnWall !== false 后的结果（规范 v2.0 §3
 * 「点亮墙与首教日」：只有显式标 displayOnWall:false 的记录不上墙，其余"凡是有独立
 * 字位 ID 与 grapheme 的记录一律上墙"）。sounds[id] 缺失时按"未显式声明"处理，
 * 默认上墙（不因数据缺一条 SOUNDS 记录就顺带吞掉一条墙断言的失败信号——那类缺失
 * 应该在别处报错，不该在这里被静默过滤掉）。 */
function expectedWallOrder(teachingOrder, sounds) {
  return teachingOrder.filter(id => !sounds[id] || sounds[id].displayOnWall !== false);
}

/* diffWallLetters(actualIds, expectedOrder) -> {missing, extra, duplicates, orderMatches}
 * 四类独立诊断，互不覆盖（方案 §5「墙」行：「顺序、缺项、额外项、重复项都查」）：
 *   - duplicates：actualIds 里出现次数 > 1 的 ID（与是否在 expectedOrder 里无关）。
 *   - missing：expectedOrder 里有、actualIds 里没有的 ID（集合意义）。
 *   - extra：actualIds 里有、expectedOrder 里没有的 ID（集合意义）。
 *   - orderMatches：仅当没有 missing/extra/duplicates 时才有意义——两个数组长度
 *     相等且逐位相同。 */
function diffWallLetters(actualIds, expectedOrder) {
  const expectedSet = new Set(expectedOrder);
  const actualSet = new Set(actualIds);
  const seen = new Set();
  const duplicates = [];
  actualIds.forEach(id => {
    if (seen.has(id)) { if (!duplicates.includes(id)) duplicates.push(id); }
    else seen.add(id);
  });
  const missing = expectedOrder.filter(id => !actualSet.has(id));
  const extra = actualIds.filter(id => !expectedSet.has(id));
  const orderMatches = missing.length === 0 && extra.length === 0 && duplicates.length === 0 &&
    actualIds.length === expectedOrder.length && actualIds.every((id, i) => id === expectedOrder[i]);
  return { missing: missing, extra: extra, duplicates: duplicates, orderMatches: orderMatches };
}

/* setsEqual(a, b) -> boolean：DATA-WALL-01 断言②（FIRST_TEACH_DAY 的键集合与
 * newPatterns 完全相等）用的纯集合相等判据——不比较顺序、不比较重复次数，两个
 * 输入都先经 Set 归一。 */
function setsEqual(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const x of sa) { if (!sb.has(x)) return false; }
  return true;
}

module.exports = { computeTeachingOrder, gatherWeekRecordsUpTo, getExpectedWeeksUpTo, expectedWallOrder, diffWallLetters, setsEqual, TeachingOrderError };
