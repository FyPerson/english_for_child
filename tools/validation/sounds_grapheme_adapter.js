/* 只读适配层 —— L → grapheme（里程碑 2 第 3 步引入）。
 *
 * ⚠️（M6 修复，2026-09-09 里程碑 2 收口批）头部原写着"4a 步完成后删除本文件及其全部
 * 调用点"，但 4a 已完成而本文件与 4 个调用点都还在——**这条生命周期声明与现状矛盾**。
 * 现状是：冲突检测（grapheme 与 L 都存在但值不同）与"键存在但值非法"检测这两项能力
 * 仍有价值，不该删——它们是审计/生成器工具对"数据 schema 是否自洽"的独立校验，与
 * "要不要兜底派生"是两件事。真正有风险的是"L 键存在、grapheme 键完全缺失"时的
 * 兜底派生分支：`gen_segments.js` 会跑在副机将来新写的 `week05.data.js` 上，那里若
 * 手滑写成 `L:'ai'`（没有 grapheme），旧行为会**静默**派生出 grapheme 并让工具照常
 * 出建议——而 H3 的运行时门槛硬编码的来源清单又扫不到 W5 这类新文件（H3 已改成 glob
 * 发现，但门槛只在 CI 跑时才生效，人手滑写坏数据的当下不会立刻被拦），两个洞正好对齐。
 *
 * 现在的生命周期定位改为：**4a 后保留为冲突检测层**——默认不再从 L 派生兜底（键存在
 * grapheme 缺失时默认直接抛错，逼人把 grapheme 写全，而不是让适配层悄悄替你填上一个
 * 可能是笔误的值），只有显式传 `{ allowLegacyFallback: true }` 才启用旧的派生兜底
 * （给 migration_audit.js 这类"审的就是迁移前状态"的调用方用，见下方参数说明）。
 *

 * 背景（docs/里程碑2实施方案_20260908_v1.7.md 编码任务书「一个必须处理的依赖问题」）：
 * 真实 frontend/src/weeks/weekNN.data.js 的 SOUNDS 条目目前仍是 L 字段，而
 * frontend/src/shared/graphemes.js 的 segmentWord 要求 grapheme——直接把真实 SOUNDS
 * 喂给 segmentWord 会在 validateSoundsTable 里停在 grapheme-invalid。第 3 步（差分测试 +
 * 迁移前审计）需要在真实数据上跑 segmentWord，但第 4a 步的重命名还没做，所以在这里加一层
 * 只读适配，不碰任何数据文件。
 *
 * 处置要求（已拍板，见任务书）：
 *   1. 明确标注临时——见上。
 *   2. 不修改仓库里的任何数据文件——本文件只在读取时派生新对象，不做任何写操作。
 *   3. 同时容忍三种形态：只有 L / 只有 grapheme / 两者都有且一致——见 withGraphemeFallback()。
 *      这样第 4a 步做完后，SOUNDS 条目变成"只有 grapheme"，本适配层依然透传不报错，
 *      S3 产出的差分测试与审计工具不需要跟着改。
 *   4. 配测试：tests/unit/test_migration_audit.js 用三种形态的合成表验证得到同一结果，
 *      另配一条"两者都有但不一致"的冲突对负例，验证显式抛错。
 *
 * ⚠️ 「两者都有」只容忍值一致的情形。真实风险形态是别名派生：
 * week02.data.js:106 的 `SOUNDS.k = Object.assign({}, SOUNDS.c, { L:'k' })`——
 * 第 4a 步迁移时如果只改了 `SOUNDS.c` 本体（加上 grapheme:'c'）却忘了把这行派生也从
 * `{L:'k'}` 改成 `{grapheme:'k'}`，`Object.assign` 会先继承到 `SOUNDS.c` 的
 * grapheme:'c'，再被 `{L:'k'}` 盖出一个 grapheme:'c' + L:'k' 的条目——如果适配层这时
 * 仍然"有 grapheme 就不理会 L"，会静默把 k 积木显示成 'c'，没有任何信号。所以"两者都有
 * 但值不同"必须显式失败，不能悄悄选 grapheme——这不是"L 更权威"，而是"两个字段互相矛盾
 * 时，适配层没有能力替调用方仲裁哪个对，仲裁应该由人来做"。
 *
 * ⚠️（codex high 修复）「键存在但值非法」不等于「键不存在」，两者必须分开判断。
 * 上一版的 hasGrapheme 只按"值是不是非空字符串"判——于是条目若显式写了
 * `grapheme: 123` 或 `grapheme: ''`，同时又有合法的 `L: 'a'`，会被当成"grapheme 键
 * 不存在"走进兜底分支，静默派生出 `grapheme: 'a'`，把本该暴露的 schema 错误（谁把
 * grapheme 写成了数字/空串）盖了过去。现在用 `Object.prototype.hasOwnProperty.call`
 * 先分离"键是否存在"与"值是否合法"：**只有 grapheme 键完全不存在时，才允许用 L 派生
 * 兜底**；键存在但值非法，必须显式失败，不能被"缺失兜底"的逻辑捎带覆盖过去。
 */

/* withGraphemeFallback(sounds, options) -> 新对象：sounds 的浅拷贝。
 * grapheme 键存在且合法（或没有 L）时原样保留——grapheme 才是权威字段（见规范 v2.0
 * §3「SOUNDS 单条」）。
 * 三种情况显式抛错，不静默：① grapheme 键存在但值非法（不是非空字符串）——不允许被
 * L 兜底覆盖过去；② grapheme 与 L 都存在且都合法，但值不同——多半是别名派生只改了
 * 基类没改派生行，适配层不替你选，由人核实；③（M6 新增）grapheme 键完全缺失、L 合法，
 * 但调用方没有显式打开 `options.allowLegacyFallback`——4a 收敛后本仓真实数据已不该
 * 再出现这种形态，默认直接报错逼人把 grapheme 写全，不悄悄用 L 派生一个可能是笔误的
 * 值（H3/M6 联合要挡的场景：gen_segments.js 跑在 W5 手滑写成 `L:'ai'` 缺 grapheme 的
 * 数据上，静默派生会让工具照常出建议，人毫无感知）。
 * `options.allowLegacyFallback === true` 时保留旧行为：grapheme 键完全缺失、且 L 合法
 * 时派生 grapheme:=L——只给"审的就是迁移前状态"的调用方用（如 migration_audit.js，
 * 它的测试还在用只有 L 的合成 SOUNDS 常量核对适配层三态兼容）。
 * 不修改传入对象及其内部条目对象，返回全新对象树的第一层（条目对象本身仅在需要派生时
 * 才浅拷贝，其余条目按引用复用，足够安全，因为调用方只读不写）。 */
function withGraphemeFallback(sounds, options) {
  if (sounds === null || typeof sounds !== 'object') return sounds;
  const allowLegacyFallback = !!(options && options.allowLegacyFallback === true);
  const out = {};
  for (const id of Object.keys(sounds)) {
    const entry = sounds[id];
    const isEntryObject = entry && typeof entry === 'object';
    const hasOwnGrapheme = isEntryObject && Object.prototype.hasOwnProperty.call(entry, 'grapheme');
    const hasOwnL = isEntryObject && Object.prototype.hasOwnProperty.call(entry, 'L');
    const graphemeValid = hasOwnGrapheme && typeof entry.grapheme === 'string' && entry.grapheme.length > 0;
    const lValid = hasOwnL && typeof entry.L === 'string' && entry.L.length > 0;

    if (hasOwnGrapheme && !graphemeValid) {
      const err = new Error(
        'sounds_grapheme_adapter: SOUNDS.' + id + ' 的 grapheme 字段存在但不是非空字符串（' +
        JSON.stringify(entry.grapheme) + '）——键存在但值非法时不允许用 L 兜底覆盖，请先修正 grapheme'
      );
      err.code = 'grapheme-field-invalid';
      err.id = id;
      throw err;
    }
    if (graphemeValid && lValid && entry.grapheme !== entry.L) {
      const err = new Error(
        'sounds_grapheme_adapter: SOUNDS.' + id + ' 的 grapheme("' + entry.grapheme + '") 与 L("' + entry.L +
        '")不一致——很可能是别名派生（Object.assign）在 L→grapheme 迁移过程中只改了基类' +
        '没改派生行，两个字段互相矛盾时适配层不替你选，请人工核实后只保留正确的 grapheme'
      );
      err.code = 'grapheme-l-conflict';
      err.id = id;
      throw err;
    }
    if (!hasOwnGrapheme && lValid && !allowLegacyFallback) {
      const err = new Error(
        'sounds_grapheme_adapter: SOUNDS.' + id + ' 只有 L（"' + entry.L + '"）没有 grapheme——' +
        '4a 收敛后默认不再从 L 静默派生 grapheme，请直接把 grapheme 字段写全；' +
        '如确实需要兼容迁移前的旧数据，显式传 { allowLegacyFallback: true }'
      );
      err.code = 'grapheme-missing-legacy-fallback-disabled';
      err.id = id;
      throw err;
    }
    if (!hasOwnGrapheme && lValid) {
      out[id] = Object.assign({}, entry, { grapheme: entry.L });
    } else {
      out[id] = entry;
    }
  }
  return out;
}

module.exports = { withGraphemeFallback };
