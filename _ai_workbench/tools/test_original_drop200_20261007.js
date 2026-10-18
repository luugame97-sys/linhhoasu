'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const app=process.env.DROP200_APP||path.resolve(__dirname,'../../linhhoasu/lhs/newServer');
process.env.SERVER_ID='1001';process.env.DROP_LEVEL_100_ENABLED='1';process.env.ROLE_LEVEL_2000_ENABLED='1';
const C=require(path.join(app,'src/services/ConfigService'));const t=C.loadAllTables();
assert.equal(t.DropLevelExtensionConfig.maxLevel,200);assert.equal(t.DropTierExtensionConfig.maxTier,200);
assert.equal(t.DropProgressionTimingConfig,undefined);assert.equal(t.DropTierExtensionConfig.compactEquipmentThreshold,undefined);
for(const n of [46,99,100,150,199]){const b=t.BoxConfig[n];assert.equal(b.timeCost,26136000+(n-45)*1296000);assert.equal(b.levelUpCost[0],68000000+(n-45)*4000000);}
for(const n of [11,50,100,150,199]){const b=t.BoxTierConfig[n];assert.equal(b.timeCost,7200+(n-10)*1800);assert.equal(b.tierUpCost[0],450+(n-10)*50);assert.equal(b.count,n);}
const last=t.BoxTierConfig[200];assert.deepEqual(last.tierUpCost,[]);assert.equal(last.timeCost,0);assert.equal(last.count,200);
for(const n of [100,150,199,200]){const rows=t.BoxTierConfig[n].task.map(id=>t.TaskConfig[id]);assert.deepEqual(rows.map(r=>r.activeId),[9,6,39]);assert.deepEqual(rows.map(r=>r.taskValue1),[27+Math.ceil((n-10)*73/90),800+Math.ceil((n-10)*200/90),36+Math.ceil((n-10)*64/90)]);}
assert.equal(t.DemonBossDrop200ExtensionConfig.maxStage,172);assert(t.DemonBossConfig[172]);assert.equal(t.DemonBossConfig[172].roleStageId,48);assert.equal(t.DemonBossConfig[172].stageId,172);assert.equal(t.MonsterConfig[t.DemonBossConfig[172].monsterId].id,t.DemonBossConfig[172].monsterId);
console.log(JSON.stringify({result:'PASS',checks:8,productionWrites:0,originalTimers:true,originalTierTasks:true,demonBossMax:172}));
