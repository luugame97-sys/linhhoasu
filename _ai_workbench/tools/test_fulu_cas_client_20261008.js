'use strict';
// RAM-only regression for non-retryable Fulu CAS conflicts.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const addon = path.resolve(process.argv[2] || path.join(root, '_ai_workbench/temp/fulu_save_cas_fix_20261008b/candidate/webgame/game/js/lhs-fulu-safe-v1.js'));
const harnessPath = path.join(__dirname, 'test_fulu_safe_client_20261007.js');
const source = fs.readFileSync(harnessPath, 'utf8')
  .replace(/const guard = .*;/, 'const guard = fs.readFileSync(' + JSON.stringify(addon) + ', "utf8");');
const loaded = new Module(harnessPath, module);
loaded.filename = harnessPath;
loaded.paths = module.paths;
loaded._compile(source + '\nmodule.exports.harness = harness;', harnessPath);
const h = loaded.exports.harness();
h.panel.onSummonBtnClick();
const call = h.calls[0];
call.success({ ...call.payload, result: -1, code: 'FULU_SAVE_CONFLICT', reason: 'FULU_SAVE_CONFLICT', datas: [] });
assert.equal(h.calls.length, 1, 'CAS conflict must not trigger another RPC');
assert.equal(h.panel.summonBtn.touchEnabled, true);
assert.equal(h.panel.closeBtn.touchEnabled, true);
assert.equal(h.ctx.LhsFuluSafeV1.completed, 0);
assert.deepEqual(h.notices, ['Dữ liệu Phúc Lộc vừa thay đổi. Hãy mở lại sự kiện.']);
h.panel.onSummonBtnClick();
assert.equal(h.calls.length, 2, 'next explicit action must be available');
console.log(JSON.stringify({ result: 'PASS', checks: 6, productionWrites: 0, networkAttempts: 0 }));
