const fs=require('node:fs');
const {loadData,NAMES,collectScriptEntries,findAllTopLevelDeclarations,nameToDeclarationText}=require('./load_data');
/* M-D 修复（预筛 medium，2026-09-11）：改前这里另起一条正则
 * `/^SOUNDS\.\w+ = Object\.assign\(.*?\);$/gm`，与 tools/validation/js_ast.js 的
 * findTopLevelSoundsAssignments（load_data.js 的 loadData() 内部已经改走它）判定
 * "哪些顶层 SOUNDS.x = ... 赋值算数"是两套独立判据——H1 的同款形态：js_ast 已经
 * 放宽到"只要形状是给 SOUNDS 某属性赋值就收"（不再限定右侧必须是 Object.assign(...)
 * 调用、赋值符必须是纯 `=`），这条正则没跟着放宽，今天只是因为四周现役产物碰巧只有
 * 一种真实写法（`SOUNDS.x = Object.assign(...)`）才两者一致。改走同一份 AST 判据：
 * export_data.js 的 raw 入参恒为完整 weekNN.html（本文件对 loadData(raw) 用的是
 * 默认 html=true，全仓库唯一调用方 tools/extract_data_layer.py 传入的 --target 也
 * 是构建产物 html），对每个 <script> 来源调用 findTopLevelSoundsAssignments（R-1
 * 修复，2026-09-11：来源列表现在直接复用下方为组装声明 chunks 而计算的 entries，
 * 不再另调一次 collectScriptSources(raw,true)——两者是对同一个 raw 的等价确定性
 * 计算，entries.map(e=>e.text) 与 collectScriptSources(raw,true) 结果相同，省一次
 * 重复的正则扫描）。
 *
 * 已知限制（不在本轮修复范围内，见 load_data.js 头部"已知限制"第 1 条）：下方在
 * 处理到 NAMES 里的 SOUNDS 这一项时，立即把该 <script> 的顶层 SOUNDS 赋值插入到
 * SOUNDS 声明紧后面——这与 loadData() 内部"先推入全部声明、SOUNDS 赋值统一追加在
 * 最后"的顺序不同，两者对"声明与赋值的相对顺序会不会影响最终求值结果"这类输入可能
 * 给出不同答案。这是既有行为，本轮 R-1 的修复没有触碰这个顺序。 */
const {findTopLevelSoundsAssignments}=require('./js_ast');
const [target,out]=process.argv.slice(2);
const raw=fs.readFileSync(target,'utf8');
const data=loadData(raw);
/* R-1 修复（轮 K 外审 HIGH，2026-09-11）：chunks 组装改用与 loadData() 共用的
 * nameToDeclarationText（见 load_data.js 该函数头注释）——不再逐个 NAME 各自调用
 * declaration(raw,name)，那条路径没有跨 NAME 去重，一条语句声明多个 NAME
 * （`const META={...}, RESERVED=[...];`）时会把同一条语句重复推入 chunks 两次，
 * 导出文件因此含两条相同的 const 语句、无法被 loadData() 再次解析（外审复现用例
 * 正是这个形态；用例 13 此前只检查 loadData 本身，即使导出路径一直损坏也会通过）。
 * entries/decls 是对 raw 的确定性重新计算（纯函数、无副作用），与上面 loadData(raw)
 * 内部实际用的是同一份输入、同样固定 html=true；loadData(raw) 已经成功返回（否则
 * 不会执行到这里）意味着 decls 里每个 NAME 至多出现 1 次——NAMES 里任何一个名字
 * 出现 >1 次，loadData() 会在算出这份 decls 的同一时刻抛出 duplicate-declaration，
 * 执行根本到不了这里，因此下面不需要（也不应该）再重复一次 loadData() 已经做过的
 * 重复声明检查。 */
const entries=collectScriptEntries(raw,true);
const decls=findAllTopLevelDeclarations(entries);
const pushedDeclNodes=new Set();
const chunks=['/* Derived snapshot; author frontend/src/weeks/weekNN.data.js instead. */'];
for(const name of NAMES){
  const text=nameToDeclarationText(decls,name,pushedDeclNodes);
  if(text){
    chunks.push(text);
  }else if(name==='META' && !(decls.get('META') && decls.get('META').length===1)){
    /* 只有"压根没有顶层 META 声明"时才退回 data.META 的 JSON 兜底——如果 META 确实
     * 有声明、只是被同一条语句里的另一个 NAME 抢先消费掉了（nameToDeclarationText
     * 返回 null 的另一种成因，见其头注释），不应该再用 JSON 兜底重复补一次，那样
     * 会把同一份数据以两种不同形态（原始声明文本 + JSON 兜底）写进导出文件两次。
     * 这种情况理论上不会真的发生：META 恒为 NAMES[0]，处理到它时 pushedDeclNodes
     * 必为空。这里显式重新查一次 decls.get('META')（而不是只看 text 是否为 null）
     * 是为了不依赖"META 恒排在 NAMES 第一项"这个隐含顺序假设——就算未来 NAMES 顺序
     * 调整，这个判断依然正确。 */
    chunks.push('const META = '+JSON.stringify(data.META,null,2)+';');
  }
  if(name==='SOUNDS'){
    for(const entry of entries){
      chunks.push(...findTopLevelSoundsAssignments(entry.text).map(x=>x.text));
    }
  }
}
fs.writeFileSync(out,chunks.join('\n\n')+'\n');
console.log('EXPORTED '+out);
