'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const game = path.join(root, 'linhhoasu/webgame/game');
const sourcePath = path.join(game, 'js/lhs-bidking-compat-v1.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const index = fs.readFileSync(path.join(game, 'index.html'), 'utf8');
assert(source.includes('20260921_bidking_compat_v1'));
assert(index.includes('js/lhs-bidking-compat-v1.js?v=20260921_bidking_compat_v1'));

const timers = [];
const infoEvents = [];
const model = {
  info: null,
  onBidKingInfo(data) { this.info = data; infoEvents.push(data); },
  isRoleUnlocked() { return true; },
  isCanGetIllusReward(id) { return this.isRoleUnlocked(id) && this.info.characterReward.indexOf(id) < 0; },
};
function BidKingModel() {}
BidKingModel.prototype.onBidKingInfo = model.onBidKingInfo;
BidKingModel.prototype.isRoleUnlocked = model.isRoleUnlocked;
BidKingModel.prototype.isCanGetIllusReward = model.isCanGetIllusReward;
const instance = new BidKingModel();
const context = {
  BidKingModel,
  GlobalManager: { BidKingModel: instance },
  setTimeout(fn) { timers.push(fn); return timers.length; },
  console: { info() {} },
};
vm.createContext(context);
vm.runInContext(source, context, { filename: sourcePath });
let attempts = 0;
while (!context.LhsBidKingCompatV1.installed && timers.length && attempts++ < 5) timers.shift()();
assert(context.LhsBidKingCompatV1.installed);
instance.onBidKingInfo({ characters: [1], illusRewardList: [] });
assert.deepEqual(Array.from(instance.info.characterReward), []);
assert.equal(instance.isCanGetIllusReward(1), true);
instance.info.characterReward.push(1);
assert.equal(instance.isCanGetIllusReward(1), false);
console.log(JSON.stringify({ status: 'PASS', checks: 7, attempts, infoEvents: infoEvents.length }));
