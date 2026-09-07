// Extract the seven embedded-media declarations of a built lesson for the baseline (single-file form only).
// Usage: node tools/validation/media_declarations.js <weekNN.html>
// Prints JSON {NAME: {kind, text, entries: [[key, mime, sha256OfDecodedBytes], ...]}}.
//
// The declaration text is checked statically line by line BEFORE it is evaluated: an object declaration may
// only contain plain `key: 'string'` properties (quoted or bare keys, string literal values), blank lines and
// single-line block comments; duplicate keys, computed keys, spread, accessors, nested objects or any other
// syntax are rejected. Values must be data URIs (reference-form lessons are rejected on purpose) and keys
// must not be numeric (JavaScript would reorder them). Only then is the text evaluated in a VM to obtain the
// unescaped key/value pairs, and the pair count must equal the number of scanned property lines.
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const {declaration} = require('./load_data');

const NAMES = ['PHONEME_AUDIO', 'WORD_AUDIO', 'PHONEME_ILL', 'WORD_ILL', 'WALL_ILL', 'BOOK_IMG', 'CELEBRATE_NAT'];
const DATA_URI = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/;
const PROPERTY = /^\s*(?:"([^"\\]*)"|'([^'\\]*)'|([\w$]+))\s*:\s*(?:"[^"\\]*"|'[^'\\]*')\s*,?\s*$/;
const COMMENT = /^\s*\/\*(?:[^*]|\*(?!\/))*\*\/\s*$/;
const STRING_DECL = /^const CELEBRATE_NAT = (?:"[^"\\]*"|'[^'\\]*');(?:\s*\/\*(?:[^*]|\*(?!\/))*\*\/)?\s*$/;

function scanObject(name, text) {
  const lines = text.split('\n');
  if (lines[0] !== `const ${name} = {` && lines[0] !== `const ${name} = {};`) throw new Error(`${name}: unexpected first line`);
  if (lines[0].endsWith('{};')) {
    if (lines.length !== 1) throw new Error(`${name}: empty object must be a single line`);
    return [];
  }
  if (lines[lines.length - 1] !== '};') throw new Error(`${name}: unexpected last line`);
  const keys = [];
  for (const line of lines.slice(1, -1)) {
    if (line.trim() === '' || COMMENT.test(line)) continue;
    const m = PROPERTY.exec(line);
    if (!m) throw new Error(`${name}: only plain \`key: 'string'\` properties are accepted, got: ${line.trim().slice(0, 60)}`);
    const key = m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3];
    if (keys.includes(key)) throw new Error(`${name}: duplicate key ${key}`);
    if (/^\d+$/.test(key)) throw new Error(`${name}: numeric key ${key} would be reordered by JavaScript`);
    keys.push(key);
  }
  return keys;
}

function extract(raw) {
  const out = {};
  for (const name of NAMES) {
    const count = (raw.match(new RegExp('^const ' + name + ' = ', 'mg')) || []).length;
    if (count !== 1) throw new Error(`${name}: expected exactly one declaration, found ${count}`);
    const text = declaration(raw, name);
    if (!text) throw new Error(`${name}: declaration not found`);
    if (raw.indexOf(text) !== raw.lastIndexOf(text)) throw new Error(`${name}: declaration text is not unique`);
    const entries = [];
    const push = (key, v) => {
      if (typeof v !== 'string') throw new Error(`${name}[${key}]: value is not a string`);
      const m = DATA_URI.exec(v);
      if (!m) throw new Error(`${name}[${key}]: value is not a data URI; single-file form required`);
      const bytes = Buffer.from(m[2], 'base64');
      // Canonical base64 only: correct length, padding only at the end, and a lossless round trip.
      if (m[2].length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(m[2]) || bytes.toString('base64') !== m[2]) {
        throw new Error(`${name}[${key}]: value is not canonical base64`);
      }
      entries.push([key, m[1], crypto.createHash('sha256').update(bytes).digest('hex')]);
    };
    if (name === 'CELEBRATE_NAT') {
      if (!STRING_DECL.test(text)) throw new Error(`${name}: must be a single-line string declaration`);
      const box = {};
      vm.runInNewContext(text + '\nresult = ' + name + ';', box, {timeout: 2000});
      push('', box.result);
      out[name] = {kind: 'string', text, entries};
      continue;
    }
    const scanned = scanObject(name, text);
    const box = {};
    vm.runInNewContext(text + '\nresult = ' + name + ';', box, {timeout: 2000});
    const value = box.result;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name}: not an object`);
    const pairs = Object.entries(value);
    if (pairs.length !== scanned.length || pairs.some(([k], i) => k !== scanned[i])) {
      throw new Error(`${name}: evaluated keys differ from the scanned property lines`);
    }
    for (const [key, v] of pairs) push(key, v);
    out[name] = {kind: 'object', text, entries};
  }
  return out;
}

const {Worker, isMainThread, parentPort, workerData} = require('worker_threads');
const CLI_TIMEOUT_MS = 120000;

if (!isMainThread) {
  // Worker: do the extraction so the main thread can terminate a hung synchronous step.
  try {
    parentPort.postMessage({ok: true, json: JSON.stringify(extract(fs.readFileSync(workerData.path, 'utf8')))});
  } catch (error) {
    parentPort.postMessage({ok: false, message: error.message});
  }
} else if (require.main === module) {
  const worker = new Worker(__filename, {workerData: {path: process.argv[2]}});
  const timer = setTimeout(() => {
    console.error(`media_declarations: timed out after ${CLI_TIMEOUT_MS} ms`);
    worker.terminate().finally(() => process.exit(2));
  }, CLI_TIMEOUT_MS);
  worker.once('message', result => {
    clearTimeout(timer);
    if (result.ok) {
      process.stdout.write(result.json);
      process.exitCode = 0;
    } else {
      console.error('media_declarations: ' + result.message);
      process.exitCode = 1;
    }
  });
  worker.once('error', error => {
    clearTimeout(timer);
    console.error('media_declarations: ' + error.message);
    process.exitCode = 1;
  });
}
module.exports = {extract, NAMES};
