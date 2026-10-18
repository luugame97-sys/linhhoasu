'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const app=process.env.DROP200_APP||path.resolve(__dirname,'../../linhhoasu/lhs/newServer');
process.env.SERVER_ID='1001';process.env.DROP_LEVEL_100_ENABLED='1';process.env.ROLE_LEVEL_2000_ENABLED='1';
const C=require(path.join(app,'src/services/ConfigService'));
const service=require(path.join(app,'src/services/DropProgressionTimingService'));
const source=C.loadAllTables();
const tables={BoxConfig:structuredClone(source.BoxConfig),BoxTierConfig:structuredClone(source.BoxTierConfig)};
for(let i=1;i<=200;i++){
  if(tables.BoxConfig[i]){delete tables.BoxConfig[i].dropTimingVersion;delete tables.BoxConfig[i].dropTimingOldTimeCost;tables.BoxConfig[i].timeCost=i<=45?tables.BoxConfig[i].timeCost:(i<200?26136000+(i-45)*1296000:0);}
  if(tables.BoxTierConfig[i]){delete tables.BoxTierConfig[i].dropTimingVersion;delete tables.BoxTierConfig[i].dropTimingOldTimeCost;tables.BoxTierConfig[i].timeCost=i<=10?tables.BoxTierConfig[i].timeCost:(i<200?7200+(i-10)*1800:0);}
}
const before=structuredClone(tables);service.applyTables(tables);
const embedded=require('node:vm').runInNewContext('('+service.durationSeconds.toString()+')');
assert.deepEqual([1,2,3,4].map(i=>tables.BoxConfig[i].timeCost),[300,900,1800,2700]);
for(const [level,seconds] of [[5,3600],[10,7200],[25,14400],[50,21600],[100,43200],[150,64800],[199,86400],[200,0]])assert.equal(tables.BoxConfig[level].timeCost,seconds);
for(const name of ['BoxConfig','BoxTierConfig'])for(let i=1;i<200;i++){const row=tables[name][i];assert(row.timeCost>0&&row.timeCost<=86400);if(i>1)assert(row.timeCost>=tables[name][i-1].timeCost);assert.equal(row.dropTimingOldTimeCost,before[name][i].timeCost);assert.equal(embedded(name==='BoxConfig'?'level':'tier',i,before[name][i].timeCost),row.timeCost);}
const snapshot=JSON.stringify(tables);service.applyTables(tables);assert.equal(JSON.stringify(tables),snapshot);
const now=1791300000000,player={items:{2:123,6:456},boxInfo:{level:99,tier:99,exp:5,tierExp:5,upgradeFinishTime:now+before.BoxConfig[99].timeCost*500,tierUpTime:now+before.BoxTierConfig[99].timeCost*250}};
assert(service.migratePlayer(player,now,tables));assert.equal(player.boxInfo.upgradeFinishTime,now+tables.BoxConfig[99].timeCost*500);assert.equal(player.boxInfo.tierUpTime,now+tables.BoxTierConfig[99].timeCost*250);assert.deepEqual(player.items,{2:123,6:456});assert.equal(player.boxInfo.level,99);assert.equal(player.boxInfo.exp,5);const migrated=JSON.stringify(player);assert.equal(service.migratePlayer(player,now+1000,tables),false);assert.equal(JSON.stringify(player),migrated);
for(const finish of [0,now-1000,now,NaN,Infinity]){const p={boxInfo:{level:99,tier:99,upgradeFinishTime:finish,tierUpTime:finish}};service.migratePlayer(p,now,tables);assert(Object.is(p.boxInfo.upgradeFinishTime,finish));assert(Object.is(p.boxInfo.tierUpTime,finish));}
const short={boxInfo:{level:1,tier:1,upgradeFinishTime:now+1234,tierUpTime:now+999}};service.migratePlayer(short,now,tables);assert.equal(short.boxInfo.upgradeFinishTime,now+1234);assert.equal(short.boxInfo.tierUpTime,now+999);
console.log('PASS drop timing anchors, monotonic cap, old duration migration, idempotence, invalid and short timers; RAM only.');
