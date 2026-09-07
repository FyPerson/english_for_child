const assert = require('node:assert/strict');
const {validateAssessment, GLOBAL_POOL} = require('../../tools/validation/assessment_contract');
function fixture(){
  return {
    META:{week:4, consolidation:true, wallLetters:'satipnckehrmdgoulfb'},
    SOUNDS:Object.fromEntries('satipnckehrmdgoulfb'.split('').map(c=>[c,{}])),
    RESERVED:['hem','ram','rid','dam','kid'], RESERVED_RETEST:['hum','hemx','rag','rim','rot'],
    PROBE_A:[],PROBE_B:[],GLOBAL_RESERVED:GLOBAL_POOL,
    ASSESS_TEXT:Array(16).fill('A pup is up.').join(' '),TAUGHT_SIGHT:['a','i','is','see','the','to'],
    W:{cat:{zh:'猫'}},FIRST_TEACH_DAY:{},BOOK:{pages:[]},WALL_HINT:{},
    G1_ROUNDS:{},G1_THEME:{},G3_PAIRS:[],G4_WORDS:[],G5_WHITELIST:[],
    DAYS:[{title:'复习',goal:'复习',wd:'',steps:[{t:'练习',blocks:[{b:'blend',words:['cat']},{b:'book'},{b:'output',html:'说一句话'},{b:'checks',items:[]}]}]}]
  };
}
const base=fixture(); base.RESERVED_RETEST[1]='nod';
assert.deepEqual(validateAssessment(base), []);
const reject = (name,mutate,fragment)=>{
  const d=structuredClone(base);mutate(d);
  assert(validateAssessment(d).some(e=>e.includes(fragment)),name+': expected '+fragment);
};
reject('normalized overlap',d=>d.RESERVED_RETEST[0]='HEM!', '冲突');
reject('duplicate in one pool',d=>d.RESERVED[1]='hem','冲突');
reject('missing global pool',d=>d.GLOBAL_RESERVED.pop(),'40 词');
reject('word dictionary leak',d=>d.W.hem={zh:'衣边'},'泄漏');
reject('nested block leak',d=>d.DAYS[0].steps[0].blocks.push({b:'wordforge',families:[{heads:['hem']}]}),'泄漏');
reject('sentence leak',d=>d.BOOK.pages.push({line:'HEM!'}),'泄漏');
reject('short passage',d=>d.ASSESS_TEXT='A pup.','60 词');
reject('passage dictionary overlap',d=>d.W.pup={zh:'小狗'},'内容词');
reject('passage pool overlap',d=>d.ASSESS_TEXT+=' Hem.','测评词冲突');
reject('passage sentence reuse',d=>d.BOOK.pages.push({line:'a PUP is up!'}),'整句复用');
reject('untaught passage',d=>d.ASSESS_TEXT+=' Zebra.','未教');
reject('missing output',d=>d.DAYS[0].steps[0].blocks=d.DAYS[0].steps[0].blocks.filter(b=>b.b!=='output'),'输出');
reject('not consolidation',d=>d.META.consolidation=false,'巩固周');
reject('new letter declaration',d=>d.FIRST_TEACH_DAY.z=1,'新字位');
reject('missing end-stage probes',d=>d.META.week=10,'PROBE_A');
reject('new sight-word escape',d=>d.TAUGHT_SIGHT.push('zebra'),'六词');
console.log('PASS assessment contract: valid fixture and 16 negative cases');
// A segment inside an explanation (e.g. lag while blending flag) is exposure too.
const fs = require('node:fs'), path = require('node:path');
const {loadData} = require('../../tools/validation/load_data');
const root = path.resolve(__dirname, '../..');
const actual = loadData(fs.readFileSync(path.join(root, 'build', 'week04.html'), 'utf8'));
const baseline = [...actual.RESERVED, ...actual.RESERVED_RETEST];
for (let week = 1; week <= 3; week++) {
  const previous = loadData(fs.readFileSync(path.join(root, 'build', `week0${week}.html`), 'utf8'));
  const exposed = new Set(JSON.stringify(previous).toLowerCase().match(/[a-z]+/g));
  assert.deepEqual(baseline.filter(word => exposed.has(word)), [], `W4 baseline exposed in W${week}`);
}
console.log('PASS W4 baseline: no exposure in any prior weekly data or explanation');
