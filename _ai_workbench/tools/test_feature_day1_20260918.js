'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=process.env.FEATURE_CANDIDATE_ROOT||path.resolve(__dirname,'../temp/feature_unlock_release_20260917/candidate/server');
const policy=require(path.join(root,'src/config/featureUnlockDay1.js'));
let checks=0;const ok=(x,m)=>{assert.ok(x,m);checks++;};
const tables={
 SystemConfig:{219:{id:219,conditions:[{type:3,value:95,cond:4},{type:5,value:15,cond:4}]},
 315:{id:315,conditions:[{type:3,value:9999,cond:4},{type:5,value:9999,cond:4}]},
 112:{id:112,conditions:[{type:3,value:55,cond:4},{type:6,value:2,cond:4}]}},
 AssetsConfig:{a:{canGetDay:57},b:{canGetDay:9999}},
 ValhallaConfig:{x:{openDay:36}},GuildBattleConfig:{serverDay:3},
 ConstConfig:{silenceDealOpenDay:29},
 CuriosConfig:{x:{conditions:[{type:5,value:50,cond:4},{type:3,value:1,cond:4}]}}
};
const before=JSON.stringify(tables),changes=policy.apply(tables,true);
ok(policy.version==='20260917_feature_day1_v1','version');ok(changes.length>0,'changed fields');
ok(tables.SystemConfig[219].conditions[1].value===1,'system age waived');
ok(tables.SystemConfig[112].conditions.every(c=>c.type!==6),'scoped role age waived');
ok(tables.SystemConfig[315].conditions[0].value===9999&&tables.SystemConfig[315].conditions[1].value===9999,'disabled sentinel preserved');
ok(tables.AssetsConfig.b.canGetDay===9999,'asset sentinel preserved');
ok(tables.CuriosConfig.x.conditions.some(c=>c.type===3&&c.value===1),'level gate preserved');
ok(tables.GuildBattleConfig.serverDay===1&&tables.ConstConfig.silenceDealOpenDay===1,'direct gates waived');
policy.restore(changes);ok(JSON.stringify(tables)===before,'reversible restore');
const scoped={SystemConfig:{209:{id:209,conditions:[{type:2,value:90021,cond:4}]},216:{id:216,conditions:[{type:2,value:90003,cond:4}]},311:{id:311,conditions:[{type:3,value:75,cond:4},{type:5,value:3,cond:4}]},313:{id:313,conditions:[{type:3,value:85,cond:4},{type:5,value:5,cond:4}]},219:{id:219,conditions:[{type:3,value:95,cond:4},{type:5,value:15,cond:4}]}},ValhallaConfig:{x:{openDay:36}},CuriosConfig:{x:{conditions:[{type:5,value:50,cond:4}]}}};
const scopedChanges=policy.apply(scoped,true,['artifact','valhalla']);
ok(scoped.SystemConfig[311].conditions[1].value===1&&scoped.SystemConfig[313].conditions[1].value===1,'scoped prerequisite day waived');
ok(scoped.SystemConfig[219].conditions.length===2,'unrelated system day preserved');
ok(scoped.ValhallaConfig.x.openDay===1&&scoped.CuriosConfig.x.conditions[0].value===50,'scoped valhalla only');
policy.restore(scopedChanges);ok(scoped.SystemConfig[311].conditions[1].value===3&&scoped.ValhallaConfig.x.openDay===36,'scoped restore');
const client=path.join(process.env.FEATURE_CLIENT_ROOT||path.resolve(__dirname,'../temp/feature_unlock_release_20260917/candidate/client'),'js/lhs-feature-day1-v1.js');
ok(fs.existsSync(client),'client addon staged');
console.log(JSON.stringify({result:'PASS',checks,changes:changes.length,productionWrites:0,clientHashBytes:fs.statSync(client).size}));
