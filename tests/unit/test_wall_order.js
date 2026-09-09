/* 里程碑 2 第 7 步：独立教学顺序真相源（DATA-WALL-01）单测。
 *
 * 契约来源：docs/里程碑2实施方案_20260908_v1.7.md §2.4「墙的顺序需要独立真相源」
 *          §5「墙」行：三条集合与顺序断言 + 六个失败 fixture（缺项/额外项/乱序/
 *          重复项/displayOnWall:false/键与 newPatterns 不等）。
 *
 * 覆盖面：
 *   ① computeTeachingOrder 纯函数：合法累计、周号非法/重复/不连续、newPatterns
 *      非法、字位重复、输入顺序不影响结果（内部自己按周排序）。
 *   ② gatherWeekRecordsUpTo：与真实 project.json + frontend/src/weeks/week0N.data.js
 *      的集成——用真实数据验证端到端累计结果；并证明"当前被校验的文件替换仓库里的
 *      同周记录，不重复计入"（方案 §2.4 取数规则）。
 *   ③ expectedWallOrder：displayOnWall:false 过滤（六个失败 fixture 之一的正面用途——
 *      证明它能正确排除，配合 diffWallLetters 在 ④ 里验证"错误地把它包含进 wallLetters"
 *      会被判 extra）。
 *   ④ diffWallLetters：缺项 / 额外项 / 重复项 / 乱序 四个失败 fixture + 一个全部正确
 *      的 pass 用例。
 *   ⑤ setsEqual：FIRST_TEACH_DAY 键集合与 newPatterns 不等 这个失败 fixture（第六个）
 *      + 一个匹配的 pass 用例。
 *   ⑥ 改坏副本证明会红（项目纪律）：不只测试纯函数，另外走真实 CLI 入口
 *      （node tools/validation/check_data.js <文件>），证明 check_data.js §⑤ 的
 *      接线本身会因为墙顺序被打乱而失败——纯函数测试证明"逻辑对不对"，这里证明
 *      "接线对不对"，两者是不同的证明力（同 test_check_data_sounds_schema_global.py
 *      的既有做法）。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const {
  computeTeachingOrder, gatherWeekRecordsUpTo, expectedWallOrder, diffWallLetters, setsEqual, TeachingOrderError
} = require('../../tools/validation/wall_order');

const ROOT = path.resolve(__dirname, '..', '..');

/* sameRealm(v)：load_data.js 内部用 vm.runInNewContext 求值周数据声明（同
 * test_synthetic_ai_integration.js 已记录的已知陷阱），gatherWeekRecordsUpTo 读取
 * 非当前周时经同一条路径，返回的数组/对象因此来自另一个 vm realm——
 * assert.deepEqual（node:assert/strict 下等价于 deepStrictEqual）会因为
 * [[Prototype]] 不同而误判"不相等"，即便结构完全一致。落回同一个 realm 的纯
 * 对象/数组后再比较，绕开原型陷阱，不放松"结构必须逐项一致"这条判据本身。 */
function sameRealm(v) { return JSON.parse(JSON.stringify(v)); }

function assertThrows(fn, code, label) {
  let caught = null;
  try { fn(); } catch (e) { caught = e; }
  assert(caught, label + ': expected to throw, did not');
  assert.equal(caught.code, code, `${label}: expected code ${code}, got ${caught.code}（${caught.message}）`);
}

// ============================================================================
// ① computeTeachingOrder
// ============================================================================
{
  const order = computeTeachingOrder([
    { week: 2, newPatterns: ['c', 'k'] },
    { week: 1, newPatterns: ['s', 'a'] },
    { week: 3, newPatterns: ['g'] }
  ]);
  assert.deepEqual(order, ['s', 'a', 'c', 'k', 'g'],
    'computeTeachingOrder 应按周号排序后累计，不受输入数组本身顺序影响，同周内按 newPatterns 自身顺序追加');
  console.log('PASS wall_order computeTeachingOrder：三周乱序输入按周号排序后正确累计');
}
assertThrows(() => computeTeachingOrder([]), 'teaching-order-empty', 'computeTeachingOrder 空数组');
assertThrows(() => computeTeachingOrder([{ week: 0, newPatterns: [] }]), 'teaching-order-invalid-week', 'computeTeachingOrder week=0');
assertThrows(() => computeTeachingOrder([{ week: 1.5, newPatterns: [] }]), 'teaching-order-invalid-week', 'computeTeachingOrder week 非整数');
assertThrows(() => computeTeachingOrder([{ week: 1, newPatterns: [] }, { week: 1, newPatterns: [] }]),
  'teaching-order-duplicate-week', 'computeTeachingOrder 重复周号');
assertThrows(() => computeTeachingOrder([{ week: 1, newPatterns: [] }, { week: 3, newPatterns: [] }]),
  'teaching-order-non-contiguous', 'computeTeachingOrder 周号不连续（缺 2）');
assertThrows(() => computeTeachingOrder([{ week: 1, newPatterns: ['a'] }, { week: 2, newPatterns: ['a'] }]),
  'teaching-order-duplicate-id', 'computeTeachingOrder 字位跨周重复');
assertThrows(() => computeTeachingOrder([{ week: 1, newPatterns: ['a', 'a'] }]),
  'teaching-order-duplicate-id', 'computeTeachingOrder 字位同周内重复');
assertThrows(() => computeTeachingOrder([{ week: 1, newPatterns: 'ai' }]),
  'teaching-order-invalid-patterns', 'computeTeachingOrder newPatterns 非数组');
assertThrows(() => computeTeachingOrder([{ week: 1, newPatterns: [1] }]),
  'teaching-order-invalid-id', 'computeTeachingOrder newPatterns 元素非字符串');
console.log('PASS wall_order computeTeachingOrder：8 类非法输入（空/周号非法/重复周/不连续/跨周重复字位/同周重复字位/patterns 非数组/元素非字符串）均正确抛出对应错误码');

// ============================================================================
// ② gatherWeekRecordsUpTo：与真实 project.json + frontend/src/weeks/week0N.data.js 集成
// ============================================================================
{
  // 用一个与真实 week02.data.js 不同的 newPatterns 构造 currentBox，验证「当前被校验的
  // 文件替换仓库里的同周记录，不重复计入」（方案 §2.4 取数规则第 2 条）——如果实现
  // 错误地又去读了一遍仓库里的 week02.data.js，这里会拿到真实值 ['c','k','e','h','r','m','d']
  // 而不是下面构造的哨兵值，断言会失败。
  const sentinelBox = { META: { week: 2, newPatterns: ['__sentinel__'] } };
  const records = gatherWeekRecordsUpTo(sentinelBox, 2);
  assert.deepEqual(records.map(r => r.week), [1, 2], 'gatherWeekRecordsUpTo(week=2) 应返回 week 1 与 2 两条记录');
  const w1 = records.find(r => r.week === 1);
  const w2 = records.find(r => r.week === 2);
  assert.deepEqual(sameRealm(w1.newPatterns), ['s', 'a', 't', 'i', 'p', 'n'],
    'week 1（非当前周）应从仓库里的 frontend/src/weeks/week01.data.js 读取真实 newPatterns');
  assert.deepEqual(sameRealm(w2.newPatterns), ['__sentinel__'],
    '「当前被校验的文件替换仓库里的同周记录」：week 2（当前周）应使用调用方传入的 currentBox，' +
    '不应又去读仓库里 week02.data.js 的真实 newPatterns（那样会看到 c/k/e/h/r/m/d 而不是哨兵值）');
  console.log('PASS wall_order gatherWeekRecordsUpTo：当前周记录来自调用方 currentBox（不重复读仓库同周文件），其余周来自仓库真实数据');
}
{
  // 端到端用真实四周数据验证累计结果——不只是零散单测，这是对「真相源」本身在
  // 真实项目状态下的一次回归钉住。
  const box4 = { META: { week: 4, newPatterns: [] } };
  const order = computeTeachingOrder(gatherWeekRecordsUpTo(box4, 4));
  assert.deepEqual(order,
    ['s', 'a', 't', 'i', 'p', 'n', 'c', 'k', 'e', 'h', 'r', 'm', 'd', 'g', 'o', 'u', 'l', 'f', 'b'],
    '真实四周数据的累计教学顺序应为 19 个字位、按 W1→W2→W3 的 newPatterns 顺序依次追加（W4 不新增）');
  console.log('PASS wall_order 端到端：真实 project.json + 四周 data.js 累计出的教学顺序序列与四周 wallLetters 应有的内容一致（19 字位）');
}
assertThrows(() => gatherWeekRecordsUpTo({ META: { week: 99 } }, 99),
  'teaching-order-week-not-in-project', 'gatherWeekRecordsUpTo week 不在 project.json 里');
console.log('PASS wall_order gatherWeekRecordsUpTo：不在 project.json weeks 列表里的周号正确抛错');

// ============================================================================
// ③ expectedWallOrder：displayOnWall:false 过滤——第五个失败 fixture。
// 正面：displayOnWall:false 的字位被正确排除出预期序列。
// 失败 fixture 本体：数据错误地把一个 displayOnWall:false 的字位仍然放进了
// wallLetters（比如手误把它当成普通字位上墙）——expectedWallOrder 已经把它排除在
// "预期"之外，diffWallLetters 因此应把它判成 extra（wallLetters 里有、expected 里
// 没有），触发断言②「wallLetters 含独立教学顺序序列之外的额外字位」失败。
// ============================================================================
{
  const teachingOrder = ['a', 'b', 'c'];
  const sounds = { a: { grapheme: 'a' }, b: { grapheme: 'b', displayOnWall: false }, c: { grapheme: 'c' } };
  const expected = expectedWallOrder(teachingOrder, sounds);
  assert.deepEqual(expected, ['a', 'c'], 'expectedWallOrder 应排除 displayOnWall:false 的字位，其余字位（含未声明 displayOnWall 的）保留');
  console.log('PASS wall_order expectedWallOrder：displayOnWall:false 的字位被正确从预期上墙序列里排除');

  // fixture 5：displayOnWall:false——数据错误地把 'b'（displayOnWall:false）也塞进了
  // wallLetters，应被 diffWallLetters 判成 extra（wallLetters 比 expected 多出一项）。
  const wallWithHiddenSound = ['a', 'b', 'c'];
  const diff = diffWallLetters(wallWithHiddenSound, expected);
  assert.deepEqual(diff.extra, ['b'],
    'fixture「displayOnWall:false」：wallLetters 里出现了本应被排除的 displayOnWall:false 字位 "b"，应被判成 extra');
  assert.equal(diff.orderMatches, false, 'fixture「displayOnWall:false」：orderMatches 应为 false');
  console.log('PASS wall_order fixture「displayOnWall:false」：错误地把 displayOnWall:false 字位放进 wallLetters 后，diffWallLetters 正确将其判为 extra 失败');
}

// ============================================================================
// ④ diffWallLetters：缺项 / 额外项 / 重复项 / 乱序 四个失败 fixture + 一个 pass 用例
// ============================================================================
{
  const expected = ['a', 'b', 'c'];
  const passCase = diffWallLetters(['a', 'b', 'c'], expected);
  assert.deepEqual(passCase, { missing: [], extra: [], duplicates: [], orderMatches: true },
    'diffWallLetters：wallLetters 与期望序列完全一致时应四项诊断全空、orderMatches:true');

  // fixture 1：缺项——wallLetters 少了 'c'
  const missingCase = diffWallLetters(['a', 'b'], expected);
  assert.deepEqual(missingCase.missing, ['c'], 'fixture「缺项」：expected 里有、wallLetters 里没有的字位应出现在 missing');
  assert.equal(missingCase.orderMatches, false, 'fixture「缺项」：orderMatches 应为 false');

  // fixture 2：额外项——wallLetters 多了一个不在 expected 里的字位 'x'
  const extraCase = diffWallLetters(['a', 'b', 'c', 'x'], expected);
  assert.deepEqual(extraCase.extra, ['x'], 'fixture「额外项」：wallLetters 里有、expected 里没有的字位应出现在 extra');
  assert.equal(extraCase.orderMatches, false, 'fixture「额外项」：orderMatches 应为 false');

  // fixture 3：重复项——wallLetters 里 'a' 出现两次（集合仍完整，容易被误判成 pass，
  // 见 migration_audit.js 头注释里点名的同一类退化，DATA-WALL-01 断言必须独立查重复项）
  const duplicateCase = diffWallLetters(['a', 'a', 'b', 'c'], expected);
  assert.deepEqual(duplicateCase.duplicates, ['a'], 'fixture「重复项」：wallLetters 里出现次数 > 1 的字位应出现在 duplicates');
  assert.deepEqual(duplicateCase.missing, [], 'fixture「重复项」：集合本身不缺项（a/b/c 都在），missing 应为空');
  assert.deepEqual(duplicateCase.extra, [], 'fixture「重复项」：集合本身不多项，extra 应为空——重复项是独立于缺项/额外项的第三类问题');
  assert.equal(duplicateCase.orderMatches, false, 'fixture「重复项」：orderMatches 应为 false（长度已经和 expected 不等）');

  // fixture 4：乱序——集合完全一致，只是顺序不同
  const orderCase = diffWallLetters(['c', 'a', 'b'], expected);
  assert.deepEqual(orderCase.missing, [], 'fixture「乱序」：集合完整，missing 应为空');
  assert.deepEqual(orderCase.extra, [], 'fixture「乱序」：集合完整，extra 应为空');
  assert.deepEqual(orderCase.duplicates, [], 'fixture「乱序」：无重复项，duplicates 应为空');
  assert.equal(orderCase.orderMatches, false, 'fixture「乱序」：集合完整但顺序不同，orderMatches 应为 false——这是「顺序、缺项、额外项、重复项都查」里唯一只靠顺序本身判定的一类');

  console.log('PASS wall_order diffWallLetters：pass 用例 + 缺项/额外项/重复项/乱序 四个失败 fixture 各自独立诊断正确（互不覆盖）');
}

// ============================================================================
// ⑤ setsEqual：FIRST_TEACH_DAY 键集合与 newPatterns 不等（第六个失败 fixture）
// ============================================================================
{
  assert.equal(setsEqual(['a', 'b', 'c'], ['c', 'b', 'a']), true, 'setsEqual：顺序不同但集合相同应判相等');
  assert.equal(setsEqual(['a', 'b'], ['a', 'b', 'c']), false, 'fixture「FIRST_TEACH_DAY 键与 newPatterns 不等」（额外键）：应判不相等');
  assert.equal(setsEqual(['a', 'b', 'c'], ['a', 'b']), false, 'fixture「FIRST_TEACH_DAY 键与 newPatterns 不等」（缺键）：应判不相等');
  assert.equal(setsEqual([], []), true, 'setsEqual：两个空集合应判相等');
  console.log('PASS wall_order setsEqual：匹配/额外键/缺键 三种情形均正确判定（第六个失败 fixture 覆盖）');
}

// ============================================================================
// ⑥ 改坏副本证明会红：走真实 CLI（node tools/validation/check_data.js <文件>），
// 证明 check_data.js §⑤ 的接线本身会因为墙顺序被打乱而失败——不是只测纯函数。
// 用 tests/fixtures/week02-data.js 复制一份到临时文件，把 wallLetters 打乱顺序
// （集合不变，只改顺序），其余不动。
// ============================================================================
function runCheckData(targetPath) {
  try {
    const stdout = execFileSync('node', [path.join(ROOT, 'tools', 'validation', 'check_data.js'), targetPath],
      { cwd: ROOT, encoding: 'utf8' });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: (e.stdout || '') + (e.stderr || '') };
  }
}

{
  const fixturePath = path.join(ROOT, 'tests', 'fixtures', 'week02-data.js');
  const original = fs.readFileSync(fixturePath, 'utf8');

  // 先证明未改坏的 fixture 通过真实 CLI 是绿的（对称证明，不是只证明会红）。
  const before = runCheckData(fixturePath);
  assert.equal(before.code, 0, `改坏前：tests/fixtures/week02-data.js 走真实 check_data.js CLI 应通过，实际退出码 ${before.code}：${before.stdout.slice(-800)}`);

  // 打乱 wallLetters 顺序（集合完全不变，只调换前两项），验证真实 CLI 会因此失败，
  // 且失败信息指向墙顺序问题（不是被别的断言意外先挡住）。
  const needle = '"wallLetters": ["s","a","t","i","p","n","c","k","e","h","r","m","d"],';
  const occurrences = original.split(needle).length - 1;
  assert.equal(occurrences, 1, `破坏点定位失败：tests/fixtures/week02-data.js 里 "${needle}" 应恰好出现 1 次，实际 ${occurrences} 次——fixture 已漂移，需要重新核实破坏点`);
  const broken = original.replace(needle, '"wallLetters": ["a","s","t","i","p","n","c","k","e","h","r","m","d"],');
  assert.notEqual(broken, original, '破坏点替换未生效');

  const tempPath = path.join(os.tmpdir(), 'test_wall_order_broken_week02_' + process.pid + '.js');
  fs.writeFileSync(tempPath, broken, 'utf8');
  try {
    const after = runCheckData(tempPath);
    assert.notEqual(after.code, 0, '改坏后（wallLetters 顺序打乱）：真实 check_data.js CLI 应失败，实际退出码为 0');
    assert(/wallLetters 顺序与独立教学顺序序列.*不一致/.test(after.stdout),
      `改坏后应报出「wallLetters 顺序...不一致」的具体失败信息，实际输出末尾：${after.stdout.slice(-800)}`);
  } finally {
    fs.unlinkSync(tempPath);
  }
  console.log('PASS wall_order 改坏副本验证：tests/fixtures/week02-data.js 原样通过真实 check_data.js CLI（0 退出码），wallLetters 顺序打乱后同一 CLI 正确报「顺序...不一致」并非 0 退出——证明 check_data.js §⑤ 的接线本身有效，不是只测了纯函数');
}

console.log('PASS wall_order contract: computeTeachingOrder/gatherWeekRecordsUpTo/expectedWallOrder/diffWallLetters/setsEqual 全部按预期通过，六个失败 fixture（缺项/额外项/乱序/重复项/displayOnWall:false/键与newPatterns不等）与真实 CLI 接线证明均覆盖');
