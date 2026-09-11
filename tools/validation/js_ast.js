/* 里程碑 2 段 4 U1（2026-09-11）：load_data.js 顶层声明发现/抽取的 AST 底层实现。
 *
 * 背景：轮 J 十轮外审停在同一个根因——tools/validation/js_lex.js 是自制的最小词法
 * 扫描（正则 + 括号深度计数），不识别正则字面量，且"计数"（countDeclarationOccurrences，
 * 括号深度感知）与"抽取"（declaration，第一次文本匹配）是两条独立实现，可能对同一份
 * 输入给出不一致的判断（H1：局部同名 const 排在真实顶层声明之前时，计数说"只有 1
 * 个顶层声明"，抽取却选中了那个局部的）。方案：换用真正的 JS 解析器（acorn，vendor
 * 到 tools/vendor/acorn.js，见该目录 README.md），"哪些是顶层声明"这个问题只有一个
 * 答案来源——AST 的 Program.body。
 *
 * 本文件是薄封装层，只暴露 load_data.js 需要的三个能力，不是通用 AST 工具箱：
 *   parseScript：解析一份脚本文本，失败时抛出统一的 code='script-parse-failed' 错误。
 *   findTopLevelDeclarations：Program.body 里的顶层 const/let/var 声明（不含任何嵌套
 *     作用域——函数体/块/对象与数组字面量内部的同名声明天然不在 ast.body 里，H1 的
 *     "局部同名 const 排在顶层声明之前"这类顺序问题在 AST 语义下不可能再发生）。
 *   findTopLevelSoundsAssignments：顶层 `SOUNDS.x = ...` 形式的赋值表达式，替代原来
 *     `/^SOUNDS\.\w+ = Object\.assign\(.*?\);$/gm` 这条正则。
 *
 * 「顶层」在这里严格等于 acorn 语义上的 Program.body 数组，不做任何近似或启发式判断——
 * 这正是相对 js_lex.js 的正则+括号深度近似方案的改进点。
 */
const acorn = require('../vendor/acorn.js');

/* parseScript(text, opts) -> AST
 * opts.sourceType 默认 'script'（普通脚本，顶层 `{...}` 是代码块不是模块顶层声明的
 * 语法糖差异对本文件的用途没有影响，但保留可覆盖的口子给 <script type="module"> 场景）。
 * ecmaVersion 固定 'latest'——课件与工具脚本都不需要限制到某个具体 ES 版本，'latest'
 * 让 acorn 自己决定当前支持的最新语法集合，减少这里手动跟进版本号的维护负担。
 * 解析失败时抛出的错误：
 *   - err.code = 'script-parse-failed'
 *   - err.message 保留 acorn 原始 message（含行列位置，如 "Unexpected token (3:10)"）
 *   - err.pos / err.loc：acorn SyntaxError 自带的位置信息（存在才透传，不伪造）
 *   - err.cause：原始 acorn 错误对象，便于需要时进一步查看
 */
function parseScript(text, opts) {
  const options = Object.assign({ ecmaVersion: 'latest', sourceType: 'script' }, opts);
  try {
    return acorn.parse(text, options);
  } catch (e) {
    const err = new Error('js_ast.parseScript: 解析失败：' + e.message);
    err.code = 'script-parse-failed';
    if (typeof e.pos === 'number') err.pos = e.pos;
    if (e.loc) err.loc = e.loc;
    err.cause = e;
    throw err;
  }
}

/* findTopLevelDeclarations(text, opts) -> [{name, kind, start, end, text}]
 * 遍历 ast.body 里 type==='VariableDeclaration' 的节点，对每个 declarations[i]：
 *   - id.type==='Identifier' → 收一条；text 取整条 VariableDeclaration 节点（不是单个
 *     declarator）的源码切片——这样切出来的文本本身就是一条完整合法的 JS 语句
 *     （`const a=1, b=2;` 这种一条语句声明多个变量的写法，若真的出现，两个
 *     declarator 会各收一条记录，但 text 相同，都是整条语句；load_data.js 目前的
 *     数据声明全部是单 declarator 形式，这条规则只是为不破坏"text 直接能进 vm 执行"
 *     这一契约而写，不是当前真实输入会触发的分支）。
 *   - id.type!=='Identifier'（解构 `const {a,b}=x`）→ 跳过，不视为一条顶层声明、
 *     也不报错——解构不是 load_data.js 关心的"具名顶层常量"形状。
 * 只看 ast.body：函数体、代码块、对象/数组字面量内部的同名声明不会出现在这里，
 * 不需要额外的深度判断（对比 js_lex.js 的 bracketDepthAt 近似方案）。
 *
 * H-A 修复（预筛 high，2026-09-11）：text/end 会把与该 VariableDeclaration **同一行、
 * 紧随其后**的行内注释一并纳入——改前只切到 node.end（分号处），丢掉了 HEAD（改前
 * js_lex 版本，单行分支取 `tail.split('\n')[0]` 整行）原本会保留的行尾注释，这是一个
 * 真实回归：tools/capture_lesson_media.js 把 declaration() 的返回值直接写回受版本
 * 控制的 frontend/src/media/weekNN/*.js 媒体快照文件，那几份文件里 embed_assets.py
 * 注入的"勿手改"标记、以及 week02/03 RESERVED、FIRST_TEACH_DAY 的行尾说明，都是靠这
 * 条行尾注释存活的（tools/baseline.py 的 skeletonSha256 也以 declaration() 的 text
 * 为准，行尾注释丢失会改变 skeleton 哈希）。
 * 用 acorn 的 onComment 收集全部注释节点（parseScript 会把 opts.onComment 原样透传
 * 给 acorn.parse——不是另起一层"从 node.end 扫到行尾"的文本启发式，是同一次 AST
 * 解析顺带拿到的结构化数据）。判定条件：注释的 start >= node.end，且两者之间（用
 * text.slice 取出的原文切片）**只含空白字符（不含换行）**（正则 `^[^\S\r\n]*$`，
 * H-C 修复 + L-3 修复（第四轮）放宽 Unicode 空白，见下方
 * extendPastTrailingSameLineComments 头注释——改前这里只检查"不含换行"，中间夹着的
 * 真代码（下一条完整语句、一次函数调用）会被一起吞并，这条注释才真正兑现）。命中就
 * 把切片终点延到该注释的 end；同一行有多个行内注释（如 `/* a *\/ /* b *\/`）依次
 * 延伸，各自都要求与当前延伸后的终点之间只有空格/制表符。
 * 不会误吞下一条声明前的独立注释行——那种注释与上一条声明之间必然隔着至少一个
 * 换行，不满足"中间只有空格/制表符"条件。
 *
 * L1（预筛 low，第三轮，2026-09-11，主会话裁定：选"注释起始于同一行"，不额外限制
 * 注释自身不能跨行）：块注释本身含换行时（`const A=1; /* a\nb *\/`），延伸后的切片
 * 会跨行——这与本段上面"同一行"的字面措辞不符，措辞已改成"注释**起始于**同一行"。
 * 不选"限制只延伸到不含换行的注释"这个更严格的方案：判定条件本来就只约束"声明
 * 语句末尾到注释起点之间"这一小段间隙必须是纯空白，不约束注释自身的内容——块注释
 * 从右贴着声明语句开始、内部再怎么跨行，都仍然是"紧跟在这条声明后面"的同一份注释
 * 整体，与 findTopLevelDeclarations 本来就允许 node.text 本身跨越多行（对象/数组
 * 字面量换行书写）是同一个道理，不是需要格外收紧的新边界；收紧了反而要为"注释多长
 * 算跨行、跨几行还算"另立一套没有实际需求驱动的规则。 */
function findTopLevelDeclarations(text, opts) {
  const { ast, comments } = parseScriptCollectingComments(text, opts);
  const out = [];
  for (const node of ast.body) {
    if (node.type !== 'VariableDeclaration') continue;
    const sliceEnd = extendPastTrailingSameLineComments(text, node.end, comments);
    for (const decl of node.declarations) {
      if (!decl.id || decl.id.type !== 'Identifier') continue;
      out.push({
        name: decl.id.name,
        kind: node.kind,
        start: node.start,
        end: sliceEnd,
        text: text.slice(node.start, sliceEnd)
      });
    }
  }
  return out;
}

/* parseScriptCollectingComments(text, opts) -> {ast, comments}
 * findTopLevelDeclarations 与 findTopLevelSoundsAssignments 共用的解析入口（⑤ 预筛
 * L3，第三轮，2026-09-11：改前只有 findTopLevelDeclarations 收集注释、按同一行延伸
 * 切片终点，findTopLevelSoundsAssignments 不收集也不延伸，是两套切片口径——同一份
 * export_data.js 输出里会出现"const 声明带行尾注释、SOUNDS 赋值不带"。现在两个函数
 * 都调这一个共用入口，注释收集与延伸逻辑物理上只有一份实现，不是各自维护一份可能
 * 漂移的近似）。comments 用 acorn 的 onComment 收集，按源码顺序排列。 */
function parseScriptCollectingComments(text, opts) {
  const comments = [];
  const parseOpts = Object.assign({}, opts, {
    onComment: function (block, value, start, end) { comments.push({ start: start, end: end }); }
  });
  const ast = parseScript(text, parseOpts);
  return { ast: ast, comments: comments };
}

/* extendPastTrailingSameLineComments(text, end, comments) -> number
 * comments 按 onComment 的调用顺序（即源码顺序）排列。从 end 开始，只要下一个尚未
 * 被吞并的注释与当前终点之间只有空格/制表符，就把终点推到该注释的 end，继续尝试
 * 下一个；一旦中间夹着非空白字符（换行，或任何真代码），后面的注释只会更远，直接
 * 停止。
 * H-C 修复（预筛 high，第三轮，2026-09-11，与 H-A/H-B 同一批次，避免与 load_data.js
 * 的 H-2——chunks 按声明节点去重，另一件事——混淆，改用 H-C 而不是 H-2）：改前的
 * 判定条件是 `/[\r\n]/.test(...)`（只检查"中间有没有换行"），而不是本函数自身文档
 * 承诺的"中间只有空格/制表符"——
 * 这两者并不等价：`const META={...}; const RESERVED=[...]; /* 说明 *\/` 里 META 声明
 * 结束到该注释之间的文本是 `" const RESERVED=[...]; "`，不含换行，旧判定就会把
 * RESERVED 这条完整的顶层声明也吞进 META 的切片，load_data.js 用这份文本再次求值
 * 时因此报出虚假的 duplicate-declaration；`const META={...}; sideEffect(); /*x*\/`
 * 同理会把 sideEffect() 这次函数调用一起吞进 META 的切片，load_data.js 把这段文本
 * 当 META 的声明体塞进 vm chunks，sideEffect() 因而在加载 META 时被真实执行。改用
 * `^[ \t]*$` 精确匹配文档承诺的"只有空格/制表符"，两种场景都会在遇到非空白字符时
 * 立即 break，不再继续吞并。
 *
 * L-3 修复（预筛 low，第四轮，2026-09-11）：`^[ \t]*$` 只认 ASCII 空格/制表符，比
 * HTML/JS 的"空白"概念窄——NBSP（U+00A0）、全角空格（U+3000）等 Unicode 空白字符
 * 落在声明语句末尾与行尾注释之间时会被判定为"非空白"，导致注释延伸提前 break（实测：
 * `const A=1; /*x*\/` 切片会在这条判据下只剩 `const A=1;`，注释丢失；改前 H-C
 * 修复之前的 `/[\r\n]/` 判据反而会保留，是本次收窄带来的新回归面）。放宽为
 * `^[^\S\r\n]*$`（"非换行的空白字符"，`\S` 的取反天然覆盖 Unicode 空白类，只**排除**
 * `\r`/`\n` 这两个必须继续要求"同一行"语义的字符）——现役 `frontend/src`、`tools`
 * 全量 grep 零命中这类字符（今天不改变任何现役输出），但中文注释环境下并非不可想象，
 * 提前把判据补齐比等它在某次真实数据里复现更省事。 */
function extendPastTrailingSameLineComments(text, end, comments) {
  let current = end;
  for (const c of comments) {
    if (c.start < current) continue;
    if (!/^[^\S\r\n]*$/.test(text.slice(current, c.start))) break;
    current = c.end;
  }
  return current;
}

/* findTopLevelSoundsAssignments(text, opts) -> [{text}]
 * 遍历 ast.body 里 ExpressionStatement 且 expression.type==='AssignmentExpression'、
 * left 是 MemberExpression 且 left.object 是名为 SOUNDS 的 Identifier 的节点，切出
 * 整条语句的源码片段。替代原来 load_data.js 里那条正则
 * `/^SOUNDS\.\w+ = Object\.assign\(.*?\);$/gm`——不再限定右侧必须是 Object.assign(...)
 * 调用、也不再限定赋值运算符必须是纯 `=`，只要形状是"给 SOUNDS 的某个属性赋值"就收，
 * 这是本文件调用方（load_data.js）实际需要的判定粒度（原正则的额外限制只是巧合地
 * 匹配了当前唯一的真实写法，不是这类顶层语句该有的语义边界）。
 *
 * ⑤ 预筛 L3（第三轮，2026-09-11）：改前本函数只切到 node.end，不做行尾注释延伸，与
 * findTopLevelDeclarations 是两套切片口径——export_data.js 把两个函数的结果拼进
 * 同一份 chunks 输出，会出现"const 声明带行尾注释、SOUNDS 赋值不带"的不一致。现在
 * 改调共用的 parseScriptCollectingComments + extendPastTrailingSameLineComments（与
 * findTopLevelDeclarations 完全同一套实现，不是另起一份近似），`SOUNDS.x = ...;
 * /* 说明 *\/` 这类写法现在也能正确保留同一行紧随其后的行尾注释。四周现役
 * `SOUNDS.x = ...` 行目前均无行尾注释（已实测确认），这条统一今天不改变任何现役
 * 输出，是为未来一致性做的收口。 */
function findTopLevelSoundsAssignments(text, opts) {
  const { ast, comments } = parseScriptCollectingComments(text, opts);
  const out = [];
  for (const node of ast.body) {
    if (node.type !== 'ExpressionStatement') continue;
    const expr = node.expression;
    if (!expr || expr.type !== 'AssignmentExpression') continue;
    const left = expr.left;
    if (!left || left.type !== 'MemberExpression') continue;
    if (!left.object || left.object.type !== 'Identifier' || left.object.name !== 'SOUNDS') continue;
    const sliceEnd = extendPastTrailingSameLineComments(text, node.end, comments);
    out.push({ text: text.slice(node.start, sliceEnd) });
  }
  return out;
}

module.exports = { parseScript, findTopLevelDeclarations, findTopLevelSoundsAssignments };
