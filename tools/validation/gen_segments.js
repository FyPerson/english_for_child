/* 里程碑 2 · P3③：W[词].segments 生成器（方案 §3.4，2026-09-09 用户拍板口径更正）。
 *
 * 背景：从 W5 起，本周新教的多字母字位若组成字母此前都已单独教过，则该周所有含该
 * 字形的词都必然多解（segmentWord 会抛 segment-ambiguous），缺 `segments` 时校验器
 * 必须失败——这不是"将来补"的窗口，是当周数据生产的义务（方案 §3.4/§7）。本工具
 * 跑一遍分词，对多解词生成 `W[词].segments` 建议，**人只复核 diff，不手写**。
 *
 * 规则（2026-09-09 协调者修正，替换 P3 原稿"优先取本周新教字位"那条有缺陷的规则）：
 *   原规则「多解时优先选包含本周 newPatterns 里字位的那个解」只在"本周新教多字母
 *   字位"那一周成立——ai 一旦在 W5 教过，W6/W7 里含 ai 的词照样是两解，而那时 ai
 *   已不在 newPatterns 里，规则对这些词无定义。现改为：
 *     1. 多解时，选**字位数最少**的那个解（等价于优先用最长字位）。这条与"本周新教"
 *        无关，对任何一周都成立。
 *     2. 若字位数最少的解不唯一，**报错让人决定**，不要随便挑（tie，退出码非 0）。
 *     3. `newPatterns` 不参与选解，只在**报告输出**里标注某个词的消歧是否涉及本周
 *        新教的字位，方便人复核时优先看这些。
 *
 * 走查对象：该周词表（`W` 的全部键）里，**分词后落进"多字母字位"的字位集合**由
 * 累计 `sounds` 表本身决定（segmentWord 用的就是整张已教字位表，不只是本周新教的部分）
 * ——凡是分词能产生多个完整解的词都会被检查到，不局限于"用到本周新教字位"的词。
 *
 * ⚠️ 本工具只生成建议，不是最终答案：
 *   - 默认 dry-run，只打印建议；要显式加 --write 才写回文件。
 *   - 已经声明了 `segments` 字段的词一律跳过（状态 already-has-segments），不覆盖
 *     人已核对过的结果。
 *   - 输出让人一眼看出每个词有几个解、选了哪个、为什么。
 *
 * 加载周数据复用 tools/validation/load_data.js（不自己另写一套解析，方案 §5「模块
 * 形态」的硬要求），字位表按 tools/validation/sounds_grapheme_adapter.js 兼容
 * 第 4a 步前后两种形态（L / grapheme）。
 */
const fs = require('fs');
const path = require('path');
const { loadData, declaration } = require('./load_data');
const { withGraphemeFallback } = require('./sounds_grapheme_adapter');
const { segmentWord } = require('../../frontend/src/shared/graphemes');

const REPO = path.resolve(__dirname, '..', '..');

/* enumerateSegmentations(word, sounds, limit) -> string[][]：word 的全部完整分词
 * （每个结果是一个字位 ID 数组）。这不是 segmentWord 的职责——segmentWord 按契约
 * （方案 §3.2）只维护"0 解/唯一解/多解"三态，不枚举全部解；本工具恰恰需要枚举全部
 * 完整解来挑选建议，所以在这里单独实现一个有界的回溯枚举，不改 segmentWord 本身。
 * limit 防止病态字位表（大量重叠前缀）指数爆炸；正常周词表远用不到这个上限，撞到
 * 上限时抛错而不是静默截断——截断会让"报错让人决定"这条规则失去意义。 */
function enumerateSegmentations(word, sounds, limit) {
  limit = limit || 200;
  const normalized = String(word).toLowerCase();
  const ids = Object.keys(sounds).filter(id => typeof sounds[id].grapheme === 'string' && sounds[id].grapheme.length > 0);
  const results = [];
  let overflowed = false;
  (function walk(pos, path) {
    if (overflowed) return;
    if (pos === normalized.length) {
      results.push(path.slice());
      if (results.length > limit) overflowed = true;
      return;
    }
    for (const id of ids) {
      const g = sounds[id].grapheme.toLowerCase();
      if (normalized.startsWith(g, pos)) {
        path.push(id);
        walk(pos + g.length, path);
        path.pop();
        if (overflowed) return;
      }
    }
  })(0, []);
  if (overflowed) {
    const err = new Error('gen_segments: "' + word + '" 的完整解数量超过上限 ' + limit + '，怀疑字位表异常（大量重叠前缀），拒绝静默截断');
    err.code = 'segmentation-overflow';
    err.word = word;
    throw err;
  }
  return results;
}

/* resolveWord(word, sounds, newPatternIds) -> 单词的分析结果，见下方各 status 分支的注释。
 * 不依赖 newPatternIds 选解（见文件头规则修正）；newPatternIds 只用来给 resolved/tie
 * 结果打一个"是否涉及本周新教字位"的标注，供报告排序/提示用，不改变选解逻辑。 */
function resolveWord(word, sounds, newPatternIds) {
  const npSet = new Set(newPatternIds || []);
  const touchesNewPattern = ids => ids.some(id => npSet.has(id));

  let unique;
  try {
    unique = segmentWord(word, sounds); // 不传 explicitSegments：走自动分词，唯一解直接返回
  } catch (e) {
    if (e.code === 'segment-unknown') {
      return { word, status: 'unknown', reason: '无法识别的字位片段（' + e.message + '）', touchesNewPattern: false };
    }
    if (e.code !== 'segment-ambiguous') throw e; // 非预期错误码：不吞，交给调用方看到真实报错
    // 落到下面的多解分支
  }
  if (unique) {
    return { word, status: 'unique', segments: unique, touchesNewPattern: touchesNewPattern(unique) };
  }

  const candidates = enumerateSegmentations(word, sounds);
  if (candidates.length <= 1) {
    // segmentWord 判定为多解，但枚举只得到 <=1 个完整解：说明枚举与三态 DP 的判据
    // 不一致（内部缺陷），不是数据问题——不静默吞掉，直接抛出方便定位。
    const err = new Error('gen_segments: "' + word + '" segmentWord 判定为歧义，但完整枚举只得到 ' + candidates.length + ' 个解，内部不一致');
    err.code = 'internal-inconsistency';
    err.word = word;
    throw err;
  }
  const minLen = Math.min(...candidates.map(c => c.length));
  const minSet = candidates.filter(c => c.length === minLen);
  if (minSet.length === 1) {
    // codex medium（2026-09-09）：「规范先强调多解时算法无从判断，生成器却默认以
    // 『字位数最少』给出建议——这只是编辑启发式，不必然等于课程设计意图」。status
    // 名字仍叫 resolved（表示"能唯一选出一个字位数最少的候选"，不表示"这就是答案"），
    // 但显式加 needsHumanReview: true——本工具从来不产出可以免检直接采信的建议，
    // resolved 与 tie 在"是否需要人复核"这件事上没有区别，只是 resolved 能替人先
        // 排出一个候选摆在最前面，tie 连候选顺序都排不出来。allCandidates 始终是
    // enumerateSegmentations 的完整枚举（不止 minSet 那几个），人复核时应该看到
    // 全部解析，不只是"字位数最少"筛过一轮之后的子集——万一最少字位那个解本身就不是
    // 目标读法，人只有看到全部解析才能挑出正确答案（tests/unit/test_gen_segments.py
    // 的 bat/b+at 合成用例专门覆盖这种情况，是这条 medium 的证据 fixture）。
    return {
      word, status: 'resolved', segments: minSet[0], candidates, allCandidates: candidates,
      touchesNewPattern: touchesNewPattern(minSet[0]),
      needsHumanReview: true,
      reason: '按"字位数最少"这条编辑启发式选出（' + candidates.length + ' 个完整解中，字位数最少的恰好只有 1 个）——' +
        '这只是候选，不具契约优先级，算法无法判断这是否为教学意图'
    };
  }
  // L3 修复（预筛 low：「candidates 字段在 resolved 下是全集、在 tie 下只是
  // minSet，同名不同义」）：resolved 分支的 `candidates` 字段值等于完整枚举
  // （与 allCandidates 相同，见上方 return），而这里改前也叫 `candidates` 却只是
  // "字位数最少"这一个子集（minSet）——同一个字段名在两个分支里装的是不同范围的
  // 东西，读代码/读 formatReport 输出时容易搞混。这里把 tie 分支改名为
  // `minCandidates`，语义与实际内容对齐；allCandidates 不变，始终是完整枚举。
  return {
    word, status: 'tie', minCandidates: minSet, allCandidates: candidates,
    touchesNewPattern: minSet.some(touchesNewPattern),
    needsHumanReview: true,
    reason: '字位数最少的解有 ' + minSet.length + ' 个并列（' + minSet.map(c => c.join('+')).join(' / ') + '），需要人工决定'
  };
}

/* analyzeWeek(box) -> {newPatternIds, items}：对 box.W 的全部词条逐一分析。
 * 已声明 segments 的词条一律跳过（status='already-has-segments'），不覆盖人已核对
 * 过的结果——本工具是生成建议，不是权威来源。 */
function analyzeWeek(box) {
  if (!box || typeof box.W !== 'object' || box.W === null) {
    throw new Error('gen_segments: 目标文件里没有找到 W 声明（词表），无法生成建议');
  }
  if (!box.SOUNDS || typeof box.SOUNDS !== 'object') {
    throw new Error('gen_segments: 目标文件里没有找到 SOUNDS 声明（字位表），无法生成建议');
  }
  const sounds = withGraphemeFallback(box.SOUNDS);
  const newPatternIds = Array.isArray(box.META && box.META.newPatterns) ? box.META.newPatterns : [];
  const words = Object.keys(box.W);
  const items = words.map(word => {
    const entry = box.W[word];
    if (entry && Array.isArray(entry.segments)) {
      return { word, status: 'already-has-segments', segments: entry.segments, touchesNewPattern: false };
    }
    try {
      return resolveWord(word, sounds, newPatternIds);
    } catch (e) {
      return { word, status: 'error', reason: e.message, touchesNewPattern: false };
    }
  });
  return { newPatternIds, items };
}

/* formatReport(analysis) -> string：人读的报告，每个词一眼看出"有几个解、选了哪个、
 * 为什么"（方案对本工具的硬要求）。按 status 分组，tie/unknown/error 排在最前，
 * 因为那些是需要人立即处理的。 */
function formatReport(analysis) {
  const lines = [];
  // codex medium（2026-09-09，「生成器把启发式当成了权威」）：头部必须先声明本工具的
  // 输出是候选而不是答案——"字位数最少"只是一条编辑启发式，算法无从判断哪个拆法才是
  // 教学意图；下面每一条 resolved/tie 建议都要人工复核，尤其要核对"全部完整解析"里
  // 是否有比"字位数最少"更符合教学意图的候选（见 tie 与 resolved 分组的 reason/
  // allCandidates）。
  lines.push('⚠️ 以下全部是候选，不是答案：本工具只能枚举完整解析、按"字位数最少"这条编辑');
  lines.push('   启发式排出一个候选摆在最前面（tie 连这一步都排不出来），算法无法判断哪个');
  lines.push('   拆法才是课程设计意图。resolved/tie 的每一条建议都必须人工复核——复核时请看');
  lines.push('   完整解析列表，不要只看被选中的那一个（"字位数最少"不一定是目标读法）。');
  lines.push('newPatterns（本周新教字位，仅用于标注，不参与选解）：' +
    (analysis.newPatternIds.length ? analysis.newPatternIds.join(', ') : '（无 / META 未声明）'));
  const groups = { tie: [], unknown: [], error: [], resolved: [], unique: [], 'already-has-segments': [] };
  for (const item of analysis.items) groups[item.status].push(item);

  if (groups.tie.length) {
    lines.push('');
    lines.push('=== 需要人工决定（并列，' + groups.tie.length + ' 个词，需人工复核）===');
    for (const it of groups.tie) {
      lines.push('  ' + it.word + '：' + it.reason + (it.touchesNewPattern ? '  [涉及本周新教字位]' : ''));
      lines.push('    全部完整解析（' + it.allCandidates.length + ' 个）：' + it.allCandidates.map(c => c.join('+')).join(' / '));
    }
  }
  if (groups.unknown.length) {
    lines.push('');
    lines.push('=== 无法识别（' + groups.unknown.length + ' 个词）===');
    for (const it of groups.unknown) lines.push('  ' + it.word + '：' + it.reason);
  }
  if (groups.error.length) {
    lines.push('');
    lines.push('=== 分析出错（' + groups.error.length + ' 个词）===');
    for (const it of groups.error) lines.push('  ' + it.word + '：' + it.reason);
  }
  if (groups.resolved.length) {
    lines.push('');
    lines.push('=== 建议的 segments（' + groups.resolved.length + ' 个词，按"字位数最少"候选，均需人工复核）===');
    for (const it of groups.resolved) {
      lines.push('  ' + it.word + ' -> [' + it.segments.join(', ') + ']  [候选，需人工复核]' + (it.touchesNewPattern ? '  [涉及本周新教字位]' : '') +
        '（' + it.allCandidates.length + ' 个完整解：' + it.allCandidates.map(c => c.join('+')).join(' / ') + '；' + it.reason + '）');
    }
  }
  lines.push('');
  lines.push('=== 无需处理 ===');
  lines.push('  唯一解（不需要 segments）：' + groups.unique.length + ' 个词');
  lines.push('  已声明 segments（本工具不覆盖）：' + groups['already-has-segments'].length + ' 个词');
  return lines.join('\n');
}

/* ---- 写回：把词的 segments 注入 W 声明源码 ----
 *
 * M5 修复（2026-09-09 里程碑 2 收口批，协调者裁定「不采纳你的理由，本批必须做」：
 * 这条不是可选优化，是安全性缺陷——bat fixture 已经证明"字位数最少"这条启发式会
 * 给出错误答案（b+at，而这个合成周设定的目标读法是 b+a+t），改前 `--write` 仍然把
 * resolved（启发式候选）自动写进数据文件，唯一护栏是 @gen-segments-unreviewed 标记
 * 只能挡住"未复核就交付"，挡不住"错误建议先被写进源码、之后要人逐条去发现并推翻"这
 * 件事本身）。
 *
 * 新默认行为：
 *   - `--write`（不加 `--write-heuristic`）：只写 status==='unique' 的词——这些词
 *     segmentWord 本就能在没有 explicitSegments 的情况下唯一分词出来，写入 segments
 *     不是"算法替人做了判断"，只是把已经唯一确定的答案显式固定下来（防止未来字位表
 *     变化后，同一个词从"唯一解"变成"多解"时，历史教学意图悄悄失真）。这类写入不带
 *     @gen-segments-unreviewed 标记——没有歧义就没有"需要复核"这件事。
 *   - resolved（多解但按"字位数最少"能选出一个候选）的词**一律不在默认 `--write` 下
 *     写回**，只在报告里列出全部解析供人选择——这正是本次修复要堵住的口子。
 *   - `--write-heuristic`：显式打开后，才会额外把 resolved 的词也写回（仍带
 *     @gen-segments-unreviewed 标记 + check_data.js 门槛，未复核前不能交付）。这个
 *     开关本身就是一处需要谨慎使用的告警：见下方 CLI 帮助文本与 tools/gen_segments.py
 *     的 --write-heuristic 帮助文本，两处都明确写了"基于未经验证的启发式，bat
 *     fixture 已证明它会给错"。
 *   - tie（并列，算法连一个候选都排不出来）与 unknown/error 不受本次修复影响，
 *     一律不写回，一直都是"需要人工决定"的词。
 */

function escapeRegExpLiteral(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* injectSegmentsIntoWDeclaration(wDeclText, updates) -> 新的 W 声明源码文本。
 * updates: Map<word, {ids: string[], marker: boolean}>——marker=true 时带
 * @gen-segments-unreviewed 标记（resolved，经 --write-heuristic 写入的启发式候选），
 * marker=false 时不带（unique，唯一解，没有"需要复核"这回事）。只处理"字面量键直接是
 * word 本身"的形态（真实数据目前都是 `word:{...}` 这种写法，见
 * frontend/src/weeks/week01.data.js）。每个词的 `{...}` 块要求不含嵌套花括号（现状
 * 如此：W 的每条都是扁平对象），找不到或含嵌套花括号一律报错，不猜测式地部分匹配。 */
function injectSegmentsIntoWDeclaration(wDeclText, updates) {
  let out = wDeclText;
  for (const [word, entry] of updates) {
    const ids = entry.ids;
    const re = new RegExp('([{,]\\s*)' + escapeRegExpLiteral(word) + '(\\s*:\\s*\\{)([^{}]*)(\\})');
    if (!re.test(out)) {
      const err = new Error('gen_segments: 在 W 声明里找不到 "' + word + '" 的 {...} 块（或它含嵌套花括号），无法写回 segments');
      err.code = 'inject-target-not-found';
      err.word = word;
      throw err;
    }
    out = out.replace(re, (m, pre, colonOpen, body, close) => {
      const trimmed = body.replace(/,\s*$/, '');
      let seg;
      if (entry.marker) {
        // codex medium（2026-09-09）：写回时也要留证据说明这不是权威答案——不能只在
        // dry-run 的终端输出里提醒，写进源码的这一行本身也要带同一句话，因为复核者
        // 之后可能只看 diff/源码，不会重新跑一遍 CLI 看头部警告。
        // M4 修复（预筛 medium：「--write 会自动写入 fixture 自己证明是错的建议」）：
        // resolveWord 给 resolved 结果设了 needsHumanReview:true（见上方 resolveWord），
        // 用机器可识别标记 `@gen-segments-unreviewed` + check_data.js 的门槛（数据里
        // 含该标记即 fail，直到人复核后删掉标记），这样"未复核的建议"不可能悄悄进入
        // 交付——不再只靠人去读注释文案。M5 修复后，只有显式加 --write-heuristic 才会
        // 走到这个分支。
        seg = 'segments:[' + ids.map(id => JSON.stringify(id)).join(',') + ']' +
          ' /* @gen-segments-unreviewed：按"字位数最少"启发式选出的候选，不具契约优先级，' +
          '算法无法判断这是否为教学意图（--write-heuristic 显式启用后才会写入此类候选，' +
          'bat fixture 已证明这条启发式会给错）——tools/validation/check_data.js 会拦下' +
          '带此标记的数据，人工复核确认后请删除本行的 @gen-segments-unreviewed 标记' +
          '（连同本条注释一起删或改写皆可） */';
      } else {
        // M5 新增：unique（唯一解）词的写回不带 @gen-segments-unreviewed——没有歧义，
        // 没有"候选"这回事，segmentWord 不给 explicitSegments 也能推出同一个结果，
        // 写入只是把已确定的答案显式固定，供人一眼看清、也防未来字位表变化后失真。
        seg = 'segments:[' + ids.map(id => JSON.stringify(id)).join(',') + ']' +
          ' /* gen_segments：唯一解，无歧义，自动写回——segmentWord 不给 explicitSegments' +
          ' 也能推出同一结果，这里写入只是显式固定，不是算法替人做了判断，无需人工复核 */';
      }
      const sep = trimmed.trim() ? ',' : '';
      return pre + word + colonOpen + trimmed + sep + seg + close;
    });
  }
  return out;
}

/* writeSuggestions(rawText, analysis, options) -> {text, written[], writtenHeuristic[],
 * heuristicNotWritten[], needsHuman[]}：
 *   - status==='unique' 的词总是写回（不需要 options.writeHeuristic）。
 *   - status==='resolved' 的词只有 options.writeHeuristic===true 时才写回
 *     （M5：默认不写，只在报告里列出全部解析）；未写回时计入 heuristicNotWritten。
 *   - tie/unknown/error 一律不写回（一直如此），计入 needsHuman。
 *   - already-has-segments 不出现在任何列表里（本工具不覆盖人已核对过的结果）。
 * 不修改传入的 rawText 字符串本身（字符串不可变），返回新文本。 */
function writeSuggestions(rawText, analysis, options) {
  const writeHeuristic = !!(options && options.writeHeuristic);
  const decl = declaration(rawText, 'W');
  if (!decl) throw new Error('gen_segments: 目标文件源码里找不到 "const W = " 声明，无法写回');
  const updates = new Map();
  const written = [];
  const writtenHeuristic = [];
  for (const it of analysis.items) {
    if (it.status === 'unique') {
      updates.set(it.word, { ids: it.segments, marker: false });
      written.push(it.word);
    } else if (it.status === 'resolved' && writeHeuristic) {
      updates.set(it.word, { ids: it.segments, marker: true });
      written.push(it.word);
      writtenHeuristic.push(it.word);
    }
  }
  const heuristicNotWritten = writeHeuristic ? [] : analysis.items.filter(it => it.status === 'resolved').map(it => it.word);
  const needsHuman = analysis.items.filter(it => it.status === 'tie' || it.status === 'unknown' || it.status === 'error').map(it => it.word);
  if (updates.size === 0) return { text: rawText, written, writtenHeuristic, heuristicNotWritten, needsHuman };
  const newDecl = injectSegmentsIntoWDeclaration(decl, updates);
  const idx = rawText.indexOf(decl);
  const text = rawText.slice(0, idx) + newDecl + rawText.slice(idx + decl.length);
  return { text, written, writtenHeuristic, heuristicNotWritten, needsHuman };
}

/* hasUnreviewedMarkerInText(text) -> boolean：目标文件的某段文本里是否还残留
 * @gen-segments-unreviewed 标记——与 check_data.js §⑪（DATA-SEGMENTS-UNREVIEWED
 * 门槛）扫描的是同一个字面标记（见 injectSegmentsIntoWDeclaration 附近注释、
 * check_data.js 里 `unreviewedMatches` 那条正则）。main() 用它扫描"本次运行结束后
 * 磁盘上会留下的最终文本"，而不是只看"这次是不是我写的"（H2 复测修复，见下方
 * main() 里 hasUnreviewedMarkersOnDisk 的注释）。 */
function hasUnreviewedMarkerInText(text) {
  return /@gen-segments-unreviewed/.test(text);
}

function main() {
  const args = process.argv.slice(2);
  const writeHeuristic = args.includes('--write-heuristic');
  // --write-heuristic 隐含 --write（同时打开写回模式）：只传 --write-heuristic 不传
  // --write 时若仍要求必须两个都写，是纯粹的用户体验负担，且没有安全收益——
  // --write-heuristic 本身已经是"更危险"的那个显式开关，加它就代表用户已经同意写回。
  const write = args.includes('--write') || writeHeuristic;
  const targetArg = args.find(a => a !== '--write' && a !== '--write-heuristic');
  if (!targetArg) {
    console.error('用法：node tools/validation/gen_segments.js <周数据文件路径> [--write] [--write-heuristic]');
    console.error('  --write            写回唯一解（无歧义）的词的 segments，不写多解词');
    console.error('  --write-heuristic  额外写回"字位数最少"启发式候选（多解词）——基于未经验证的');
    console.error('                     启发式，bat fixture 已证明它会给错，写回的每一处都会带');
    console.error('                     @gen-segments-unreviewed 标记并被 check_data.js 拦下直到人工复核');
    console.error('三种模式的退出码语义（H2 修复，2026-09-10 内部预筛 high，见下方 hasUnreviewedMarkersOnDisk 注释）：');
    console.error('  dry-run（不加 --write）      ：0=没有任何候选/歧义需要处理；1=存在 tie/unknown/error；');
    console.error('                               3=存在按启发式选出但尚未落盘的 resolved 候选');
    console.error('  --write（不加 --write-heuristic）：只落盘 unique 词；resolved 候选一律不写，');
    console.error('                               退出码含义同 dry-run（0/1/3）');
    console.error('  --write-heuristic            ：额外落盘 resolved 候选（带 @gen-segments-unreviewed');
    console.error('                               标记）——0=没有 tie/unknown/error 且没有已落盘但未复核的');
    console.error('                               候选；1=存在 tie/unknown/error；4=磁盘上最终文件里仍');
    console.error('                               残留 @gen-segments-unreviewed 标记（不论是本次写入的，');
    console.error('                               还是更早一次 --write-heuristic 遗留、这次根本没碰到那些');
    console.error('                               词），check_data.js 会拦截，必须人工复核删除标记后才算');
    console.error('                               真正完成（不再是这里的 3——3 专指"根本没落盘"，4 专指');
    console.error('                               "磁盘上还带着未复核标记"，两者含义不同；3 种模式统一按');
    console.error('                               "扫描最终磁盘内容"判定 4，重跑不会掩盖已存在的标记）');
    console.error('  2=用法错误（本分支）');
    process.exit(2);
  }
  const targetPath = path.isAbsolute(targetArg) ? targetArg : path.resolve(REPO, targetArg);
  const raw = fs.readFileSync(targetPath, 'utf8');
  const box = loadData(raw, false);
  const analysis = analyzeWeek(box);
  console.log(formatReport(analysis));

  const needsHumanExit = analysis.items.some(it => it.status === 'tie' || it.status === 'unknown' || it.status === 'error');
  /* H1（外审 high，2026-09-09）：改前只用 needsHumanExit 判定退出码——一份只含
   * resolved（多解但按"字位数最少"能选出候选，仍需人工复核）的文件在任何模式下都会
   * 得到退出码 0，CI/调用者据此误认为"全部处理完成"，实际这些词仍未落盘（默认
   * --write 不写 resolved）或即便落盘也仍带 @gen-segments-unreviewed 标记未经复核。
   * 用独立退出码 3 表示"存在未落盘/未经复核确认的候选"，与 1（tie/unknown/error，
   * 连候选都排不出来或分析出错）区分：3 比 1 轻——3 只是"有候选待人挑"，1 是
   * "工具本身无法给出候选，必须人工介入"。两者都不是 0，调用方按"非 0 即不可放行"
   * 处理即可，不需要感知这条细分；细分只是给人读日志时定位问题严重程度用。
   * writeHeuristic===true 时 resolved 词会被写回（带标记），此时不再算"未落盘"——
   * 但见下方 H2 注释：这不等于可以放行到退出码 0。 */
  const hasUnwrittenCandidates = !writeHeuristic && analysis.items.some(it => it.status === 'resolved');
  /* H2（外审 high，2026-09-09）：改前只有 hasUnwrittenCandidates 这一档，`writeHeuristic`
   * 为真时它被强制视为 false，若同时没有 tie/unknown/error，退出码会落到 0——但 0 在
   * 用法文本里定义为"全部处理完毕"，而 --write-heuristic 写回的 resolved 候选仍然带着
   * `@gen-segments-unreviewed` 标记，check_data.js（DATA-SEGMENTS-UNREVIEWED 门槛）明确
   * 会拦截带这个标记的数据。"返回 0 说全做完了"与"下游门槛会因为它写的东西而 fail"
   * 直接矛盾——调用方/CI 看到退出码 0 会误判可以放行。
   *
   * 两种修法都能消除矛盾：①新增一个退出码，把"已落盘但未复核"与"根本没落盘"（现有的 3）
   * 分开；②把 0 的文案改成"候选均已落盘"（不再承诺"处理完毕"），并在调用方契约里
   * 强制经过复核门槛。这里选①：新增退出码 4。理由——
   *   - ②依赖"调用方/人 记得再查一遍复核门槛"这种约定，不是本工具自己能保证的；一旦
   *     有人跳过 check_data.js 直接用 gen_segments 的退出码判断"能不能往下走"，②仍会
   *     误放行，矛盾只是被文档挪了个位置，没有被消除。
   *   - ①让"是否还有未复核标记"这件事本身可机器判断（退出码本身即断言），不依赖调用方
   *     记得去调用 check_data.js；即使调用方只看 gen_segments 的退出码，也不会被误导。
   *   - 4 与现有的 3 语义上有真实区别，不是重复：3="工具建议了候选，但这次没有写进
   *     文件"（比如 dry-run，或 --write 不带 --write-heuristic）；4="工具已经把候选写
   *     进文件了，但那些候选还没有人复核过、身上还带着标记"——前者是"还没开始"，后者
   *     是"已经落盘、正等着人复核"，两种状态调用方需要做的下一步动作不一样（3 该考虑
   *     要不要重跑并加 --write-heuristic；4 该去打开文件删标记做复核），混在一起报告
   *     会让人不知道该做哪一步。
   * 改前 hasUnreviewedWritten 由下面 write 分支实际写回后据实回填，但只在"这次
   * writeSuggestions 真的新写入了 heuristic 候选"时才置真——见下方 finalText/
   * hasUnreviewedMarkersOnDisk 的 H2 复测修复说明：只覆盖"本次写入"这一种情形，
   * 重跑（这些词已经是 already-has-segments，不会再进 resolveWord/writeSuggestions）
   * 会让退出码悄悄跌回 0，而标记其实还在磁盘上。 */
  let finalText = raw; // 本次运行结束后磁盘上会留下的最终文本；默认等于读入时的原文
  // （dry-run，或下面 write 分支里没有任何词被写回时，磁盘内容都不会变）。

  if (write) {
    const result = writeSuggestions(raw, analysis, { writeHeuristic });
    if (result.written.length) {
      fs.writeFileSync(targetPath, result.text, 'utf8');
      finalText = result.text;
      console.log('');
      console.log('已写回 ' + result.written.length + ' 个词的 segments：' + result.written.join(', '));
      if (result.writtenHeuristic.length) {
        console.log('  其中 ' + result.writtenHeuristic.length + ' 个是按"字位数最少"启发式选出的候选' +
          '（--write-heuristic 已启用，均带 @gen-segments-unreviewed 标记，需人工复核；退出码将是 4，' +
          '不是 0——check_data.js 会拦下这些标记，复核并删除标记前不算真正完成）：' +
          result.writtenHeuristic.join(', '));
      }
    } else {
      console.log('');
      console.log('没有可写回的建议（无 unique 状态的词' + (writeHeuristic ? '，也无 resolved 状态的词' : '') + '）。');
    }
    if (result.heuristicNotWritten.length) {
      console.log('以下 ' + result.heuristicNotWritten.length + ' 个词有"字位数最少"候选建议，但默认不自动写回' +
        '（M5：基于未经验证的启发式，bat fixture 已证明它会给错）——见上方报告核对全部解析后，' +
        '确认可用再加 --write-heuristic 重跑，或直接人工写入 segments：' + result.heuristicNotWritten.join(', '));
    }
    if (result.needsHuman.length) {
      console.log('以下 ' + result.needsHuman.length + ' 个词未写回，需要人工处理后重跑：' + result.needsHuman.join(', '));
    }
  } else {
    console.log('');
    console.log('dry-run：未写回任何文件。加 --write 写回唯一解（无歧义）的词；' +
      '加 --write-heuristic 额外写回"字位数最少"启发式候选——基于未经验证的启发式，' +
      'bat fixture 已证明它会给错，务必先看报告里的全部解析再决定要不要用这个开关。');
  }

  /* H2 复测修复（内部预筛 2026-09-10：退出码 4 只覆盖"本次运行写入的那一次"，重跑
   * 恒返回 0）：改前只有"这次 writeSuggestions 新写入了 heuristic 候选"才会把退出码
   * 推到 4——一旦候选已经在磁盘上（不论是这次写的，还是更早一次 --write-heuristic
   * 遗留、这次因为词已经变成 already-has-segments 根本不会再被 resolveWord/
   * writeSuggestions 碰到），退出码就会悄悄跌回 0，而 @gen-segments-unreviewed 标记
   * 其实还在文件里，check_data.js 依然会拦截。改法：不再问"这次是不是我写的"，直接
   * 扫描本次运行结束后磁盘上会留下的最终文本（finalText）——dry-run/--write/
   * --write-heuristic 三种模式统一走这一条判据，"是否还有未复核标记"因此变成一个
   * 只看磁盘当前内容就能算出的机器判断：不依赖调用方记得再跑一遍 check_data.js，
   * 也不会被"这次没碰到那几个词"这种历史遗留状态蒙混过去——首跑写入标记后，不论
   * 后面重跑多少次、传不传 --write/--write-heuristic，只要标记还没被人删掉，退出码
   * 必须一直是 4。 */
  const hasUnreviewedMarkersOnDisk = hasUnreviewedMarkerInText(finalText);

  /* H3（外审 high，2026-09-10）：改前退出码判断顺序是 1 → 3 → 4，与上面 hasUnreviewedMarkersOnDisk
   * 注释里承诺的"只要磁盘还有 @gen-segments-unreviewed 标记，重跑必须一直是 4"矛盾——
   * 标记与 tie/unknown/error 同时存在时会先命中 1，标记与未写候选同时存在时会先命中 3，
   * 4 永远轮不到。裁定：4 优先，因为它是跨次运行持久的磁盘状态（不管这次是 dry-run、
   * 还是这次没有 tie/unknown/error），1/3 只是本次运行的局部状态，下一次重跑就可能不再成立。
   * 顺序改为：磁盘有未复核标记恒 4；其次 1（工具本身给不出候选，必须人工介入）；
   * 再次 3（有候选但这次没落盘）。 */
  if (hasUnreviewedMarkersOnDisk) process.exit(4);
  if (needsHumanExit) process.exit(1);
  if (hasUnwrittenCandidates) process.exit(3);
}

module.exports = {
  enumerateSegmentations, resolveWord, analyzeWeek, formatReport,
  injectSegmentsIntoWDeclaration, writeSuggestions, hasUnreviewedMarkerInText
};

if (require.main === module) main();
