'use strict';
// Supersedes the incorrect old test that called 100084 a level-5 box.
const assert = require('node:assert/strict'), path = require('node:path');
const app = process.env.LHS_APP_ROOT || path.resolve(__dirname, '../../linhhoasu/lhs/newServer');
process.env.CONFIG_BIN_PATH = process.env.LHS_CONFIG_PATH || path.resolve(__dirname, '../../linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin');
const c = require(path.join(app,'src/services/ConfigService'));
const ps = require(path.join(app,'src/services/PlayerService')); ps.savePlayer=async(_u,p)=>p;
const item = require(path.join(app,'src/handlers/item'));
const activity = require(path.join(app,'src/handlers/activity'));
const router = require(path.join(app,'src/services/RewardGrantService'));
const random = require(path.join(app,'src/services/RandomUsableItemRewardService'));
const cfg = c.loadAllTables(); let seed=19;
Math.random=()=>{seed=seed*48271%2147483647;return seed/2147483647;};
function player(id){return {userId:'gem-contract',playerId:'gem-contract',level:99,roleInfo:{kungfuId:4,stage:999},items:{[id]:45},currencies:{},other_attr_info:{gemInfo:{gems:[]}},artifactInfo:{},fashionInfo:{},equipInfo:{},itemUseRecords:{}};}
(async()=>{
 let uses=0,synthetic=0;
 for(let level=1;level<=6;level++){
  const id=100080+level,p=player(id),s={userId:p.userId,player:p};
  const result=await item.handleUseItem({index:id,count:40},s,100+level);
  const packet=(Array.isArray(result)?result:[result]).find(x=>x.tag===1300);
  assert.equal(packet.data.result,0);assert.equal(p.items[id],5);
  assert.equal(packet.data.rewardInfo.gems.length,40);
  const ids=packet.data.rewardInfo.gems.map(g=>g.id);
  assert.equal(new Set(ids).size,4);
  assert(ids.every(g=>cfg.GemLevelConfig[g].level===level));
  uses+=40;
  const placeholder=100090+level;
  assert.equal(random.getGemPackLevel(placeholder),level);
  const a=player(placeholder),r=activity.grantRewardRows(a,[{id:placeholder,count:40}]);
  assert.equal(r.gems.length,40);assert(r.gems.every(g=>cfg.GemLevelConfig[g.id].level===level));
  assert.equal(a.items[placeholder],45,'grant placeholder must not increment bag');
  assert.equal(router.getRewardKind(placeholder),'gemPack');synthetic+=40;
 }
 assert.equal(random.getGemPackLevel(100085),5);assert.equal(random.getGemPackLevel(100084),4);
 assert.equal(random.getGemPackLevel(999999),0);
 console.log(JSON.stringify({result:'PASS',usableDraws:uses,syntheticDraws:synthetic,boxLevel5:100085,targetIds:[25041,25042,25043,25044],allSixLevels:true,multiDrawIndependent:true,originalProbabilityVerified:false}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
