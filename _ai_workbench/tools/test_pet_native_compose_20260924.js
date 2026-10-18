'use strict';
// Diagnostic only: execute native client functions + production-shaped handler
// against a local copy of Tuanpkt's snapshot. No RPC, Mongo, Redis, or deployment.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const app = path.join(root, 'linhhoasu/lhs/newServer');
const outDir = path.join(root, '_ai_workbench/temp/pet_incident_20260924');
const copy = x => JSON.parse(JSON.stringify(x));
let networkAttempts = 0;
const deny = () => { networkAttempts++; throw Error('NETWORK_DENIED'); };
require('node:net').Socket.prototype.connect = deny;
for (const id of ['node:http', 'node:https']) { require(id).request = deny; require(id).get = deny; }
global.fetch = deny;
const logPath = require.resolve(path.join(app, 'src/logger'));
require.cache[logPath] = { id: logPath, filename: logPath, loaded: true, exports: { debug(){}, info(){}, warn(){}, error(){} } };
const config = require(path.join(app, 'src/services/ConfigService'));
const tables = config.loadAllTables();
const packet = require(path.join(app, 'src/protocol/PacketManager'));
const acorn = require(path.join(app, 'node_modules/acorn'));
const client = fs.readFileSync(path.join(root, 'linhhoasu/webgame/game/js/main.min_drop100.js'), 'utf8');
const server = fs.readFileSync(path.join(app, 'src/handlers/pet.js'), 'utf8');
const original = JSON.parse(fs.readFileSync(path.join(outDir, 'compose_before.json'), 'utf8')).player;
const hashes = { client:crypto.createHash('sha256').update(client).digest('hex'), server:crypto.createHash('sha256').update(server).digest('hex') };
const offsets = {};
function native(name, prefix, context) {
  const marker = prefix + '.' + name + '=function';
  const found = client.indexOf(marker);
  assert.ok(found >= 0, 'MISSING_NATIVE_FUNCTION:' + name);
  const start = found + marker.length - 'function'.length;
  const rest = client.slice(start), tokenizer = acorn.tokenizer(rest, { ecmaVersion:'latest' });
  let depth = 0, opened = false, end = 0;
  for (;;) {
    const tok = tokenizer.getToken(), label = tok.type.label;
    if (label === '{') { opened = true; depth++; }
    if (label === '}' && --depth === 0 && opened) { end = tok.end; break; }
    assert.notEqual(label, 'eof', 'UNTERMINATED_NATIVE_FUNCTION:' + name);
  }
  offsets[name] = { start, end:start+end };
  return vm.runInContext('(' + rest.slice(0, end) + ')', context);
}
function harness() {
  const player = copy(original), session = { userId:player.userId, player };
  let saves = 0, pending = [], serial = 0;
  const requests = [], events = [], draws = [];
  const ps = { async savePlayer(){saves++;return player;},async savePlayerDeferred(){saves++;return player;} };
  const dependencies = {
    '../services/ConfigService':config, '../services/PlayerService':ps,
    '../logger':{warn(){}},
    '../services/MainTaskProgressService':{addPetComposeCount(){return false;},addPetWashCount(){return false;},refreshMainTaskProgress(){return false;}},
    './raid':{addRewardToPlayer(){throw Error('UNEXPECTED_REWARD');}},
    './task':{buildActiveTaskUpdatePackets(){return [];}}
  };
  const module = {exports:{}};
  vm.runInNewContext(server, {module,exports:module.exports,require(key){if(!dependencies[key])throw Error('UNEXPECTED_DEPENDENCY:'+key);return dependencies[key];},process:{env:{}},console,Date,Math});
  const model = {_petInfo:copy(original.petInfo),petUnlockMap:{}};
  const E = Object.fromEntries(['PET_COMP_UPDATE','PET_DATA_UPDATE','PET_FLYICON_UPDATE','ATTR_CHANGE','CHANGE_IDLE_MAP_ROLE_SHOW'].map(x=>[x,x]));
  let view;
  const ctx = vm.createContext({
    Y:{Config:tables,PetModel:model,GuideUtil:{endDragGuide(){}},RepeatRpcBlockModel:{checkRpc(){return true;},setRpcRecord(){}},CuriosModel:{taskCheck(){}}},
    E,O:Math,A:{ins(){return {dispatch(event,...args){events.push(event);if(event===E.PET_COMP_UPDATE)view.updateComp(...args);if(event===E.PET_DATA_UPDATE)view.update(args[0]);}}}},
  });
  for (const name of ['getPetDataByUid','getPetComposes','getPetEquips','updatePetData','deletePet','sendCompose','sendChangeSlot']) model[name]=native(name,'a',ctx);
  model.Rpc = (tag,params,callback) => {
    const msgUid=++serial,handler={3302:module.exports.handlePetCompose,3301:module.exports.handlePetChangeSlot}[tag];
    assert.ok(handler,'UNEXPECTED_RPC:'+tag);
    pending.push((async()=>{
      const result=await handler(params,session,msgUid),rows=Array.isArray(result)?result:[result];
      const ack=rows.find(x=>x.tag===tag&&x.msgUid===msgUid);
      const bytes=packet.packSingle(ack.tag,ack.data,ack.msgUid),decoded=packet.unpackClient(bytes)[0];
      requests.push({tag,params,result:decoded.data.result,flags:bytes.readUInt32BE(8)});
      // Same dispatch rule as native GameSocket: flags=0 delivers the data to
      // the success callback even when data.result=-1.
      assert.equal(decoded.err,undefined);
      callback(decoded.data);
    })());
  };
  const rendered = copy(model.getPetComposes());
  view = {
    _dragLock:false,_chooseSpine:null,_isDragging:true,
    _touchData:{beginTouchType:2,uid:100004,slot:0,lock:0},
    tempSpine:{visible:false,parent:{globalToLocal(x,y){return {x,y};}}},
    composeGroup:{x:0,y:0,width:4,height:4},equipGroup:{x:0,y:-3,width:3,height:1},
    _listItemHeight:1,_listItemWidth:1,
    _qualityData:[{id:9}],
    _composeItems:Array.from({length:16},()=>({setMask(){},playCompSpine(){},playLvAnim(){}})),
    update(indices){for(const index of indices||rendered.map((_,i)=>i))if(index>=0)rendered[index]=model.getPetComposes()[index];draws.push(copy(rendered));},
  };
  for(const name of ['onTouchEnd','checkCanCompose','isTouchEquipGroup','isTouchSlotGroup','getTouchSlotIndex','updateComp'])view[name]=native(name,'_',ctx);
  return {model,view,player,requests,events,draws,rendered,get saves(){return saves;},async flush(){const work=pending;pending=[];await Promise.all(work);}};
}
async function main() {
  const h=harness();
  assert.equal(h.player.items[36]||0,0);
  assert.equal(tables.PetConfig[83401].quality,3);
  assert.equal(tables.PetQualityConfig[3].consumes[0].count,10);
  const baseline=copy(h.player.petInfo);
  h.view.onTouchEnd({stageX:1.5,stageY:1.5},false);await h.flush();
  assert.equal(h.requests[0].tag,3302);
  assert.equal(h.requests[0].result,-1);
  assert.equal(h.model.getPetDataByUid(100004),null);
  assert.equal(h.model.getPetDataByUid(100007),null);
  assert.deepEqual(h.player.petInfo,baseline);
  assert.equal(h.saves,0);
  assert.equal(h.draws.length,0,'failed compose does not repaint: updateComp sees null');
  const first={serverCount:h.player.petInfo.pets.length,clientCount:h.model._petInfo.pets.length,renderedSlots:copy(h.rendered),draws:h.draws.length,saves:h.saves};
  // Same second drag uses the old visible renderer, while native model now
  // reports the target slot empty. The native view takes the move-slot route.
  h.view._touchData={beginTouchType:2,uid:100004,slot:0,lock:0};
  h.view.onTouchEnd({stageX:1.5,stageY:1.5},false);await h.flush();
  assert.equal(h.requests[1].tag,3301);
  assert.equal(h.requests[1].result,0);
  assert.equal(h.rendered[0],-1);assert.equal(h.rendered[5],-1);
  assert.equal(h.player.petInfo.pets.length,14);
  assert.equal(h.player.petInfo.pets.find(p=>p.uid===100004).slot,5);
  assert.equal(h.player.petInfo.pets.find(p=>p.uid===100007).slot,0);
  const after=JSON.parse(fs.readFileSync(path.join(outDir,'compose_after.json'),'utf8')).player;
  assert.deepEqual(h.player.petInfo,after.petInfo,'native two-drag reproduction must match full live Pet state');
  assert.equal(networkAttempts,0);
  const result={result:'REPRODUCED',productionWrites:0,networkAttempts,hashes,offsets,requests:h.requests,first,second:{serverCount:14,clientCount:h.model._petInfo.pets.length,renderedSlots:copy(h.rendered),saves:h.saves,fullPetStateMatchesLiveAfter:true},rootCause:'3302 result -1 is passed as a truthy success response; client deletes both UIDs without repaint. Second drag sends 3301 and repaints empty slots; DB retains both pets.'};
  fs.writeFileSync(path.join(outDir,'native_compose_repro.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
