'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const app = process.env.MUTATION_APP_ROOT
  ? path.resolve(process.env.MUTATION_APP_ROOT)
  : path.resolve(__dirname, '..', '..', 'linhhoasu', 'lhs', 'newServer');
const itemSource = fs.readFileSync(path.join(app, 'src/handlers/item.js'), 'utf8');
const mountSource = fs.readFileSync(path.join(app, 'src/handlers/mount.js'), 'utf8');
assert(itemSource.includes('withGeneralPurchaseLock'));
assert(itemSource.includes("require('../services/PlayerMutationService').run(userId"));
assert(mountSource.includes('handleMountUpgradeUnlocked'));
assert(mountSource.includes("require('../services/PlayerMutationService').run(userId"));

const mutation = require(path.join(app, 'src/services/PlayerMutationService'));
let active = 0;
let maxActive = 0;
const jobs = Array.from({ length: 20 }, () => mutation.run('lock-contract-user', async () => {
  active += 1;
  maxActive = Math.max(maxActive, active);
  await new Promise((resolve) => setTimeout(resolve, 2));
  active -= 1;
}));
Promise.all(jobs).then(() => {
  assert.strictEqual(maxActive, 1);
  console.log(JSON.stringify({ result: 'PASS', checks: 4, maxConcurrentMutations: maxActive, network: false, persistence: false }));
}).catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
