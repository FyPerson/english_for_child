// Extract the seven embedded-media declarations of a built lesson for the baseline (single-file form only).
// Usage: node tools/validation/media_declarations.js <weekNN.html>
// Prints JSON {NAME: {kind, text, entries: [[key, mime, sha256OfDecodedBytes], ...]}}.
// Exits 1 when a declaration is missing, duplicated or unterminated, when a value is not a data URI
// (reference-form lessons are rejected on purpose), or when a key is numeric (JS would reorder it).
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const {declaration} = require('./load_data');

const NAMES = ['PHONEME_AUDIO', 'WORD_AUDIO', 'PHONEME_ILL', 'WORD_ILL', 'WALL_ILL', 'BOOK_IMG', 'CELEBRATE_NAT'];
const DATA_URI = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/;

function extract(raw) {
  const out = {};
  for (const name of NAMES) {
    const count = (raw.match(new RegExp('^const ' + name + ' = ', 'mg')) || []).length;
    if (count !== 1) throw new Error(`${name}: expected exactly one declaration, found ${count}`);
    const text = declaration(raw, name);
    if (!text) throw new Error(`${name}: declaration not found`);
    if (raw.indexOf(text) !== raw.lastIndexOf(text)) throw new Error(`${name}: declaration text is not unique`);
    const box = {};
    vm.runInNewContext(text + '\nresult = ' + name + ';', box, {timeout: 2000});
    const value = box.result;
    const entries = [];
    const push = (key, v) => {
      if (typeof v !== 'string') throw new Error(`${name}[${key}]: value is not a string`);
      const m = DATA_URI.exec(v);
      if (!m) throw new Error(`${name}[${key}]: value is not a data URI; single-file form required`);
      entries.push([key, m[1], crypto.createHash('sha256').update(Buffer.from(m[2], 'base64')).digest('hex')]);
    };
    if (name === 'CELEBRATE_NAT') {
      push('', value);
      out[name] = {kind: 'string', text, entries};
    } else {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name}: not an object`);
      for (const [key, v] of Object.entries(value)) {
        if (/^\d+$/.test(key)) throw new Error(`${name}: numeric key ${key} would be reordered by JavaScript`);
        push(key, v);
      }
      out[name] = {kind: 'object', text, entries};
    }
  }
  return out;
}

if (require.main === module) {
  try {
    const raw = fs.readFileSync(process.argv[2], 'utf8');
    process.stdout.write(JSON.stringify(extract(raw)));
  } catch (error) {
    console.error('media_declarations: ' + error.message);
    process.exit(1);
  }
}
module.exports = {extract, NAMES};
