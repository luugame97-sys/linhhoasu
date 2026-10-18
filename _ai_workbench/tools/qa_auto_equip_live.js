'use strict';
const assert=require('assert/strict'),crypto=require('crypto'),WebSocket=require('/linhhoasu/lhs/newServer/node_modules/ws');
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const {Pack,Unpack}=require('/linhhoasu/lhs/newServer/src/protocol/Codec');
const config=require('/linhhoasu/lhs/newServer/src/services/ConfigService');
const DB='lhs_s1001',uid='qa_auto_equip_'+Date.now().toString(36),dbUid=uid+'_s1001',playerId=crypto.randomBytes(12).toString('hex'),name='QA Mặc Đồ '+Date.now().toString(36).slice(-6);
const client=new MongoClient('mongodb://127.0.0.1:27017');let ws;
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
function recv(tag,msgUid,timeout=30000){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(Error('TIMEOUT '+tag));},timeout);function onMessage(raw){let rows;try{const buf=Buffer.isBuffer(raw)?raw:Buffer.from(raw);rows=Unpack(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));}catch(e){return;}for(const p of (Array.isArray(rows)?rows:[rows]))if(p&&p.tag===tag&&(msgUid==null||p.msgUid===msgUid)){cleanup();return resolve(p)}}function cleanup(){clearTimeout(timer);ws.off('message',onMessage)}ws.on('message',onMessage);});}
function send(tag,data,msgUid,timeout){const response=recv(tag,msgUid,timeout);ws.send(Pack(tag,data,msgUid));return response;}
async function main(){
 await client.connect();const col=client.db(DB).collection('players');config.loadAllTables();
 const source=await col.findOne({isBot:true});assert.ok(source,'BOT_TEMPLATE_MISSING');
 const assets=config.get('AssetsConfig')||{},asset=Object.values(assets).find(x=>x&&Number(x.type)===3&&Number(x.subType)>0);assert.ok(asset);
 const attrs=config.get('AttrConfig')||{},attrId=Object.keys(attrs).find(k=>Number(attrs[k].power)>0);assert.ok(attrId);
 const type=Number(asset.subType),make=(n,value)=>({uid:900000000+n,id:Number(asset.id),type,quailty:Number(asset.quality)||1,lv:10,attrs:{[attrId]:value}});
 const first=make(1,200),strong=make(2,400),equal=make(3,400),protectedEquip=make(4,50);
 delete source._id;delete source.__v;source.userId=dbUid;source.playerId=playerId;source.name=name;source.accountId='';source.isBot=false;delete source.botWorker;source.serverId=1001;source.serverName='S1';
 source.equipInfo={curIndex:0,openListMap:{0:[first,strong,equal,protectedEquip]},equipSetMap:{0:{},1:{[type]:protectedEquip}},setInfoMap:{},raidSetMap:{},equipList:[first,strong,equal,protectedEquip]};
 await col.insertOne(source);
 try{
  ws=new WebSocket('ws://127.0.0.1:9200',{headers:{Origin:'http://127.0.0.1'},handshakeTimeout:10000});await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});
  let p=await send(1,{platformuid:uid,userid:uid,userId:uid,serverid:1001,serverId:1001,firstName:name},101,60000);assert.equal(p.data.result,0);
  if(process.env.QA_AUTO_EQUIP_LOGIN_ONLY==='1'){console.log('AUTO_EQUIP_LOGIN_ONLY='+JSON.stringify({result:'PASS'}));return;}
  p=await send(2200,{uid:first.uid,listId:0,mapId:0,autoDelegate:true},102);assert.equal(p.data.result,0);assert.equal(p.data.beforePower,0);assert.ok(p.data.afterPower>0);const emptySlotPower={before:p.data.beforePower,after:p.data.afterPower};
  p=await send(2200,{uid:strong.uid,listId:0,mapId:0,autoDelegate:true},103);assert.equal(p.data.result,0);assert.equal(p.data.autoDelegate,true);assert.ok(p.data.afterPower>p.data.beforePower);const upgradePower={before:p.data.beforePower,after:p.data.afterPower};
  p=await send(2201,{uids:[first.uid,equal.uid,protectedEquip.uid],autoDelegate:true},104);assert.deepEqual(new Set(p.data.uids),new Set([first.uid]));assert.deepEqual(new Set(p.data.ignoredUids),new Set([equal.uid,protectedEquip.uid]));
  await wait(1000);const saved=await col.findOne({userId:dbUid});assert.equal(saved.equipInfo.equipSetMap['0'][String(type)].uid,strong.uid);assert.equal(saved.equipInfo.equipSetMap['1'][String(type)].uid,protectedEquip.uid);assert.ok(saved.equipInfo.openListMap['0'].some(x=>x.uid===protectedEquip.uid));assert.ok(saved.equipInfo.openListMap['0'].some(x=>x.uid===equal.uid));assert.ok(!saved.equipInfo.openListMap['0'].some(x=>x.uid===first.uid));
  console.log('AUTO_EQUIP_LIVE='+JSON.stringify({result:'PASS',checks:18,emptySlotPower,upgradePower,equalPowerPreserved:true,protectedUidPreserved:true}));
 }finally{if(ws)try{ws.close()}catch(e){}await wait(1500);await col.deleteMany({userId:/^qa_auto_equip_/});const left=await col.countDocuments({userId:/^qa_auto_equip_/});assert.equal(left,0);await client.close();console.log('AUTO_EQUIP_CLEANUP='+JSON.stringify({result:'PASS',remaining:left}));}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
