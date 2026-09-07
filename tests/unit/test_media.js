const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {loadData,declaration}=require('../../tools/validation/load_data');
function value(raw,key){const box={};vm.runInNewContext(declaration(raw,key)+'\nresult='+key+';',box);return box.result;}
const all=[];
for(const file of fs.readdirSync('build').filter(f=>/^week\d\d\.html$/.test(f)).sort()){
  const raw=fs.readFileSync(`build/${file}`,'utf8'),d=loadData(raw),audio=value(raw,'WORD_AUDIO'),phonemes=value(raw,'PHONEME_AUDIO');
  for(const name of ['PHONEME_AUDIO','WORD_AUDIO','PHONEME_ILL','WORD_ILL','WALL_ILL','BOOK_IMG','CELEBRATE_NAT']){
    const source=fs.readFileSync(`frontend/src/media/${file.replace('.html','')}/${name.toLowerCase()}.js`,'utf8');
    assert.equal(declaration(raw,name),declaration(source,name),`${file}: generated media differs from source ${name}`);
  }
  for(const [key,s] of Object.entries(d.SOUNDS)) assert(phonemes[s.audioKey||key],`${file} missing phoneme ${key}`);
  const requested=new Set(d.BOOK.pages.map(p=>p.line.replace(/"/g,'')));
  for(const day of d.DAYS)for(const step of day.steps)for(const b of step.blocks){
    if(b.b==='blend') b.words.forEach(w=>requested.add(w));
    if(b.b==='initialpick') b.words.forEach(w=>requested.add(w));
    if(b.b==='words') b.items.forEach(w=>requested.add(w));
    if(b.b==='flash') b.items.filter(i=>i.k==='w').forEach(i=>requested.add(i.v));
    if(b.b==='sentences'||b.b==='sight') b.items.forEach(i=>requested.add(i[0]));
  }
  Object.values(d.G1_ROUNDS).forEach(r=>[...r.pos,...r.neg].forEach(w=>requested.add(w)));
  d.G3_PAIRS.flat().forEach(w=>requested.add(w));d.G4_WORDS.forEach(w=>requested.add(w));d.G5_WHITELIST.forEach(w=>requested.add(w));
  for(const word of requested) assert(audio[word],`${file} missing embedded word/line: ${word}`);
  all.push({file,phonemes,audio});
  console.log(`PASS ${file}: ${requested.size} used word/line recordings and all phoneme aliases embedded`);
}
for(const {file,phonemes} of all.slice(1))for(const [key,data] of Object.entries(phonemes)){
  const previous=all.find(x=>x.file!==file&&x.phonemes[key]);
  if(previous)assert.equal(data,previous.phonemes[key],`cross-week phoneme drift: ${file}/${key}`);
}
console.log('PASS cross-week phoneme bytes');
