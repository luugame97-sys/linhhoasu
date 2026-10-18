'use strict';
// Only the uniquely named QA player created by this run is modified/deleted.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const APP = '/linhhoasu/lhs/newServer';
const WebSocket = require(APP + '/node_modules/ws');
const { MongoClient } = require(APP + '/node_modules/mongodb');
const { Pack, Unpack } = require(APP + '/src/protocol/Codec');
const config = require(APP + '/src/services/ConfigService');
const uid = 'qa_usable_safe_' + crypto.randomBytes(8).toString('hex');
const dbUid = uid + '_s1001';
const playerId = crypto.randomBytes(12).toString('hex');
const client = new MongoClient('mongodb://127.0.0.1:27017');
const wait = ms => new Promise(r=>setTimeout(r,ms));
let ws,seq=14000;const packets=[];let inserted=false;
function receive(match) {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{off();reject(new Error('QA_PACKET_TIMEOUT'));},15000);
    function on(p){if(match(p)){off();resolve(p);}}
    function off(){clearTimeout(timer);ws.off('qa-packet',on);}
    ws.on('qa-packet',on);
  });
}
async function open() {
  ws = new WebSocket('ws://127.0.0.1:9200',{headers:{Origin:'http://127.0.0.1'},handshakeTimeout:10000});
  ws.on('message',raw=>{
    const b=Buffer.from(raw);let decoded;
    try {decoded=Unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}catch{return;}
    for(const p of Array.isArray(decoded)?decoded:[decoded]){packets.push(p);ws.emit('qa-packet',p);}
  });
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  const init=receive(p=>p.tag===500&&p.data);
  const reply=await rpc(1,{platformuid:uid,userid:uid,userId:uid,serverid:1001,serverId:1001,firstName:'QA Usable Safe'});
  assert.equal(reply.data.result,0);return (await init).data;
}
async function rpc(tag,data){const msgUid=++seq;const next=receive(p=>p.tag===tag&&p.msgUid===msgUid);ws.send(Pack(tag,data,msgUid));return next;}
async function main(){
  await client.connect();const players=client.db('lhs_s1001').collection('players');
  try{
    const source=await players.findOne({isBot:true});assert(source);delete source._id;delete source.__v;
    source.userId=dbUid;source.playerId=playerId;source.name='QA Usable Safe';source.accountId='';source.isBot=false;delete source.botWorker;
    source.guildId='';source.guildInfo={};source.serverId=1001;source.serverName='S1';source.level=99;
    source.items={90044:6,90045:18,90046:18,100080:2,100810:1,100811:1,100812:1,100813:1,100139:1,94401:1,90021:1,90022:1,110122:1};
    source.itemUseRecords={};source.currencies={diamond:0,silver:0,gold:0};
    await players.insertOne(source);inserted=true;await open();
    let selected=0;
    for(const id of [90044,90045,90046]){
      for(const bad of [{},{selects:{999:1}},{selects:{0:1,1:1}},{selects:{0:1},count:1.5}]){
        const reply=await rpc(1300,{index:id,count:1,...bad});assert.equal(reply.data.result,-1);
      }
      const cfg=config.get('AssetsUseConfig')[id];
      for(const [index,option] of cfg.rewards.entries()){
        const reply=await rpc(1300,{index:id,count:1,selects:{[index]:1}});assert.equal(reply.data.result,0);
        const arts=reply.data.rewardInfo.artifacts;assert.equal(arts.length,1);
        const special=config.get('SpecialArtifactConfig')[option.id];assert.equal(arts[0].id,special?special.showId:option.id);
        if(special)assert.equal(arts[0].sourceSpecialArtifactId,option.id);selected++;
      }
    }
    const fixed={100080:25032,100810:25051,100811:25052,100812:25053,100813:25054};const gems=[];
    for(const [id,target] of Object.entries(fixed)){
      const reply=await rpc(1300,{index:Number(id),count:1});assert.equal(reply.data.result,0);
      assert.equal(reply.data.rewardInfo.gems.length,1);assert.equal(reply.data.rewardInfo.gems[0].id,target);
      gems.push(reply.data.rewardInfo.gems[0]);
    }
    const depleted=await rpc(1300,{index:90044,count:1,selects:{0:1}});assert.equal(depleted.data.result,-1);
    for(const id of [100139,94401,90021,90022,110122]){
      const reply=await rpc(1300,{index:id,count:1,selects:{0:1}});assert.equal(reply.data.result,-1);
    }
    let saved=await players.findOne({userId:dbUid,playerId});
    for(const id of [90044,90045,90046])assert.equal(Number(saved.items[id]||0),0);
    for(const id of [100139,94401,90021,90022,110122])assert.equal(saved.items[id],1);
    for(const gem of gems)assert(saved.other_attr_info.gemInfo.gems.some(x=>x.uid===gem.uid&&x.id===gem.id));
    assert(!packets.some(p=>p.tag===5209));
    ws.close();await wait(700);await open();saved=await players.findOne({userId:dbUid,playerId});
    assert.equal(saved.items[100080],1);assert.equal(saved.items[100139],1);
    for(const gem of gems)assert(saved.other_attr_info.gemInfo.gems.some(x=>x.uid===gem.uid&&x.id===gem.id));
    console.log('USABLE_SAFE_LIVE='+JSON.stringify({result:'PASS',serverId:1001,p0Options:selected,fixedGems:gems.length,invalidRejected:12,heldPreserved:5,persisted:true,relog:true,nativeVisualTest:false}));
  }finally{
    if(ws){ws.close();await wait(1200);if(ws.readyState!==WebSocket.CLOSED)ws.terminate();}
    if(inserted){await players.deleteOne({userId:dbUid,playerId});await wait(800);assert.equal(await players.countDocuments({userId:dbUid,playerId}),0);}
    await client.close();console.log('USABLE_SAFE_CLEANUP='+JSON.stringify({result:'PASS',remaining:0}));
  }
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
