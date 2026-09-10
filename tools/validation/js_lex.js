/* 最小 JS 词法扫描（里程碑 2 段 3 第九批，I-M2/H-M1 共用底层实现）。
 *
 * 不是完整的 JS 解析器——只做两件事，供 load_data.js 与 migration_audit.js 各自的
 * "字符串/注释会不会干扰正则匹配"问题共用同一套状态机，不各自维护一份近似实现：
 *   ① maskStringsAndComments(src)：把字符串/模板字符串/行注释/块注释的内容原样替换成
 *      空格（保留换行与总长度），后续基于正则的行首匹配、括号深度统计不会被字符串里的
 *      巧合文本或注释里的诱饵文本影响。
 *   ② scanState(src, index)：返回 index 位置落在哪种词法状态（'code'/'line-comment'/
 *      'block-comment'/'string-single'/'string-double'/'template'），供"这个匹配是不是
 *      落在注释或字符串里"这类判断直接用状态而不是零散的启发式正则。
 *
 * 已知简化（maskStringsAndComments/bracketDepthAt 当前的真实调用方 load_data.js
 * 不会触发，见该文件调用点头注释）：
 *   - maskStringsAndComments 对模板字符串仍按"整段——含 `${...}` 插值表达式——都
 *     视为不透明文本"处理，不单独识别插值内部的真代码；load_data.js 处理的是
 *     数据层 JS（顶层 const 声明用普通数组/对象字面量，不使用带插值的模板字符串），
 *     这条简化不影响它的实际输入。
 *   - 不处理正则字面量（/.../）与字符串边界的歧义（除号 vs 正则开始）——两处调用方
 *     处理的都是数据/审计脚本源码，不依赖这条边界判断。
 *
 * scanState（H-M1，段 3 第九批，外审 medium，2026-09-10 升级为帧栈模型）：改前与
 * maskStringsAndComments 同款简化——整段模板字符串（含 `${...}` 插值）一律按
 * "非 code" 处理，migration_audit.js 的 L_FIELD_CONSUMER_SPECS 里恰好有一条真实
 * 消费点写在模板字符串的 `${...}` 插值内部（render-blocks.js 的
 * `${forms.map(f => tileHTML(f,'tile--lg',true)).join('')}`），这条简化会把这处
 * **真代码**误判成"不是 code"，进而被 isLikelyCommentMatch 误判为诱饵、
 * findFirstNonCommentMatch 找不到任何非诱饵匹配、连锁导致 buildAudit() 把这个
 * 已完成迁移的消费点误报成 fail。改用显式帧栈跟踪"当前在哪一层"：
 *   - 'code' 帧：普通代码作用域（含顶层与 `${...}` 插值内部）；
 *   - 'template' 帧：模板字符串的字面量文本部分（非插值段）。
 * 在 code 帧里遇到反引号，压入一个 template 帧；template 帧里遇到未转义反引号，
 * 弹出该帧（模板闭合）；template 帧里遇到 `${`，压入一个新的 code 帧（bracketDepth
 * 从 0 开始，只计这个插值内部自己的花括号嵌套——插值内部的对象字面量等会让
 * bracketDepth > 0，遇到 bracketDepth===0 时的下一个 `}` 才是这个插值自己的闭合）。
 * 字符串/注释仍是与"当前处于哪个帧"正交的子状态，闭合后原样回到所在帧继续扫描
 * （字符串/注释不会跨帧边界）。支持任意深度的嵌套模板字符串。 */

function scanState(src, uptoIndex) {
  const frames = [{ type: 'code' }]; // 帧栈，栈底是顶层代码，永不弹出
  let mode = 'normal'; // normal | line-comment | block-comment | string-single | string-double
  let i = 0;
  const n = Math.min(uptoIndex, src.length);
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (mode === 'line-comment') {
      if (c === '\n') mode = 'normal';
      i += 1; continue;
    }
    if (mode === 'block-comment') {
      if (c === '*' && c2 === '/') { mode = 'normal'; i += 2; continue; }
      i += 1; continue;
    }
    if (mode === 'string-single' || mode === 'string-double') {
      const quote = mode === 'string-single' ? "'" : '"';
      if (c === '\\') { i += 2; continue; }
      if (c === quote) { mode = 'normal'; i += 1; continue; }
      if (c === '\n') { mode = 'normal'; i += 1; continue; } // 未闭合字符串的保护性截断，不让状态机死锁
      i += 1; continue;
    }
    // mode === 'normal'：按当前栈顶帧类型分派
    const frame = frames[frames.length - 1];
    if (frame.type === 'template') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { frames.pop(); i += 1; continue; } // 模板闭合，回到外层帧
      if (c === '$' && c2 === '{') { frames.push({ type: 'code', braceDepth: 0 }); i += 2; continue; } // 进入插值
      i += 1; continue;
    }
    // frame.type === 'code'
    if (c === '/' && c2 === '/') { mode = 'line-comment'; i += 2; continue; }
    if (c === '/' && c2 === '*') { mode = 'block-comment'; i += 2; continue; }
    if (c === '"') { mode = 'string-double'; i += 1; continue; }
    if (c === "'") { mode = 'string-single'; i += 1; continue; }
    if (c === '`') { frames.push({ type: 'template' }); i += 1; continue; }
    if (typeof frame.braceDepth === 'number') {
      // 只有"由 ${ 压入的 code 帧"才带 braceDepth（顶层帧没有），用它判定 `}`
      // 是不是这个插值自己的闭合——插值内部若还有嵌套对象字面量的 `{`/`}`，
      // 先各自配对完，braceDepth 归零后遇到的下一个 `}` 才弹帧。
      if (c === '{') { frame.braceDepth += 1; i += 1; continue; }
      if (c === '}') {
        if (frame.braceDepth === 0) { frames.pop(); i += 1; continue; }
        frame.braceDepth -= 1; i += 1; continue;
      }
    }
    i += 1;
  }
  if (mode === 'line-comment') return 'line-comment';
  if (mode === 'block-comment') return 'block-comment';
  if (mode === 'string-single') return 'string-single';
  if (mode === 'string-double') return 'string-double';
  const top = frames[frames.length - 1];
  return top.type === 'template' ? 'template' : 'code';
}

function maskStringsAndComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  const blank = (text) => text.replace(/[^\n]/g, ' ');
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (c === '/' && c2 === '/') {
      let j = i;
      while (j < n && src[j] !== '\n') j++;
      out += blank(src.slice(i, j));
      i = j;
      continue;
    }
    if (c === '/' && c2 === '*') {
      let j = i + 2;
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++;
      j = Math.min(j + 2, n);
      out += blank(src.slice(i, j));
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      while (j < n && src[j] !== quote && src[j] !== '\n') {
        if (src[j] === '\\') j++;
        j++;
      }
      j = Math.min(j + 1, n);
      out += blank(src.slice(i, j));
      i = j;
      continue;
    }
    if (c === '`') {
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '`') { j++; break; }
        j++;
      }
      out += blank(src.slice(i, j));
      i = j;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/* bracketDepthAt(maskedSrc, index) -> number：在已经过 maskStringsAndComments 处理的
 * 文本上，数 `{`/`(`/`[` 与对应闭合符号从头到 index 的净深度——不区分具体括号类型
 * （调用方只关心"是否在某个嵌套结构内部"，不关心是哪一种），字符串/注释已被掩码掉，
 * 不会被误计入深度。 */
function bracketDepthAt(maskedSrc, index) {
  let depth = 0;
  const n = Math.min(index, maskedSrc.length);
  for (let i = 0; i < n; i++) {
    const c = maskedSrc[i];
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth--;
  }
  return depth;
}

module.exports = { scanState, maskStringsAndComments, bracketDepthAt };
