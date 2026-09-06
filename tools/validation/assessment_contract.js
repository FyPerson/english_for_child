const GLOBAL_POOL = 'shelf shaft chimp chunk quilt quest moist hoist thorn north bleed greed groan float trail snail fried tried plum slug crust trust spoon stool wink honk yelp yank jump jolt shake flake stripe spine globe stove cube mule scarf shark'.split(' ');
const tokens = text => String(text || '').replace(/<[^>]*>/g, ' ').toLowerCase().match(/[a-z]+/g) || [];
const normalize = text => tokens(text).join(' ');
function validateAssessment(d) {
  if(d.META.week < 4) return [];
  const errors = [], fail = s=>errors.push(s);
  const pools = ['RESERVED','RESERVED_RETEST','PROBE_A','PROBE_B','GLOBAL_RESERVED'];
  for(const key of pools) if(!Array.isArray(d[key])) fail(`${key} 必须是数组`);
  if(errors.length) return errors;
  if(d.RESERVED.length !== 5 || d.RESERVED_RETEST.length !== 5) fail('周检与复测各需 5 词');
  const endOfStage = [10,20,30,40].includes(d.META.week);
  for(const key of ['PROBE_A','PROBE_B']) if(d[key].length !== (endOfStage ? 5 : 0)) fail(`${key} 数量与段末周不匹配`);
  if(d.META.week <= 40 && [...GLOBAL_POOL].sort().join() !== [...d.GLOBAL_RESERVED].map(normalize).sort().join()) fail('GLOBAL_RESERVED 必须完整保留附录 B 的 40 词');
  const owner = new Map();
  pools.forEach(key=> d[key].forEach(word=>{
    const w = normalize(word);
    if(!/^[a-z]+$/.test(w)) fail(`${key} 包含非法词项`);
    if(owner.has(w)) fail(`测评词冲突：${w} 同时属于 ${owner.get(w)} 与 ${key}`);
    owner.set(w,key);
  }));
  const taught = new Set(Object.keys(d.SOUNDS));
  [...d.RESERVED,...d.RESERVED_RETEST].forEach(w=>{
    if(!/^[^aeiou][aeiou][^aeiou]$/.test(normalize(w)) || [...normalize(w)].some(c=>!taught.has(c))) fail(`周检/复测词不是已教 CVC：${w}`);
  });
  const blocks = d.DAYS.flatMap(day=>day.steps.flatMap(step=>step.blocks));
  const teachingBlocks = blocks.filter(b=>!['exam','retest','probe','assessment'].includes(b.b));
  const textParts = [];
  function visit(v){
    if(typeof v === 'string') textParts.push(v);
    else if(Array.isArray(v)) v.forEach(visit);
    else if(v && typeof v === 'object') Object.values(v).forEach(visit);
  }
  // Cover all teaching fields, not just a hand-picked set of block properties.
  visit(teachingBlocks); visit(d.BOOK); visit(d.WALL_HINT); visit(d.SOUNDS);
  visit(d.G1_ROUNDS); visit(d.G1_THEME); visit(d.G3_PAIRS); visit(d.G4_WORDS); visit(d.G5_WHITELIST);
  visit(d.DAYS.map(day=>[day.title,day.goal,day.wd,...day.steps.map(s=>s.t)]));
  visit(Object.keys(d.W)); visit(Object.values(d.W));
  const visible = new Set(textParts.flatMap(tokens));
  for(const w of owner.keys()) if(visible.has(w)) fail(`测评词泄漏进教学内容：${w}`);
  if(d.META.consolidation){
    if(Object.keys(d.FIRST_TEACH_DAY).length) fail('巩固周不得声明新字位首教日');
    for(const [label, kinds] of [['拼读',['blend']],['阅读',['book','sentences']],['输出',['output']],['打卡',['checks']]]){
      if(!blocks.some(b=>kinds.includes(b.b))) fail(`巩固周缺少${label}块`);
    }
  }
  if(d.META.week === 4){
    if(!d.META.consolidation) fail('W4 必须是巩固周');
    if(new Set(d.META.wallLetters).size !== 19) fail('W4 点亮墙必须保留 19 字位');
    const passage = typeof d.ASSESS_TEXT === 'string' ? d.ASSESS_TEXT : '';
    const words = tokens(passage), sight = new Set((d.TAUGHT_SIGHT || []).map(normalize));
    if([...sight].sort().join() !== ['a','i','is','see','the','to'].sort().join()) fail('W4 累计认读词只能沿用前三周的六词');
    if(words.length < 60) fail('ASSESS_TEXT 不足 60 词');
    const vocabulary = new Set(Object.keys(d.W).map(normalize));
    for(const w of new Set(words)){
      if(owner.has(w)) fail(`测评短文与测评词冲突：${w}`);
      if(!sight.has(w) && vocabulary.has(w)) fail(`测评短文内容词进入教学词表：${w}`);
      if(!sight.has(w) && [...w].some(c=>!taught.has(c))) fail(`测评短文包含未教字位：${w}`);
    }
    const teachingSentences = new Set(textParts.flatMap(t=>String(t).split(/[.!?。！？]+/)).map(normalize).filter(Boolean));
    for(const s of passage.split(/[.!?]+/).map(normalize).filter(Boolean)) if(teachingSentences.has(s)) fail(`测评短文整句复用：${s}`);
    if(passage && textParts.some(t=>normalize(t).includes(normalize(passage)))) fail('测评短文全文复用');
  }
  return errors;
}
module.exports = {validateAssessment, GLOBAL_POOL, tokens, normalize};
