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
 * {week, newPatterns} 数组。真正去读 frontend/src/weeks/weekNN.data.js 与
 * project.json 的是 gatherWeekRecordsUpTo，这样计算逻辑本身可以用独立 fixture
 * 反复验证、不受仓库现状影响（方案 §2.4 明文要求）。
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

/* computeTeachingOrder(weekRecords) -> string[]
 * weekRecords: Array<{week:number, newPatterns:string[]}>，顺序任意（本函数自己按
 * week 排序），但周号必须唯一、且从最小周号起连续无缺口，否则抛错。 */
function computeTeachingOrder(weekRecords) {
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
  const sorted = weekRecords.slice().sort((a, b) => a.week - b.week);
  const minWeek = sorted[0].week;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].week !== minWeek + i) {
      throw TeachingOrderError('teaching-order-non-contiguous', '周号必须连续，不满足即失败', { weeks: sorted.map(r => r.week) });
    }
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
function gatherWeekRecordsUpTo(currentBox, currentWeek) {
  const projectPath = path.join(REPO, 'project.json');
  const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
  const weeks = (project.weeks || []).filter(w => w <= currentWeek).sort((a, b) => a - b);
  if (!weeks.includes(currentWeek)) {
    throw TeachingOrderError('teaching-order-week-not-in-project',
      `project.json 的 weeks 列表不含当前周 ${currentWeek}`, { week: currentWeek, projectWeeks: project.weeks });
  }
  return weeks.map(w => {
    if (w === currentWeek) {
      return { week: w, newPatterns: (currentBox.META && currentBox.META.newPatterns) || [] };
    }
    const file = path.join(REPO, 'frontend', 'src', 'weeks', `week${String(w).padStart(2, '0')}.data.js`);
    const raw = fs.readFileSync(file, 'utf8');
    const box = loadData(raw, false);
    return { week: w, newPatterns: (box.META && box.META.newPatterns) || [] };
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

module.exports = { computeTeachingOrder, gatherWeekRecordsUpTo, expectedWallOrder, diffWallLetters, setsEqual, TeachingOrderError };
