'use strict';
// Isolated production-handler reproduction. No database or sockets permitted.
const fs = require('fs');
const path = require('path');
const Module = require('module');
const root = path.resolve(__dirname, '../..');
process.env.CONFIG_BIN_PATH = path.join(root, '_ai_workbench/temp/petsoul_release_20261002/baseline/config.bin');
require('net').Socket.prototype.connect = () => { throw new Error('NETWORK_FORBIDDEN'); };
const real = path.join(root, 'linhhoasu/lhs/newServer/src/handlers/item.js');
const base = path.join(root, '_ai_workbench/temp/item_boxes_20261002/baseline/server');
const original = Module._load;
const cache = new Map();
function loadLive(file, actual) {
  if (cache.has(file)) return cache.get(file).exports;
  const m = new Module(actual, module);
  cache.set(file, m);
  m.filename = actual; m.paths = Module._nodeModulePaths(path.dirname(actual));
  m._compile(fs.readFileSync(file, 'utf8'), actual);
  return m.exports;
}
Module._load = function(name, parent, isMain) {
  if (/(^|\/)PlayerService$/.test(name)) return { savePlayer: async () => true };
  const target = ['RandomUsableItemRewardService', 'RewardGrantService', 'NativeItemRewardService'].find(x => name.endsWith('/' + x));
  if (target) return loadLive(path.join(base, 'services', target + '.js'), path.join(root, 'linhhoasu/lhs/newServer/src/services', target + '.js'));
  return original.call(this, name, parent, isMain);
};
(async () => {
  const handler = loadLive(path.join(base, 'handlers/item.js'), real);
  const rows = [];
  for (const id of [100721, 100511, 100701, 100802]) {
    const player = {items:{[id]:2}, currencies:{diamond:0,silver:0,gold:0}, other_attr_info:{}, roleInfo:{stage:1}, level:200, exp:0};
    const result = await handler.handleUseItem({itemId:id,count:2}, {userId:'ISOLATED_BOX_AUDIT',player}, 9);
    const reply = (Array.isArray(result) ? result : [result]).find(x => x.tag === 1300);
    rows.push({id, result:reply.data.result, code:reply.data.code, remaining:player.items[id], reward:reply.data.rewardInfo});
  }
  console.log(JSON.stringify(rows));
})().catch(e => {console.error(e.stack);process.exitCode=1}).finally(()=>{Module._load=original});
