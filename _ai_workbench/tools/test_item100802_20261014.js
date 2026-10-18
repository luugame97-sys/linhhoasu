'use strict';
// Isolated handler checks against VPS dependencies/config. No player DB or sockets.
const assert = require('assert/strict'), fs = require('fs'), Module = require('module'), crypto = require('crypto');
const app = '/linhhoasu/lhs/newServer', handlerPath = app + '/src/handlers/item.js';
const read = fs.readFileSync, loadedFiles = new Set(), originalLoad = Module._load;
let saves = [], networkAttempts = 0, writeAttempts = 0;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
fs.readFileSync = function (file, ...args) {
  if (typeof file === 'string' && file.startsWith('/linhhoasu/')) loadedFiles.add(file);
  return read.call(this, file, ...args);
};
require('net').Socket.prototype.connect = function () { networkAttempts++; throw Error('TEST_NETWORK_FORBIDDEN'); };
for (const key of ['writeFileSync','appendFileSync','mkdirSync','unlinkSync','rmSync','renameSync','createWriteStream']) {
  fs[key] = () => { writeAttempts++; throw Error('TEST_WRITE_FORBIDDEN:' + key); };
}
const logger = {info(){}, warn(){}, error(){}, debug(){}, log(){}};
Module._load = function (name, parent, isMain) {
  if (/(^|\/)logger$/.test(name)) return logger;
  if (/(^|\/)PlayerService$/.test(name)) return {
    drainPendingSaves:async()=>{},
    savePlayer:async(_id, player)=>{saves.push(JSON.parse(JSON.stringify(player)));return true;},
    savePlayerDeferred:async(_id, player)=>{saves.push(JSON.parse(JSON.stringify(player)));return true;},
  };
  return originalLoad.call(this, name, parent, isMain);
};
global.setTimeout = () => 0; global.clearTimeout = () => {}; global.setInterval = () => 0;
const config = require(app + '/src/services/ConfigService');
const tables = config.loadAllTables(), assets = tables.AssetsConfig, materials = tables.PetSoulUpgradeMaterialConfig;
const originalSource = fs.readFileSync(handlerPath, 'utf8');
const baseline = require(handlerPath);
let handler = baseline;
if (globalThis.ITEM100802_CANDIDATE) {
  const candidate = new Module(handlerPath, module);
  candidate.filename = handlerPath; candidate.paths = Module._nodeModulePaths(app + '/src/handlers');
  Module._cache[handlerPath] = candidate;
  candidate._compile(globalThis.ITEM100802_CANDIDATE, handlerPath);
  handler = candidate.exports;
}
const ids = [268,269,270,271,272], cases = [];
function fresh(itemId, stock) {
  return {userId:'ISOLATED_ITEM100802_TEST',playerId:'ISOLATED_ITEM100802_TEST',items:{[itemId]:stock,...Object.fromEntries(ids.map(id=>[id,7]))},currencies:{diamond:0,gold:0,silver:0},other_attr_info:{},roleInfo:{stage:999999},level:999,exp:0};
}
async function invoke(target, itemId, count, stock=10002, random=()=>0.1) {
  Math.random = random; saves = [];
  const player = fresh(itemId, stock), before = JSON.parse(JSON.stringify(player.items));
  const session = {userId:player.userId,player};
  const result = await target.handleUseItem({itemId,count},session,17);
  const packets = Array.isArray(result) ? result : [result];
  return {response:packets.find(p=>p?.tag===1300)?.data,packets,player:session.player,before,saved:saves.slice()};
}
function checkSuccess(test, count, expectedId) {
  assert.equal(test.response.result,0);
  assert.equal(test.before[100802] - (test.player.items[100802] || 0),count);
  const rewards = test.response.rewardInfo.items;
  assert.equal(rewards.reduce((n,r)=>n+r.count,0),count);
  assert.ok(rewards.every(r=>ids.includes(r.id) && Number.isSafeInteger(r.count) && r.count>0));
  if(expectedId) assert.deepEqual(rewards,[{id:expectedId,count}]);
  assert.equal(ids.reduce((n,id)=>n+test.player.items[id]-test.before[id],0),count);
  for(const id of ids) assert.equal(test.player.items[id]-test.before[id],rewards.find(r=>r.id===id)?.count||0);
  assert.equal(test.saved.length,1);
  assert.deepEqual(test.saved[0].items,test.player.items);
  const update = test.packets.find(p=>p?.tag===1202);
  assert.ok(update, 'missing bag update');
  assert.ok(update.data.items.some(r=>r.id===100802 && r.count===-count),'missing consumption delta');
  for(const reward of rewards) assert.ok(update.data.items.some(r=>r.id===reward.id && r.count===reward.count),'missing reward delta');
}
async function rejected(name, count, stock=10002, code) {
  const test = await invoke(handler,100802,count,stock);
  assert.notEqual(test.response.result,0,name);
  if(code) assert.equal(test.response.code,code,name);
  assert.deepEqual(test.player.items,test.before,name);
  assert.equal(test.saved.length,0,name);
  cases.push({name,result:test.response.result,code:test.response.code||test.response.msg,consumed:0,saves:0});
}
(async()=>{
  assert.equal(tables.AssetsUseConfig[100802],undefined,'test must cover missing server use config');
  let seed=13;
  for(const count of [1,3,55,10000]) {
    const test=await invoke(handler,100802,count,count,()=>{seed=seed*48271%2147483647;return seed/2147483647;});
    checkSuccess(test,count);
    cases.push({name:'open_'+count,consumed:count,rewards:test.response.rewardInfo.items,saves:test.saved.length});
  }
  for(let i=0;i<ids.length;i++) {
    const test=await invoke(handler,100802,3,3,()=>(i+0.5)/5);
    checkSuccess(test,3,ids[i]);cases.push({name:'element_'+ids[i],rewards:test.response.rewardInfo.items});
  }
  for(const count of [0,-1,1.5,10001]) await rejected('invalid_count_'+count,count);
  await rejected('insufficient_stock',3,2);
  const sourceAsset=assets[100802];
  try {assets[100802]={...sourceAsset,icon:'invalid'};await rejected('invalid_box_metadata',1,1,'ITEM_REWARD_POOL_UNVERIFIED');}
  finally {assets[100802]=sourceAsset;}
  for(const id of ids) {
    const material=materials[id];
    try {delete materials[id];await rejected('missing_material_'+id,1,1,'ITEM_REWARD_POOL_UNVERIFIED');}
    finally {materials[id]=material;}
  }
  const materialAsset=assets[268];
  try {assets[268]={...materialAsset,quality:1};await rejected('invalid_reward_quality',1,1,'ITEM_REWARD_POOL_UNVERIFIED');}
  finally {assets[268]=materialAsset;}
  if(globalThis.ITEM100802_CANDIDATE) {
    for(const id of [100081,100139,100721]) {
      const before=await invoke(baseline,id,1,1),after=await invoke(handler,id,1,1);
      assert.deepEqual(after,before,'unrelated item changed '+id);
      cases.push({name:'unchanged_'+id,result:after.response.result,code:after.response.code||''});
    }
  }
  assert.equal(networkAttempts,0);assert.equal(writeAttempts,0);
  const dependencies=Object.fromEntries([...loadedFiles].sort().map(file=>[file,hash(read(file))]));
  const result={at:new Date().toISOString(),mode:globalThis.ITEM100802_CANDIDATE?'candidate':'live',passed:cases.length,productionWrites:0,networkAttempts,writeAttempts,liveHandlerHash:hash(originalSource),testedHandlerHash:hash(globalThis.ITEM100802_CANDIDATE||originalSource),cases,dependencies};
  console.log('ITEM100802_RESULT='+JSON.stringify(result));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
