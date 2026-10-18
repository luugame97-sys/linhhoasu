'use strict';
// Run on S1's host only. Use the real handlers/PlayerService but a fresh,
// isolated Mongo database; never connect these test writes to players on S1.
const path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const app='/linhhoasu/lhs/newServer';
const mongoose=require(app+'/node_modules/mongoose');
const dbName='lhs_drop46_qa_'+crypto.randomBytes(8).toString('hex');
const output={dbName,realPlayerWrites:0,checks:[],cleaned:false};
const copy=x=>JSON.parse(JSON.stringify(x));
const data=(response,tag)=>{const r=Array.isArray(response)?response:[response];return r.find(x=>x.tag===tag&&Number(x.msgUid)>0)?.data||r.find(x=>x.tag===tag)?.data;};
async function main(){
 assert.equal(process.env.SERVER_ID,'1001');assert.equal(process.env.DROP_LEVEL_46_ENABLED,'1');
 await mongoose.connect(process.env.MONGO_URI,{dbName,autoIndex:false,autoCreate:false});
 assert.equal(mongoose.connection.db.databaseName,dbName);
 const collections=await mongoose.connection.db.listCollections().toArray();assert.equal(collections.length,0);
 const Player=require(app+'/src/db/models/Player'),ps=require(app+'/src/services/PlayerService');
 const locks=require(app+'/src/services/PlayerMutationService');
 const config=require(app+'/src/services/ConfigService');config.loadAllTables();
 const compat=require(app+'/src/handlers/compat'),box=require(app+'/src/handlers/box'),item=require(app+'/src/handlers/item');
 const maps=require(app+'/src/services/MapMonsterService'),equip=require(app+'/src/services/EquipService');
 const uid='drop46_isolated_fixture',template={userId:uid,playerId:uid,name:uid,serverId:1001,level:100,exp:0,
  currencies:{silver:340000000,gold:87120,diamond:123},items:{4:1000,20:77},
  boxInfo:{level:45,exp:0,tier:10,tierExp:0,summonCount:1,upgradeFinishTime:0},
  roleInfo:{stage:1,stageId:1},equipInfo:{curIndex:0,openListMap:{0:[]},equipSetMap:{0:{}},equipList:[]},taskInfo:{}};
 // Native insert bypasses schema defaults but retains the real save/load code.
 await Player.collection.insertOne(template);
 let session={userId:uid,player:await ps.loadPlayer(uid),wsId:99999};
 const call=(fn,p,id)=>locks.run(uid,()=>fn(p,session,id));
 for(let step=1;step<=5;step++){await call(compat.handleBoxUpgrade2100,{},step);const saved=await ps.loadPlayer(uid);assert.equal(saved.boxInfo.exp,step);assert.equal(saved.currencies.silver,340000000-step*68000000);}
 output.checks.push('five actual Mongo-confirmed upgrade payments');
 await call(compat.handleBoxUpgradeSkip2101,{count:87120},6);
 session.player=await ps.loadPlayer(uid);assert.equal(session.player.boxInfo.level,46);assert.equal(session.player.currencies.gold,0);assert.equal(session.player.boxInfo.drop46Receipt.silverSpent,340000000);
 output.checks.push('actual Mongo reload level46, exact currencies and receipt');
 assert.equal(data(await call(compat.handleBoxUpgrade2100,{},7),2100).result,-2);
 output.checks.push('configured maximum46 rejects47');
 const slot=maps.getSlot(10046,0);assert(slot,'map10046 slot0 missing');session._mapId=10046;session._mapLine=0;
 let drop=await call(box.handleOpenBox,{index:slot.index,count:1},8);assert(data(drop,2000).items.some(x=>config.get('AssetsConfig')[x.id]?.type===3));
 await call(box.handleBoxReward,{},9);await ps.drainPendingSaves(uid);
 let saved=await ps.loadPlayer(uid);assert.equal(saved.items[4],999);assert(saved.equipInfo.equipList.length>0);
 const regular=saved.equipInfo.equipList[0];assert(regular.quailty>=38&&regular.quailty<=45);assert.equal(regular.lv,100);
 output.checks.push('real map10046 slot claim, normal drop and Mongo save');
 const boss=await call(box.handleSummonBoss,{},10);const bossItems=data(boss,2003).items.filter(x=>config.get('AssetsConfig')[x.id]?.type===3);
 assert.equal(bossItems.reduce((sum,x)=>sum+x.count,0),15);assert(bossItems.every(x=>config.get('AssetsConfig')[x.id].quality===45));
 await call(box.handleBoxReward,{},11);await ps.drainPendingSaves(uid);saved=await ps.loadPlayer(uid);
 assert(saved.equipInfo.equipList.filter(x=>x.quailty===45).length>=15);
 output.checks.push('boss15 quality45 equipment, claim and Mongo save');
 const uids=saved.equipInfo.equipList.map(x=>x.uid);const oldSilver=saved.currencies.silver;
 const expected=saved.equipInfo.equipList.reduce((sum,x)=>sum+Math.max(20,x.quailty*25+x.lv*5),0);
 const sold=await call(item.handleEquipSale,{uids,autoDelegate:true,sellAllEquipments:true},12);assert.equal(data(sold,2201).uids.length,uids.length);
 saved=await ps.loadPlayer(uid);assert.equal(saved.currencies.silver,oldSilver+expected);assert.equal(saved.equipInfo.equipList.length,0);assert.equal(saved.items[20],77);assert.equal(saved.currencies.diamond,123);
 output.checks.push('auto-sell new drops persists exact proceeds, no unrelated item changes');
 output.result='PASS';output.level=saved.boxInfo.level;output.normalQuality=regular.quailty;output.bossItems=15;output.saleSilver=expected;
 await ps.drainPendingSaves(uid);
}
main().catch(error=>{output.result='FAIL';output.error=error.stack;process.exitCode=1;}).finally(async()=>{
 try{if(mongoose.connection.readyState===1&&mongoose.connection.db.databaseName===dbName&&/^lhs_drop46_qa_[a-f0-9]{16}$/.test(dbName)){
   await mongoose.connection.db.dropDatabase();output.cleaned=true;
 }}finally{await mongoose.disconnect();console.log(JSON.stringify(output,null,2));}
});
