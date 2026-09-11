const fs=require('node:fs');
const {loadData,declaration,NAMES,collectScriptSources}=require('./load_data');
/* M-D 修复（预筛 medium，2026-09-11）：改前这里另起一条正则
 * `/^SOUNDS\.\w+ = Object\.assign\(.*?\);$/gm`，与 tools/validation/js_ast.js 的
 * findTopLevelSoundsAssignments（load_data.js 的 loadData() 内部已经改走它）判定
 * "哪些顶层 SOUNDS.x = ... 赋值算数"是两套独立判据——H1 的同款形态：js_ast 已经
 * 放宽到"只要形状是给 SOUNDS 某属性赋值就收"（不再限定右侧必须是 Object.assign(...)
 * 调用、赋值符必须是纯 `=`），这条正则没跟着放宽，今天只是因为四周现役产物碰巧只有
 * 一种真实写法（`SOUNDS.x = Object.assign(...)`）才两者一致。改走同一份 AST 判据：
 * export_data.js 的 raw 入参恒为完整 weekNN.html（本文件对 loadData(raw) 用的是
 * 默认 html=true，全仓库唯一调用方 tools/extract_data_layer.py 传入的 --target 也
 * 是构建产物 html），先用 collectScriptSources 按 <script> 拆分（与 loadData()
 * 内部处理跨 script 的方式一致，不拼接整份 HTML 喂给 acorn——acorn 不能把
 * `<!doctype html>` 当 JS 解析），再对每个来源调用 findTopLevelSoundsAssignments。 */
const {findTopLevelSoundsAssignments}=require('./js_ast');
const [target,out]=process.argv.slice(2);
const raw=fs.readFileSync(target,'utf8');
const data=loadData(raw);
const chunks=['/* Derived snapshot; author frontend/src/weeks/weekNN.data.js instead. */'];
for(const name of NAMES){
  const value=declaration(raw,name);
  if(value) chunks.push(value);
  else if(name==='META') chunks.push('const META = '+JSON.stringify(data.META,null,2)+';');
  if(name==='SOUNDS'){
    for(const source of collectScriptSources(raw,true)){
      chunks.push(...findTopLevelSoundsAssignments(source).map(x=>x.text));
    }
  }
}
fs.writeFileSync(out,chunks.join('\n\n')+'\n');
console.log('EXPORTED '+out);
