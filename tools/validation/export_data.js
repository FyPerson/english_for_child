const fs=require('node:fs');
const {loadData,declaration,NAMES}=require('./load_data');
const [target,out]=process.argv.slice(2);
const raw=fs.readFileSync(target,'utf8');
const data=loadData(raw);
const chunks=['/* Derived snapshot; author frontend/src/weeks/weekNN.data.js instead. */'];
for(const name of NAMES){
  const value=declaration(raw,name);
  if(value) chunks.push(value);
  else if(name==='META') chunks.push('const META = '+JSON.stringify(data.META,null,2)+';');
  if(name==='SOUNDS') chunks.push(...(raw.match(/^SOUNDS\.\w+ = Object\.assign\(.*?\);$/gm)||[]));
}
fs.writeFileSync(out,chunks.join('\n\n')+'\n');
console.log('EXPORTED '+out);
