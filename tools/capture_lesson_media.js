/* After a media tool updates a distributable, capture only adopted media declarations. */
const fs=require('node:fs'),path=require('node:path');
const {declaration}=require('./validation/load_data');
const file=path.resolve(process.argv[2] || '');
if(!/^week\d{2}\.html$/.test(path.basename(file))) throw Error('Usage: node tools/capture_lesson_media.js weekNN.html');
const root=path.resolve(__dirname,'..');
const raw=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
const names=['PHONEME_AUDIO','WORD_AUDIO','PHONEME_ILL','WORD_ILL','WALL_ILL','BOOK_IMG','CELEBRATE_NAT'];
const writes=[];
for(const name of names){
  const target=path.join(root,'frontend/src/media',path.basename(file,'.html'),name.toLowerCase()+'.js');
  const from=declaration(raw,name);
  if(!from || !fs.existsSync(target)) throw Error('Missing media declaration/source: '+name);
  writes.push([target,from+'\n']);
}
for(const [target,source] of writes){fs.writeFileSync(target+'.tmp',source);fs.renameSync(target+'.tmp',target);}
console.log('Captured media only: '+path.basename(file)+'\nRun python tools/project.py build and python tools/project.py check.');
