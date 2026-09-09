/* 共享词消费抽取器（里程碑 2 第 3 步）。
 *
 * 契约来源：docs/里程碑2实施方案_20260908_v1.7.md §4 分步实施表第 3 步验收：
 *   「语料来源必须是共享的词消费抽取器，不能复用 check_data.js 的 usedWords——
 *    它 :57-71 只收 blend / 听音找开头 / words / pair / sight / flash / sentences /
 *    G1_ROUNDS / G4_WORDS，漏掉 wordforge 与 BOOK.pages。测试要断言各生产入口均被覆盖」。
 *
 * 本文件不复用、不修改 tools/validation/check_data.js 的 usedWords 逻辑——那是它的私有
 * 局部变量，没有导出。这里从零对照《周课件数据层交接规范 v2.0》§3 的块类型表（24 种）与
 * 12 个常量表，逐项判定"是不是词消费入口"，判定依据见下方 ENTRY CATALOG 注释。
 *
 * ⚠️ 「12 个常量表」不是顶层声明的全部——tools/validation/load_data.js 的 NAMES 实际有
 * 20 项（多出 META/FIRST_TEACH_DAY/RESERVED_RETEST/PROBE_A/PROBE_B/GLOBAL_RESERVED/
 * ASSESS_TEXT/ASSESSMENT_WORDS/TAUGHT_SIGHT 这 8 个不在 12 常量表里的声明，其中后三个
 * W4 实测真的会用到）。下面的排除清单按这 20 项全部过一遍，逐项给理由，不是只覆盖
 * 12 常量表那 12 个（coordinator M-4：声明覆盖范围不能大于实作核实过的范围）。
 *
 * 已确认收录的入口（本次一并补全，不止 wordforge / BOOK.pages 两处已知缺口）：
 *   DAYS 块级：blend、initialpick、words、pair（当天块）、sight、flash（k:'w' 项）、
 *              sentences（整句需要分词）、wordforge（family / swap 两种模式）
 *   顶层常量：BOOK.pages[].line（整句需要分词）、G1_ROUNDS（pos/neg）、G3_PAIRS、
 *              G4_WORDS、G5_WHITELIST、WALL_HINT（键本身就是词）
 *
 * 已确认排除的入口（20 项 NAMES 逐项过，连同排除理由，供审查核对"是不是漏了"）：
 *   META / FIRST_TEACH_DAY / DAYS —— 结构/配置字段，不是词列表（DAYS 本身是主要扫描对象，
 *                          逐块进 switch 处理，不是被排除，这里只是说它自己不算"一个词条目"）；
 *                          SOUNDS 同理，它是音素表不是词表——它唯一含词的子字段是 .demo，
 *                          单独在下面处理。
 *   W                   —— 词典/释义表，回答"某词是什么意思"，不是"教学消费某词的活动"。
 *                          `DATA-RESERVED-01` 明确要求"每个 RESERVED 必须在 W 里"——如果把
 *                          W 的键当消费入口收录，RESERVED 词就会因为"必须在 W 里"这条规则
 *                          本身而被判定"泄漏"，逻辑自相矛盾，所以排除。
 *   RESERVED           —— 它是审计目标本身（周检词不许出现在别处），
 *                          折进消费集合会让"泄漏检测"变成用自己比自己，恒真。
 *   RESERVED_RETEST/PROBE_A/PROBE_B/GLOBAL_RESERVED/ANNUAL_DECODING —— 同上，全部是测评池，
 *                          不是教学消费（ANNUAL_DECODING 现在没有任何真实周声明它，
 *                          规范里是 W40 专用、里程碑 2b 范围，这里先按同一理由预先排除，
 *                          将来它出现时不用改这份清单）。
 *   ASSESS_TEXT         —— 测评短文本身（W4 实测：真实英文短文，含 pup/cub/rug 等词）。
 *                          它与测评池的重叠已经由 assessment_contract.js:55
 *                          `if(owner.has(w)) fail('测评短文与测评词冲突：'+w)` 专门检查，
 *                          语义是"两个测评工具间是否冲突"，不是"教学/练习是否泄漏了
 *                          测评词"——概念上是另一件事，纳入本抽取器会造成语义混淆和
 *                          重复判定，故排除，交给 assessment_contract.js 专职处理。
 *   ASSESSMENT_WORDS    —— W4 实测：`{词:{zh}}` 形状的释义字典，键**就是**全部 5 个
 *                          RESERVED 词加 5 个 RESERVED_RETEST 词（dab/nag/nod/sob/rot +
 *                          gab/gal/hub/rib/sod，逐一核对过）。它是测评词的释义来源，
 *                          结构和用途都跟 W 一样（回答"这个词是什么意思"），只是服务对象
 *                          是测评池而不是教学词——若被收录，RESERVED 词会因为"释义字典里
 *                          有自己"而被判定"泄漏"，是与排除 W 完全相同的自相矛盾，故排除。
 *   TAUGHT_SIGHT        —— W4 实测：`["i","a","see","the","is","to"]`，是"累计认读词"的
 *                          历史汇总声明（assessment_contract.js 用它核对"认读词只能沿用
 *                          前三周六词"），不是某个具体教学块的消费记录——它汇总的内容本来
 *                          就来自历次 `sight` 块（本抽取器已经按 kind='sight' 逐周收了当周
 *                          新增部分），整体再收一次 TAUGHT_SIGHT 会把同一批词重复计入，
 *                          故排除。
 *   SOUNDS[id].demo     —— 音素卡的"听老师说"示范词，规范设计上允许包含未教字位
 *                          （如 week01 's' 的 demo 含 'snake'，'k' 未教）用于纯听力展示，
 *                          不是孩子要能读出来的解码内容，check_data.js 现状也从不把它
 *                          计入 usedWords / 陌生度判断，这里保持同一处置，不新增语义。
 *   G1_THEME            —— 只有 title/icon/cmd 三个展示字段，没有词。
 *   lead/list/note/table/checks 等自由文本块 —— 规范里这些走的是"曝光词抽取器"
 *                          （§4.1 PED-NOVELTY-01，抓的是任意可见英文文本），
 *                          与本文件"离散词条目"的抽取粒度是两回事，不在本次范围内混同。
 *
 * 用途：
 *   - tests/unit/test_word_consumers.js：断言上述入口全部被覆盖（每类至少一个正例）。
 *   - tests/unit/test_migration_diff.js：五项差分测试的语料来源。
 *   - tools/validation/migration_audit.js：RESERVED 泄漏检测 + 泄漏位置。
 *
 * 本文件只读输入数据，不修改、不接线到 check_data.js / games.js 等消费方。
 */

/* 与 tools/validation/assessment_contract.js 的 tokens() 同一种分词口径：按连续
 * [a-z] 段切词，忽略大小写与非字母字符。仅用于"整句需要分词"的两个入口
 * （sentences 块、BOOK.pages[].line），离散词条目（如 blend.words）不经过这一步，
 * 原样保留大小写供调用方自行归一化。 */
function tokenizeSentence(text) {
  return String(text || '').toLowerCase().match(/[a-z]+/g) || [];
}

/* 每种入口的稳定标识，供覆盖率测试逐项核对（"各生产入口均被覆盖"）。 */
const ENTRY_KINDS = Object.freeze([
  'blend', 'initialpick', 'words', 'day-pair', 'sight', 'flash',
  'sentences', 'wordforge-family', 'wordforge-swap',
  'book-page', 'g1-rounds', 'g3-pairs', 'g4-words', 'g5-whitelist', 'wall-hint'
]);

/* collectWordConsumption(d) -> Array<{word, kind, week, day?, page?, round?, family?}>
 * d 是 tools/validation/load_data.js 的 loadData() 返回的 box（或同形对象）。
 * 保留原始大小写与来源定位，不去重、不归一化——去重/归一化交给调用方按自己的用途决定
 * （差分测试要保留重复以核对"同一词多处消费"，审计工具要保留来源做泄漏定位）。 */
function collectWordConsumption(d) {
  const records = [];
  const week = d.META && d.META.week;
  const push = (word, kind, extra) => {
    if (typeof word !== 'string' || !word) return;
    records.push(Object.assign({ word: word, kind: kind, week: week }, extra || {}));
  };

  for (const day of d.DAYS || []) {
    for (const step of day.steps || []) {
      for (const b of step.blocks || []) {
        switch (b.b) {
          case 'blend':
            (b.words || []).forEach(w => push(w, 'blend', { day: day.n }));
            break;
          case 'initialpick':
            (b.words || []).forEach(w => push(w, 'initialpick', { day: day.n }));
            break;
          case 'words':
            (b.items || []).forEach(w => push(w, 'words', { day: day.n }));
            break;
          case 'pair':
            (b.pairs || []).forEach(p => (p || []).forEach(w => push(w, 'day-pair', { day: day.n })));
            break;
          case 'sight':
            (b.items || []).forEach(pair => push(pair && pair[0], 'sight', { day: day.n }));
            break;
          case 'flash':
            (b.items || []).forEach(it => { if (it && it.k === 'w') push(it.v, 'flash', { day: day.n }); });
            break;
          case 'sentences':
            (b.items || []).forEach(pair => {
              tokenizeSentence(pair && pair[0]).forEach(w => push(w, 'sentences', { day: day.n }));
            });
            break;
          case 'wordforge':
            if (b.mode === 'swap') {
              (b.pairs || []).forEach(pair => {
                const from = pair && pair[0], word = pair && pair[1];
                push(from, 'wordforge-swap', { day: day.n });
                push(word, 'wordforge-swap', { day: day.n });
              });
            } else {
              (b.families || []).forEach(f => {
                (f.heads || []).forEach(head => push(head + f.tail, 'wordforge-family', { day: day.n, tail: f.tail }));
              });
            }
            break;
          default:
            break;
        }
      }
    }
  }

  if (d.BOOK && Array.isArray(d.BOOK.pages)) {
    d.BOOK.pages.forEach((p, i) => {
      tokenizeSentence(p && p.line).forEach(w => push(w, 'book-page', { page: i }));
    });
  }

  Object.entries(d.G1_ROUNDS || {}).forEach(([round, r]) => {
    (r.pos || []).forEach(w => push(w, 'g1-rounds', { round: round, bucket: 'pos' }));
    (r.neg || []).forEach(w => push(w, 'g1-rounds', { round: round, bucket: 'neg' }));
  });

  (d.G3_PAIRS || []).forEach((pair, i) => (pair || []).forEach(w => push(w, 'g3-pairs', { pairIndex: i })));
  (d.G4_WORDS || []).forEach(w => push(w, 'g4-words'));
  (d.G5_WHITELIST || []).forEach(w => push(w, 'g5-whitelist'));
  Object.keys(d.WALL_HINT || {}).forEach(w => push(w, 'wall-hint'));

  return records;
}

/* usedWordSet(d) -> Set<string>：归一化（小写）后的去重词集合，方便"是否被消费过"这类
 * 布尔查询（RESERVED 泄漏检测、差分测试的语料去重）。 */
function usedWordSet(d) {
  return new Set(collectWordConsumption(d).map(r => r.word.toLowerCase()));
}

/* findConsumptionOf(d, word) -> Array<record>：给定词（大小写不敏感），返回全部消费记录，
 * 用于泄漏检测报告"泄漏位置"。 */
function findConsumptionOf(d, word) {
  const target = String(word).toLowerCase();
  return collectWordConsumption(d).filter(r => r.word.toLowerCase() === target);
}

module.exports = { ENTRY_KINDS, tokenizeSentence, collectWordConsumption, usedWordSet, findConsumptionOf };
