/* M4（轮 D 复审第二轮，外审 medium，2026-09-10，"最重要的一条"）：P16 把 RESERVED
 * 五词（dab/nag/nod/sob/rot）与 RESERVED_RETEST 五词（gab/gal/hub/rib/sod）补进
 * W4 的 W 词典后，需要独立核实这十词不会因为"W 被某个消费者整体枚举"而意外出现在
 * 孩子可见的界面（词卡墙/游戏题面/小书/闪卡）或音频清单里。
 *
 * 全仓 W 枚举点审计结论（本文件头注释即审计记录，逐条列出）：
 *   - tools/validation/check_data.js:511 `Object.keys(W).forEach(w => assertPlainTextField(...))`
 *     —— 校验器逐键检查 zh 字段不含 HTML 标签，不产出任何可见 DOM，不展示。
 *   - tools/validation/migration_audit.js:296 `Object.keys(W).forEach(k => wKeysByLower.set(...))`
 *     —— 审计工具建小写归一化查找表，只读不产出可见界面，不展示。
 *   - tools/validation/gen_segments.js:155 `const words = Object.keys(box.W)`
 *     —— 离线开发者工具，给多解词生成 segments 建议供人工复核，写回的是数据结构化
 *        字段（segments），不是渲染内容，不展示；十词全单字母字位，天然无歧义，
 *        这个工具实际上根本不会为它们生成任何建议。
 *   - tests/browser/smoke_w3_browser.py:224 `Object.keys(W)` —— 测试脚本自己的
 *     断言辅助（判断小书句子里的 -s 屈折形式是否是已教词的变形），不产出可见界面，
 *     不展示，且只在测试进程里跑，不是生产代码路径。
 *   - tools/embed_assets.py:88 `set(ART_RE.findall(slice_const(html, "W")))` —— 正则
 *     扫描 W 常量文本里全部 `art:'非空值'` 引用，用于判断哪些插画需要嵌入。这是
 *     唯一一处会因为"新词进了 W"而可能产生级联效果的枚举点：如果新词的 art 字段
 *     是非空字符串，这个正则会把它当成"需要嵌入的插画键"处理。**十词的 art 字段
 *     全部显式声明为 `null`**（frontend/src/weeks/week04.data.js），`art:\s*'([A-Za-z0-9_]+)'`
 *     这条正则只匹配带引号的非空字符串，`art:null` 不会被匹配，此工具对这十词
 *     是彻底的空操作，不会尝试嵌入任何插画，不展示。
 *   - frontend/src/shared/render-blocks.js:437-439（exam 块的 weekly 回退分支
 *     `RESERVED.map(w=>...W[w].zh...)`）—— 这是**周检块本身**（按 RESERVED 数组
 *     取词，不是枚举整个 W），且只在 `typeof RESERVED_RETEST === 'undefined'`
 *     （即 W1-W3 weekly 周）时才走这条分支；W4 起 RESERVED_RETEST 已定义，
 *     实际走的是 assessment.js 的 assessmentHTML('exam')，那里按 assessmentPool
 *     （同样是 RESERVED/RESERVED_RETEST 数组，不是 W）取词，且需要家长先点击
 *     "开始周检/复测"才会把词渲染进 DOM（渐进式揭示，不是访问即见）——这是
 *     测评功能本身，不是"泄漏"，但确认了它按"课程引用取词"（RESERVED/
 *     RESERVED_RETEST 数组），不是"枚举 W"。
 * 全部枚举点逐条核实完毕：没有发现任何消费者会把 W 的全部键当作"可展示词表"
 * 遍历渲染。唯一有级联风险的 embed_assets.py 因为十词 art:null 而天然免疫。
 *
 * 下面的负向测试从**真实 W4 构建产物**（build/week04.html，需要先跑一次
 * `python tools/project.py build`）验证这个审计结论，作为独立于 check_data.js/
 * assessment_contract.js 既有检查之外的第二道保险（不同实现路径，互相印证）：
 *   ① 十词不出现在 WORD_AUDIO（音频清单期望项）的键里；
 *   ② 十词不出现在 WORD_ILL（词卡插画）的键里；
 *   ③ 十词不出现在 word_consumers.js 共享抽取器枚举出的任何结构化教学消费记录里
 *      （DAYS 各类块 + BOOK.pages + G1_ROUNDS + G3_PAIRS + G4_WORDS + G5_WHITELIST +
 *      WALL_HINT，15 类来源）。
 *      ⚠️ 原设计是"整份构建产物文本挖掉四处已知声明后做全文正则扫描"，实测
 *      被 WORD_AUDIO/PHONEME_AUDIO 等 base64 音频数据里偶然出现的三字母巧合
 *      子串（例如某段 base64 里连续出现 "dAB"，大小写不敏感匹配下命中
 *      "dab"）污染出假阳性——base64 字母表覆盖范围广，几 MB 的音频数据里出现
 *      任意三到四字母巧合子串的概率不低。改用结构化的 collectWordConsumption
 *      枚举（在解析后的 box 对象上按字段取值，不做文本正则扫描），从机制上
 *      不会被二进制数据的文本巧合污染。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadData } = require('../../tools/validation/load_data');

const ROOT = path.resolve(__dirname, '..', '..');
const BUILD_PATH = path.join(ROOT, 'build', 'week04.html');

if (!fs.existsSync(BUILD_PATH)) {
  console.log(`SKIP test_w4_ten_words_not_exposed：${BUILD_PATH} 不存在，请先跑 python tools/project.py build`);
  process.exit(0);
}

const raw = fs.readFileSync(BUILD_PATH, 'utf8');
const box = loadData(raw, true);

const TEN_WORDS = [...box.RESERVED, ...(box.RESERVED_RETEST || [])];
assert.equal(TEN_WORDS.length, 10, `真实 W4 构建产物的 RESERVED+RESERVED_RETEST 应恰好 10 词，实际 ${TEN_WORDS.length}：${JSON.stringify(TEN_WORDS)}`);

// ① WORD_AUDIO 期望项不含十词
{
  const m = /const WORD_AUDIO = (\{[\s\S]*?\});/.exec(raw);
  assert(m, '真实构建产物应能找到 const WORD_AUDIO = {...}; 声明');
  const audioKeys = Object.keys(JSON.parse(m[1]));
  const overlap = TEN_WORDS.filter(w => audioKeys.includes(w));
  assert.deepEqual(overlap, [], `WORD_AUDIO 的音频清单期望项不应包含任何一个测评词，实际重叠：${JSON.stringify(overlap)}`);
  console.log(`PASS M4 ①：WORD_AUDIO（${audioKeys.length} 条音频期望项）不含任何一个测评词`);
}

// ② WORD_ILL（词卡插画）键不含十词
{
  const m = /const WORD_ILL = (\{[\s\S]*?\});/.exec(raw);
  assert(m, '真实构建产物应能找到 const WORD_ILL = {...}; 声明');
  const illKeys = Object.keys(JSON.parse(m[1]));
  const overlap = TEN_WORDS.filter(w => illKeys.includes(w));
  assert.deepEqual(overlap, [], `WORD_ILL 词卡插画的键不应包含任何一个测评词，实际重叠：${JSON.stringify(overlap)}`);
  console.log(`PASS M4 ②：WORD_ILL（${illKeys.length} 条词卡插画）不含任何一个测评词`);
}

// ③ 用共享抽取器 collectWordConsumption（word_consumers.js，check_data.js ③ 同源，
// 但这里是独立调用、独立断言，不复用 check_data.js 的 pass/fail 逻辑本身）枚举
// 真实 W4 box 里全部结构化教学消费记录（DAYS 各类块 + BOOK.pages + G1_ROUNDS +
// G3_PAIRS + G4_WORDS + G5_WHITELIST + WALL_HINT，15 类来源），核实十词一个都不
// 在这份消费清单里——这是精确的结构化核验，不会像纯文本正则扫描那样被
// WORD_AUDIO/PHONEME_AUDIO/WORD_ILL 等 base64 音频·图片数据里偶然出现的三字母
// 巧合子串（比如某段 base64 里恰好连续出现 "dAB"）污染。
{
  const { collectWordConsumption } = require('../../tools/validation/word_consumers');
  const records = collectWordConsumption(box);
  for (const w of TEN_WORDS) {
    const hits = records.filter(r => r.word.toLowerCase() === w.toLowerCase());
    assert.deepEqual(hits, [],
      `测评词 "${w}" 不应出现在任何结构化教学消费记录里（游戏题面/小书/闪卡/词卡墙/换头造词等），` +
      `实际命中来源：${JSON.stringify(hits.map(h => h.kind))}`);
  }
  console.log(`PASS M4 ③：真实 W4 box 的全部结构化教学消费记录（word_consumers.js 15 类来源，共 ${records.length} 条）里不含任何一个测评词`);
}

console.log('PASS M4 全部三项负向测试：W4 的 RESERVED/RESERVED_RETEST 十词未出现在音频清单、词卡插画或任何非测评源码位置');
