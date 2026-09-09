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
  return {
    word, status: 'tie', candidates: minSet, allCandidates: candidates,
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

/* ---- 写回（--write）：把 resolved 词的 segments 注入 W 声明源码 ---- */

function escapeRegExpLiteral(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* injectSegmentsIntoWDeclaration(wDeclText, updates) -> 新的 W 声明源码文本。
 * updates: Map<word, string[]>。只处理"字面量键直接是 word 本身"的形态（真实数据
 * 目前都是 `word:{...}` 这种写法，见 frontend/src/weeks/week01.data.js）。每个词的
 * `{...}` 块要求不含嵌套花括号（现状如此：W 的每条都是扁平对象），找不到或含嵌套
 * 花括号一律报错，不猜测式地部分匹配。 */
function injectSegmentsIntoWDeclaration(wDeclText, updates) {
  let out = wDeclText;
  for (const [word, ids] of updates) {
    const re = new RegExp('([{,]\\s*)' + escapeRegExpLiteral(word) + '(\\s*:\\s*\\{)([^{}]*)(\\})');
    if (!re.test(out)) {
      const err = new Error('gen_segments: 在 W 声明里找不到 "' + word + '" 的 {...} 块（或它含嵌套花括号），无法写回 segments');
      err.code = 'inject-target-not-found';
      err.word = word;
      throw err;
    }
    out = out.replace(re, (m, pre, colonOpen, body, close) => {
      const trimmed = body.replace(/,\s*$/, '');
      // codex medium（2026-09-09）：写回时也要留证据说明这不是权威答案——不能只在
      // dry-run 的终端输出里提醒，写进源码的这一行本身也要带同一句话，因为复核者
      // 之后可能只看 diff/源码，不会重新跑一遍 CLI 看头部警告。
      const seg = 'segments:[' + ids.map(id => JSON.stringify(id)).join(',') + ']' +
        ' /* gen_segments 候选：按"字位数最少"启发式选出，不具契约优先级，' +
        '算法无法判断这是否为教学意图——人工复核确认后可删除本注释 */';
      const sep = trimmed.trim() ? ',' : '';
      return pre + word + colonOpen + trimmed + sep + seg + close;
    });
  }
  return out;
}

/* writeSuggestions(rawText, analysis) -> {text, written[], skipped[]}：把 status='resolved'
 * 的词写回；tie/unknown/error/unique/already-has-segments 一律不动（tie/unknown/error
 * 正是"需要人工决定"的词，不能被写回逻辑自作主张）。不修改传入的 rawText 字符串本身
 * （字符串不可变），返回新文本。 */
function writeSuggestions(rawText, analysis) {
  const decl = declaration(rawText, 'W');
  if (!decl) throw new Error('gen_segments: 目标文件源码里找不到 "const W = " 声明，无法写回');
  const updates = new Map();
  const written = [];
  for (const it of analysis.items) {
    if (it.status === 'resolved') { updates.set(it.word, it.segments); written.push(it.word); }
  }
  const skipped = analysis.items.filter(it => it.status !== 'resolved' && it.status !== 'unique' && it.status !== 'already-has-segments').map(it => it.word);
  if (updates.size === 0) return { text: rawText, written, skipped };
  const newDecl = injectSegmentsIntoWDeclaration(decl, updates);
  const idx = rawText.indexOf(decl);
  const text = rawText.slice(0, idx) + newDecl + rawText.slice(idx + decl.length);
  return { text, written, skipped };
}

function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const targetArg = args.find(a => a !== '--write');
  if (!targetArg) {
    console.error('用法：node tools/validation/gen_segments.js <周数据文件路径> [--write]');
    process.exit(2);
  }
  const targetPath = path.isAbsolute(targetArg) ? targetArg : path.resolve(REPO, targetArg);
  const raw = fs.readFileSync(targetPath, 'utf8');
  const box = loadData(raw, false);
  const analysis = analyzeWeek(box);
  console.log(formatReport(analysis));

  const needsHuman = analysis.items.some(it => it.status === 'tie' || it.status === 'unknown' || it.status === 'error');

  if (write) {
    const result = writeSuggestions(raw, analysis);
    if (result.written.length) {
      fs.writeFileSync(targetPath, result.text, 'utf8');
      console.log('');
      console.log('已写回 ' + result.written.length + ' 个词的 segments：' + result.written.join(', '));
    } else {
      console.log('');
      console.log('没有可写回的建议（无 resolved 状态的词）。');
    }
    if (result.skipped.length) {
      console.log('以下 ' + result.skipped.length + ' 个词未写回，需要人工处理后重跑：' + result.skipped.join(', '));
    }
  } else {
    console.log('');
    console.log('dry-run：未写回任何文件。加 --write 写回可自动判定（无并列）的建议。');
  }

  if (needsHuman) process.exit(1);
}

module.exports = {
  enumerateSegmentations, resolveWord, analyzeWeek, formatReport,
  injectSegmentsIntoWDeclaration, writeSuggestions
};

if (require.main === module) main();
