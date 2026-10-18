'use strict';
const path=require('path'),fs=require('fs'),crypto=require('crypto'),assert=require('assert/strict'),Module=require('module');
const app='/linhhoasu/lhs/newServer',root=process.env.DROP100_ROOT;
// Stage exact candidate modules at their normal require identities, without
// copying them over production. All dependency resolution remains normal.
if(root){const old=Module._load,cache=new Map();const names=['config/dropLevel100','config/dropLevel46','services/DropLevel46Service','services/ConfigService','handlers/box'];const lookup=new Map(names.map(n=>[app+'/src/'+n+'.js',root+'/candidate/src/'+n+'.js']));Module._load=function(request,parent,isMain){let resolved=request.startsWith('.')?path.resolve(path.dirname(parent.filename),request):request;if(!resolved.endsWith('.js'))resolved+='.js';if(!lookup.has(resolved))return old.apply(this,arguments);if(cache.has(resolved))return cache.get(resolved).exports;const m=new Module(resolved,parent);m.filename=resolved;m.paths=Module._nodeModulePaths(path.dirname(resolved));cache.set(resolved,m);m._compile(fs.readFileSync(lookup.get(resolved),'utf8'),resolved);m.loaded=true;return m.exports;};}
const mongoose=require(app+'/node_modules/mongoose'),dbName='lhs_drop100_qa_'+crypto.randomBytes(8).toString('hex');
const out={serverId:Number(process.env.SERVER_ID),dbName,realPlayerWrites:0,checks:[],cleaned:false};
const data=(r,t)=>(Array.isArray(r)?r:[r]).find(x=>x.tag===t&&x.msgUid>0)?.data||(Array.isArray(r)?r:[r]).find(x=>x.tag===t)?.data;
async function main(){
 assert([1001,1002,1003].includes(out.serverId));assert.equal(process.env.DROP_LEVEL_100_ENABLED,'1');
 await mongoose.connect(process.env.MONGO_URI,{dbName,autoIndex:false,autoCreate:false});assert.equal(mongoose.connection.db.databaseName,dbName);assert.equal((await mongoose.connection.db.listCollections().toArray()).length,0);
 const C=require(app+'/src/services/ConfigService'),tables=C.loadAllTables(),Player=require(app+'/src/db/models/Player'),ps=require(app+'/src/services/PlayerService'),locks=require(app+'/src/services/PlayerMutationService');
 const compat=require(app+'/src/handlers/compat'),box=require(app+'/src/handlers/box'),item=require(app+'/src/handlers/item'),maps=require(app+'/src/services/MapMonsterService');
 const uid='drop100_isolated_fixture',p={userId:uid,playerId:uid,name:uid,serverId:out.serverId,level:100,exp:0,currencies:{silver:100000000000,gold:100000000,diamond:777},items:{4:1000,20:123},boxInfo:{level:45,exp:0,tier:10,tierExp:0,summonCount:1,upgradeFinishTime:0},roleInfo:{stage:1,stageId:1},equipInfo:{curIndex:0,openListMap:{0:[]},equipSetMap:{0:{}},equipList:[]},taskInfo:{}};
 await Player.collection.insertOne(p);let s={userId:uid,player:await ps.loadPlayer(uid),wsId:9999};let msg=1,total=0,skips=0;
 const call=(fn,p)=>locks.run(uid,()=>fn(p,s,msg++));
 for(let lv=45;lv<100;lv++){
  for(let step=1;step<=5;step++){await call(compat.handleBoxUpgrade2100,{});const got=await ps.loadPlayer(uid);assert.equal(got.boxInfo.level,lv);assert.equal(got.boxInfo.exp,step);}
  const use=tables.BoxConfig[lv].timeCost/300;await call(compat.handleBoxUpgradeSkip2101,{count:use});total+=tables.BoxConfig[lv].levelUpCost.reduce((a,b)=>a+b,0);skips+=use;
  s.player=await ps.loadPlayer(uid);assert.equal(s.player.boxInfo.level,lv+1);assert.equal(s.player.currencies.silver,100000000000-total);assert.equal(s.player.currencies.gold,100000000-skips);
 }
 assert.equal(data(await call(compat.handleBoxUpgrade2100,{}),2100).result,-2);assert.equal(s.player.boxInfo.drop46Receipt.silverSpent,total);assert.equal(s.player.boxInfo.drop46Receipt.skipsSpent,skips);
 out.checks.push('45->100 real Mongo, 275 payments55skips55reloads, cap101 rejected');
 for(let lv=46;lv<=100;lv++){const slot=maps.getSlot(10000+lv,0);assert(slot,'missing slot '+lv);}
 out.checks.push('55 normal maps load existing scene slots');
 s._mapId=10100;s._mapLine=0;const result=await call(box.handleOpenBox,{index:0,count:1});assert(data(result,2000).items.some(r=>tables.AssetsConfig[r.id]?.type===3));await call(box.handleBoxReward,{});await ps.drainPendingSaves(uid);let saved=await ps.loadPlayer(uid);assert.equal(saved.items[4],999);assert(saved.equipInfo.equipList.every(x=>x.quailty>=92&&x.quailty<=99));
 out.checks.push('map10100 actual claim, correct new-ID drop and persistence');
 const boss=await call(box.handleSummonBoss,{});const bi=data(boss,2003).items.filter(x=>tables.AssetsConfig[x.id]?.type===3);assert.equal(bi.reduce((a,b)=>a+b.count,0),15);assert(bi.every(r=>tables.AssetsConfig[r.id].quality===99));await call(box.handleBoxReward,{});await ps.drainPendingSaves(uid);saved=await ps.loadPlayer(uid);assert(saved.equipInfo.equipList.filter(e=>e.quailty===99).length>=15);
 out.checks.push('boss15 Q99 Vô Thượng Tuyệt equipment persisted');
 const selected=saved.equipInfo.equipList.find(e=>e.quailty===99);const replaced=await call(item.handleEquipReplace,{uid:selected.uid,listId:0,mapId:0});await ps.drainPendingSaves(uid);saved=await ps.loadPlayer(uid);assert.equal(saved.equipInfo.equipSetMap[0][selected.type].id,selected.id);
 out.checks.push('equip new ID in native slot/preset and reload');
 const all=saved.equipInfo.equipList,protectedUid=selected.uid;const sellable=all.filter(e=>e.uid!==protectedUid),before=saved.currencies.silver;
 const expected=sellable.reduce((sum,e)=>sum+Math.max(20,e.quailty*25+e.lv*5),0);const sale=await call(item.handleEquipSale,{uids:all.map(e=>e.uid),autoDelegate:true,sellAllEquipments:true});saved=await ps.loadPlayer(uid);assert.equal(saved.currencies.silver,before+expected);assert.equal(saved.equipInfo.equipSetMap[0][selected.type].uid,protectedUid);assert.equal(data(sale,2201).uids.length,sellable.length);assert.equal(saved.items[20],123);assert.equal(saved.currencies.diamond,777);
 out.checks.push('auto sell exact silver, worn UID protected, unrelated inventory intact');
 out.totalSilver=total;out.totalSkips=skips;out.level=saved.boxInfo.level;out.quality=selected.quailty;out.equippedId=selected.id;out.saleSilver=expected;out.result='PASS';await ps.drainPendingSaves(uid);
}
main().catch(e=>{out.result='FAIL';out.error=e.stack;process.exitCode=1;}).finally(async()=>{try{if(mongoose.connection.readyState===1&&mongoose.connection.db.databaseName===dbName&&/^lhs_drop100_qa_[a-f0-9]{16}$/.test(dbName)){await mongoose.connection.db.dropDatabase();out.cleaned=true;}}finally{await mongoose.disconnect();console.log(JSON.stringify(out,null,2));}});
