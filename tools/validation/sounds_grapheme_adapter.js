/* 临时只读适配层 —— L → grapheme（里程碑 2 第 3 步专用）。
 *
 * ⚠️ 临时代码：第 4a 步「L → grapheme 收敛」完成后删除本文件及其全部调用点。
 * 届时四周 weekNN.data.js 的 SOUNDS 条目将直接带 grapheme 字段，本适配层不再需要。
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
 *   3. 同时容忍三种形态：只有 L / 只有 grapheme / 两者都有——见 withGraphemeFallback()。
 *      这样第 4a 步做完后，SOUNDS 条目变成"只有 grapheme"，本适配层依然透传不报错，
 *      S3 产出的差分测试与审计工具不需要跟着改。
 *   4. 配测试：tests/unit/test_migration_audit.js 用三种形态的合成表验证得到同一结果。
 */

/* withGraphemeFallback(sounds) -> 新对象：sounds 的浅拷贝，缺 grapheme 但有 L 的条目
 * 派生出 grapheme:=L；已有 grapheme 的条目原样保留（哪怕同时还带着 L，也不理会 L，
 * 因为 grapheme 才是权威字段——见规范 v2.0 §3「SOUNDS 单条」）。
 * 不修改传入对象及其内部条目对象，返回全新对象树的第一层（条目对象本身仅在需要派生时
 * 才浅拷贝，其余条目按引用复用，足够安全，因为调用方只读不写）。 */
function withGraphemeFallback(sounds) {
  if (sounds === null || typeof sounds !== 'object') return sounds;
  const out = {};
  for (const id of Object.keys(sounds)) {
    const entry = sounds[id];
    const hasGrapheme = entry && typeof entry === 'object' && typeof entry.grapheme === 'string' && entry.grapheme.length > 0;
    const hasLegacyL = entry && typeof entry === 'object' && typeof entry.L === 'string' && entry.L.length > 0;
    if (!hasGrapheme && hasLegacyL) {
      out[id] = Object.assign({}, entry, { grapheme: entry.L });
    } else {
      out[id] = entry;
    }
  }
  return out;
}

module.exports = { withGraphemeFallback };
