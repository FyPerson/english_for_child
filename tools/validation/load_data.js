const vm = require('node:vm');
const NAMES = 'META RESERVED SOUNDS W WALL_HINT BOOK FIRST_TEACH_DAY G1_ROUNDS G1_THEME G3_PAIRS G4_WORDS G5_WHITELIST DAYS RESERVED_RETEST PROBE_A PROBE_B GLOBAL_RESERVED ASSESS_TEXT ASSESSMENT_WORDS TAUGHT_SIGHT'.split(' ');
function declaration(raw, name) {
  const re = new RegExp('^const ' + name + ' = ', 'm');
  const m = re.exec(raw);
  if (!m) return '';
  // Data declarations terminate at a top-level closing brace/bracket, or on one line.
  const tail = raw.slice(m.index);
  const first = tail.split('\n')[0];
  if (/;/.test(first)) return first;
  const end = /^\s*[}\]];/m.exec(tail);
  if (!end) throw new Error(`Unterminated data declaration: ${name}`);
  return tail.slice(0, end.index + end[0].length);
}
function loadData(raw, html = true) {
  const chunks = NAMES.map(n => declaration(raw, n)).filter(Boolean);
  chunks.push(...(raw.match(/^SOUNDS\.\w+ = Object\.assign\(.*?\);$/gm) || []));
  const box = {};
  vm.runInNewContext(chunks.join('\n') + '\n' + NAMES.map(n => `if(typeof ${n} !== 'undefined') result.${n} = ${n};`).join('\n'), {result:box}, {timeout:1000});
  if (!box.META && html) {
    const racks = [...raw.matchAll(/const RACK_LETTERS = '([a-z]+)'\.split\(''\)/g)].map(m=>m[1]);
    const key = raw.match(/const KEY = '([^']+)'/)[1];
    const wall = raw.match(/\$\{'([a-z]+)'\.split\(''\)\.map\(c=>\{/);
    box.META = {week:Number(key.match(/w(\d+)/)[1]),storageKey:key,rackG4:racks[0],rackG5:racks[1],wallLetters:wall ? wall[1] : Object.keys(box.FIRST_TEACH_DAY).join('')};
  }
  return box;
}
module.exports = {loadData, declaration, NAMES};
