/* 共享豁免判据（轮 D 复审第三轮，外审 high H1+H2，2026-09-10）。
 *
 * 背景：同一条"哪些教学消费记录允许零解/含未教字位而不算数据缺陷"的规则，此前在
 * 两处各写了一份、且两份互相矛盾：
 *   - tools/validation/check_data.js ③：`isExemptRecord` 只精确处理了 G1 豁免
 *     （bucket==='neg' || (week===1 && bucket==='pos')），但③循环开头还留着一条
 *     独立的 `if (SIGHT.has(w.toLowerCase())) continue;`——按"词"整词跳过，不看
 *     当前记录的 kind，认读词出现在 words/wordforge/blend 等**字位操作类来源**
 *     也会被豁免，与"认读词豁免只对阅读文本类来源（sight/sentences/book-page）
 *     生效"这条规则（H3，见 tests/unit/test_grapheme_semantics.js 的既有实现）
 *     直接冲突。
 *   - tests/unit/test_grapheme_semantics.js：`isZeroSolutionExemptRecord` 已经
 *     正确实现了"认读词豁免限定到阅读文本类来源"，但 G1 pos 桶豁免那部分独立
 *     实现了一份（`rec.kind === 'g1-rounds'` 直接返回 true，不分桶不分周）——与
 *     check_data.js 的"仅 W1 的 pos 桶豁免"矛盾。
 * 两处"各写一份、各自只改对了一半"，本次统一抽到这一个文件，两处都改成
 * require 这一份，不再各自维护。
 *
 * 判据本体（唯一权威版本）：
 *   ① G1："声音抓抓乐"整场是听力辨音游戏——neg 桶（干扰词反例）任何周都豁免；
 *      pos 桶（目标音正例）只有第一周豁免（W1 的 pos 桶词形选取还没顾得上避开
 *      未教字母，W2 起 pos 桶就必须像其它教学内容一样可解码）。
 *   ② 认读词：仅当记录的 kind 属于"阅读文本类来源"（sight 声明本身/sentences
 *      整句朗读/book-page 小书正文）、且词形在调用方传入的累计认读词集合里，才
 *      豁免——字位操作类来源（words/wordforge-family/wordforge-swap/blend/
 *      initialpick/pair/flash/g3-pairs/g4-words/g5-whitelist/wall-hint 等）
 *      一律不豁免，哪怕词形本身是认读词。
 *   其余组合一律不豁免。
 *
 * `cumulativeSightWords` 由调用方注入（不是本模块内部去读历史周文件）——
 * check_data.js 目前只处理单周数据，传入的是"本周 sight 记录"这个子集；
 * test_grapheme_semantics.js 的语义套件真正跨周累计。两个调用方对"累计"的
 * 定义可以不同，本模块只负责用调用方给定的集合应用同一条判据，不替调用方决定
 * 累计范围。 */

const SIGHT_EXEMPT_READING_KINDS = new Set(['sight', 'sentences', 'book-page']);

/* isExemptConsumptionRecord(rec, options) -> boolean
 * rec: word_consumers.js collectWordConsumption() 产出的单条记录（至少含 word/kind，
 *      g1-rounds 记录另带 bucket/week，见该文件头注释）。
 * options.cumulativeSightWords: Set<string>（小写归一化），调用方认定的"认读词"集合。
 * options.week: number，调用方认定的"当前周"（用于 G1 pos 桶的仅第一周豁免判据）。
 *
 * M1（外审 medium，2026-09-10）：g1-rounds 记录若缺失/非法 bucket 字段，显式抛出
 * 结构化错误——不能因为字段缺失就静默落到"不豁免"这个默认分支，那样看起来像是
 * "碰巧判定正确"，掩盖了数据/抽取器本身的契约缺陷（bucket 缺失说明
 * word_consumers.js 的 g1-rounds 记录构造出了问题，需要先修那里，不该被这里的
 * 豁免判据悄悄吞掉）。 */
function isExemptConsumptionRecord(rec, options) {
  const cumulativeSightWords = options && options.cumulativeSightWords;
  const week = options && options.week;
  if (rec.kind === 'g1-rounds') {
    if (rec.bucket !== 'pos' && rec.bucket !== 'neg') {
      const err = new Error(
        'isExemptConsumptionRecord: g1-rounds 记录缺少合法的 bucket 字段（应为 "pos" 或 "neg"），' +
        `实际：${JSON.stringify(rec.bucket)}（word: ${rec.word}）——这是 word_consumers.js 抽取器的契约缺陷，` +
        '不应该被这里的豁免判据静默当成"不豁免"处理。'
      );
      err.code = 'g1-rounds-missing-bucket';
      throw err;
    }
    if (rec.bucket === 'neg') return true;
    return week === 1;
  }
  if (SIGHT_EXEMPT_READING_KINDS.has(rec.kind)) {
    const word = String(rec.word || '').toLowerCase();
    return !!(cumulativeSightWords && cumulativeSightWords.has(word));
  }
  return false;
}

module.exports = { isExemptConsumptionRecord, SIGHT_EXEMPT_READING_KINDS };
