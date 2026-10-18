'use strict';

// Build a narrow candidate from the current bundle.  It copies only the three
// display formatter functions from the already-reviewed unit fix; it never
// replaces the current bundle wholesale.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const game = path.join(root, 'linhhoasu/webgame/game');
const currentBundlePath = path.join(game, 'js/main.min_drop100.js');
const currentIndexPath = path.join(game, 'index.html');
const reviewedCandidatePath = path.join(root, '_ai_workbench/temp/attr_format_fix_20260920/candidate_main.min_drop100.js');
const outputDir = path.join(root, '_ai_workbench/temp/attr_format_fix_20260921');
const outputBundlePath = path.join(outputDir, 'main.min_drop100.js');
const outputIndexPath = path.join(outputDir, 'index.html');
const OLD_KEY = 'js/main.min_drop100.js?v=20260920_gmt7_sync_v1';
const NEW_KEY = 'js/main.min_drop100.js?v=20260921_attr_units_v1';

function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function count(source, needle) { return source.split(needle).length - 1; }
function extract(source, start, end) {
  const at = source.indexOf(start);
  assert(at >= 0, `missing start: ${start}`);
  const stop = source.indexOf(end, at + start.length);
  assert(stop > at, `missing end: ${end}`);
  return source.slice(at, stop);
}
function replaceFunction(current, reviewed, start, end) {
  const oldPart = extract(current, start, end);
  const newPart = extract(reviewed, start, end);
  assert.equal(count(current, start), 1, `current marker count: ${start}`);
  assert.equal(count(reviewed, start), 1, `reviewed marker count: ${start}`);
  assert(newPart.includes('1e9') || newPart.includes('"Tr"'), `reviewed function not unit fix: ${start}`);
  return { source: current.replace(oldPart, newPart), oldPart, newPart };
}
function runFormatterTests(bundle) {
  const attr = extract(bundle, 'CSe.formatAttrValue1=', ',CSe.calPowerByAttr=').slice('CSe.formatAttrValue1='.length);
  const power = extract(bundle, 'wPt.overLengthPower=', ',wPt.overLenghPowerEn=').slice('wPt.overLengthPower='.length);
  const context = vm.createContext({
    Y: { Config: { AttrConfig: { 1: { dataType: 1 } } } },
    B: { ConvertLanguageToText: id => ({ 30020170: 'Vạn', 30090590: 'Tỷ' }[id] || '') },
    AppInfo: { lang: 'cn' },
    wPt: { truncateDecimal: (n, d) => { const p = 10 ** d; return Math.floor(n * p) / p; }, overLengthEn: n => String(n), overLenghPowerEn: n => String(n) },
  });
  const formatAttr = vm.runInContext('(' + attr + ')', context);
  const formatPower = vm.runInContext('(' + power + ')', context);
  const attrRows = [[200000, '200000'], [999999, '999999'], [1000000, '1.00Tr'], [999999999, '1000.00Tr'], [1000000000, '1.00Tỷ']];
  attrRows.forEach(([raw, expected]) => assert.equal(formatAttr(1, raw), expected, `attr ${raw}`));
  const powerRows = [[999999, 999999], [1000000, '1.00Tr'], [999999999, '1000.00Tr'], [1000000000, '1.00Tỷ'], [2000000000, '2.00Tỷ']];
  powerRows.forEach(([raw, expected]) => assert.equal(String(formatPower(raw)), String(expected), `power ${raw}`));
  return { attrRows, powerRows };
}

function main() {
  const current = fs.readFileSync(currentBundlePath, 'utf8');
  const reviewed = fs.readFileSync(reviewedCandidatePath, 'utf8');
  const currentIndex = fs.readFileSync(currentIndexPath, 'utf8');
  assert.equal(count(currentIndex, OLD_KEY), 1, 'current index marker must be unique');
  assert.equal(count(currentIndex, NEW_KEY), 0, 'new index marker already present');
  let patched = current;
  const changes = [];
  for (const [label, start, end] of [
    ['formatAttrValue1', 'CSe.formatAttrValue1=', ',CSe.calPowerByAttr='],
    ['overLengthPower', 'wPt.overLengthPower=', ',wPt.overLenghPowerEn='],
  ]) {
    const result = replaceFunction(patched, reviewed, start, end);
    patched = result.source;
    changes.push({ label, beforeBytes: Buffer.byteLength(result.oldPart), afterBytes: Buffer.byteLength(result.newPart), beforeSha256: sha(Buffer.from(result.oldPart)), afterSha256: sha(Buffer.from(result.newPart)) });
  }
  const candidateIndex = currentIndex.replace(OLD_KEY, NEW_KEY);
  const tests = runFormatterTests(patched);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputBundlePath, patched);
  fs.writeFileSync(outputIndexPath, candidateIndex);
  const manifest = {
    result: 'CANDIDATE_BUILT',
    sourceBundle: { path: currentBundlePath, bytes: Buffer.byteLength(current), sha256: sha(Buffer.from(current)) },
    candidateBundle: { path: outputBundlePath, bytes: Buffer.byteLength(patched), sha256: sha(Buffer.from(patched)) },
    sourceIndex: { path: currentIndexPath, bytes: Buffer.byteLength(currentIndex), sha256: sha(Buffer.from(currentIndex)) },
    candidateIndex: { path: outputIndexPath, bytes: Buffer.byteLength(candidateIndex), sha256: sha(Buffer.from(candidateIndex)) },
    cacheKey: { before: OLD_KEY, after: NEW_KEY },
    changes,
    formatterTests: tests,
    note: 'Only the character-attribute and power formatter bodies plus one cache-buster token changed; generic item-count formatter is intentionally untouched.',
  };
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify(manifest, null, 2));
}

main();
