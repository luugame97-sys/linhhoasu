'use strict';
const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const indexPath = process.env.LHS_INDEX_PATH
  || path.resolve(__dirname, '../../linhhoasu/webgame/game/index.html');
const bundlePath = process.env.LHS_MAIN_BUNDLE_PATH
  || path.resolve(__dirname, '../temp/drop100_release_20260914/main.min_drop100.js');
const index = fs.readFileSync(indexPath, 'utf8');
const bundle = fs.readFileSync(bundlePath, 'utf8');

assert.equal((index.match(/js\/main\.min_drop100\.js\?v=20260915_drop100_restore_v2/g) || []).length, 1);
assert.equal((index.match(/js\/main\.min_a6195824\.js/g) || []).length, 0);
assert.equal((index.match(/20260915_auto_sale_reconcile_v1/g) || []).length, 1);
assert.equal((index.match(/20260915_player_healthbar_hud_v6/g) || []).length, 1);
assert(bundle.includes('DropLevelExtensionConfig'), 'DROP100 extension missing from active bundle');
assert(bundle.includes('_lhsAutoSellDropSession'), 'auto-sale base patch missing from active bundle');
assert(bundle.includes('C.sendEquipSale='), 'equipment sale function missing from active bundle');

console.log(JSON.stringify({
  result: 'PASS', checks: 7,
  indexSha256: crypto.createHash('sha256').update(index).digest('hex'),
  bundleSha256: crypto.createHash('sha256').update(bundle).digest('hex'),
  activeMain: 'main.min_drop100.js', staleMainRejected: true,
}));
