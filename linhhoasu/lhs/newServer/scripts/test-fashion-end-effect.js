'use strict';
// Actual handlers and native request functions, isolated from sockets and databases.
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),Module=require('module');
const app=process.env.FEATURE_APP||path.resolve(__dirname,'..');
const clone=v=>JSON.parse(JSON.stringify(v));
let networkAttempts=0,saves=0,saveMode='ok',saved=null;
const deny=()=>{networkAttempts++;throw Error('TEST_NETWORK_DENIED');};
require('net').Socket.prototype.connect=deny;require('tls').connect=deny;global.fetch=deny;
for(const k of ['http','https']){require(k).request=deny;require(k).get=deny;}
function stub(rel,exports){const f=require.resolve(path.join(app,rel));require.cache[f]={id:f,filename:f,loaded:true,exports};}
stub('src/logger',{info(){},warn(){},error(){},debug(){}});
stub('src/services/PlayerService',{drainPendingSaves:async()=>{},savePlayer:async(_id,p)=>{
 saves++;if(saveMode==='null')return null;if(saveMode==='throw')throw Error('TEST_SAVE_FAILURE');
 saved=clone(p);if(saveMode==='commit-throw')throw Error('TEST_AMBIGUOUS_SAVE');return saved;
}});
stub('src/services/RuntimeBus',{getWsServer:()=>null});
const config=require(path.join(app,'src/services/ConfigService')),tables=config.loadAllTables();
const appearance=require(path.join(app,'src/services/RoleAppearanceService')),receipts=require(path.join(app,'src/services/FeatureReceiptService'));
if(process.env.FEATURE_FASHION_SOURCE){const f=path.join(app,'src/handlers/fashion.js'),m=new Module(f,module);m.filename=f;m.paths=Module._nodeModulePaths(path.dirname(f));require.cache[f]=m;m._compile(fs.readFileSync(process.env.FEATURE_FASHION_SOURCE,'utf8'),f);m.loaded=true;}
const fashion=require(path.join(app,'src/handlers/fashion'));
const file=process.env.FEATURE_MAIN||path.resolve(app,'../../webgame/game/js/main.min_drop100.js');
const main=fs.readFileSync(file,'utf8');
const native={
 click:'function(){var t=Y.Config.FashionEndDressConfig[this.selectId];Y.FashionModel.IsFashionActive(t.endEffectId)?Y.FashionModel.GetCurFashionSkin(304)==t.endEffectId?Y.FashionModel.sendChangeFshion(-1,304):Y.FashionModel.sendChangeFshion(t.endEffectId,304):(S.ins().showTips(B.ConvertLanguageToText(30033352)),this.updateEndSkill())}',
 send:'function(t,e,i){var n=this,t=(i=-1==(i=void 0===i?-1:i)?this.getCurSetId():i,{id:t,type:e,set:i=-1==Y.Config.FashionBaseConfig.planPart.indexOf(e)?-1:i});this.Rpc(1801,t,function(t){n._fashionInfo.fashion[t.type]=t.id,A.ins().dispatch(E.CHANGE_IDLE_MAP_ROLE_SHOW),A.ins().dispatch(E.EQUIP_FASHION_CHANGE)})}'
};
assert(main.includes('.onClickESCheckBox='+native.click));assert(main.includes('.sendChangeFshion='+native.send));
const checks=[];let serial=0;
function fresh(ids=[]){const p={userId:'end_effect_fixture_'+(++serial),playerId:'fixture',level:120,roleInfo:{kungfuId:8,subJob:1},items:{},currencies:{diamond:0,silver:0,gold:0},fashionInfo:{fashion:{},curFashion:{},fashionMap:{},equipped:{},fashions:{},activateFashion:[],fashionData:[],sets:[],setId:0,suits:{},dress:[]}};ids.forEach(id=>appearance.grantFashionOwnership(p,id));appearance.ensureRoleAppearance(p);for(const k of ['fashion','curFashion','fashionMap','equipped'])p.fashionInfo[k][304]=-1;return{userId:p.userId,player:p};}
const ack=(r,tag)=>(Array.isArray(r)?r:[r]).find(x=>x.tag===tag)?.data;
const change=(s,id,type=304,set=0,extra={})=>fashion.handleChangeFashion({id,type,set,...extra},s,77);
async function denied(s,id,type=304,set=0){const before=clone(s.player),beforeSaves=saves;const r=ack(await change(s,id,type,set),1801);assert.notEqual(r.result,0);assert.deepEqual(s.player,before);assert.equal(saves,beforeSaves);return r;}
async function test(name,fn){await fn();checks.push(name);}
async function run(){
 for(const dressId of [28320,28330]){
  const end=tables.FashionEndDressConfig[dressId],effect=end.endEffectId;
  await test('native-toggle-and-reload-'+dressId,async()=>{
   const s=fresh([...end.fashionIds,effect]);assert.equal(ack(await fashion.handleChangeSuit({id:dressId,color:0,set:0},s,78),1802).result,0);
   const requests=[],ctx=vm.createContext({Y:{Config:tables,FashionModel:null},S:{ins:()=>({showTips(){throw Error('UNEXPECTED_LOCKED_TIP');}})},B:{ConvertLanguageToText:String},A:{ins:()=>({dispatch(){}})},E:{}});
   const model={_fashionInfo:clone(s.player.fashionInfo),getCurSetId:()=>0,GetCurFashionSkin(t){return this._fashionInfo.fashion[t]??-1;},IsFashionActive:id=>appearance.hasFashionOwnership(s.player,id),Rpc:(tag,data,cb)=>requests.push({tag,data,cb})};ctx.Y.FashionModel=model;
   model.sendChangeFshion=vm.runInContext('('+native.send+')',ctx);const click=vm.runInContext('('+native.click+')',ctx);
   for(const expected of [effect,-1,effect]){
    click.call({selectId:dressId,updateEndSkill(){}});assert.equal(requests.length,1);const q=requests.shift();assert.equal(q.tag,1801);assert.equal(q.data.id,expected);
    const packets=await fashion.handleChangeFashion(q.data,s,77),r=ack(packets,1801);assert.equal(r.result,0);
    const push=packets.find(p=>p.tag===1800);assert.equal(push.data.selection[304],expected);assert.equal(packets.at(-1).tag,1801);
    q.cb(r);assert.equal(model.GetCurFashionSkin(304),expected);
    const reloaded=clone(saved);appearance.ensureRoleAppearance(reloaded);assert.equal(appearance.getPlayerFashionMap(reloaded)[304],expected);
   }
   assert.equal(s.player.currencies.diamond,0);assert.deepEqual(s.player.items,{});
  });
  await test('separate-effect-ownership-'+dressId,async()=>{const s=fresh([effect]);assert.equal(ack(await change(s,effect),1801).result,0);assert(end.fashionIds.every(id=>!appearance.hasFashionOwnership(s.player,id)));});
  await test('full-suit-without-effect-denied-'+dressId,()=>denied(fresh(end.fashionIds),effect));
  await test('whole-suit-piece-stays-protected-'+dressId,async()=>{const s=fresh([...end.fashionIds,effect]);assert.equal((await denied(s,end.fashionIds[2],303)).code,'FASHION_WHOLE_SUIT_REQUIRED');});
 }
 await test('presets-and-relog',async()=>{
  const s=fresh([28324,28334]);await change(s,28324,304,0);await change(s,28334,304,1);
  assert.equal(s.player.fashionInfo.setId,1);assert.equal(s.player.fashionInfo.fashion[304],28334);
  assert.equal(ack(await fashion.handleFashionChangeSet({setId:0},s,78),1805).result,0);assert.equal(s.player.fashionInfo.fashion[304],28324);
  assert.equal(ack(await fashion.handleFashionChangeSet({setId:1},s,78),1805).result,0);assert.equal(s.player.fashionInfo.fashion[304],28334);
  const p=clone(saved);appearance.ensureRoleAppearance(p);assert.equal(p.fashionInfo.fashion[304],28334);
  await change(s,-1,304,1);await fashion.handleFashionChangeSet({setId:0},s,78);assert.equal(s.player.fashionInfo.fashion[304],28324);
 });
 await test('current-and-bath-preset-isolation',async()=>{const s=fresh([28324,28334]);await change(s,28324,304,-1);assert.equal(s.player.fashionInfo.fashion[304],28324);await change(s,28334,304,999);assert.equal(s.player.fashionInfo.fashion[304],28324);assert.equal(s.player.fashionInfo.sets.find(x=>x.id===999).selection[304],28334);});
 await test('invalid-requests-denied',async()=>{for(const [id,type,set]of [[28324,303,0],[28324,304,3],[999999,304,0],[28324.5,304,0],[-2,304,0],[28324,304,-2]])await denied(fresh([28324]),id,type,set);});
 await test('config-relationship-required',async()=>{
  const end=tables.FashionEndDressConfig[28320],row=tables.FashionConfig[28324],d=tables.FashionDressConfig[28320];
  for(const mode of ['unregistered','wrong-parent','wrong-kind']){
   const originals={end:end.endEffectId,parent:row.dressId,kind:d.isSuit};
   try{if(mode==='unregistered')end.endEffectId=0;if(mode==='wrong-parent')row.dressId=28330;if(mode==='wrong-kind')d.isSuit=1;
    assert.equal((await denied(fresh([28324]),28324)).code,'FASHION_END_EFFECT_INVALID');
   }finally{end.endEffectId=originals.end;row.dressId=originals.parent;d.isSuit=originals.kind;}
  }
 });
 await test('opening-effect-306-regression',async()=>{const s=fresh([28416]);assert.equal(ack(await change(s,28416,306),1801).result,0);assert.equal(s.player.fashionInfo.fashion[306],28416);});
 await test('receipt-replay-after-newer-selection',async()=>{
  const s=fresh([28324,28334]),e=receipts.createEpoch(s.player),req={requestId:'v3_'+e.epoch+'_1'};const beforeSaves=saves;
  await change(s,28324,304,0,req);await change(s,28334,304,0,{requestId:'v3_'+e.epoch+'_2'});
  const r=ack(await change(s,28324,304,0,req),1801);assert(r.replayed);assert.equal(saves,beforeSaves+2);assert.equal(r.selection[304],28334);assert.equal(s.player.fashionInfo.fashion[304],28334);
  await assert.rejects(change(s,28334,304,0,req),/FEATURE_REQUEST_CONFLICT/);
 });
 await test('duplicate-concurrent-clicks-save-once',async()=>{const s=fresh([28324]),e=receipts.createEpoch(s.player),before=saves,req={requestId:'v3_'+e.epoch+'_1'};const rows=await Promise.all(Array.from({length:20},()=>change(s,28324,304,0,req)));assert.equal(saves,before+1);assert.equal(rows.filter(r=>ack(r,1801).replayed).length,19);});
 for(const mode of ['null','throw','commit-throw'])await test('save-failure-'+mode,async()=>{
  const s=fresh([28324]),p=s.player,before=clone(p),e=receipts.createEpoch(p),req={requestId:'v3_'+e.epoch+'_1'};const expected=clone(p);saveMode=mode;
  try{await assert.rejects(change(s,28324,304,0,req));assert.equal(s.player,null);assert.deepEqual(p,expected);
   if(mode==='commit-throw'){s.player=clone(saved);saveMode='throw';const r=ack(await change(s,28324,304,0,req),1801);assert(r.replayed);assert.equal(s.player.fashionInfo.fashion[304],28324);}
  }finally{saveMode='ok';}
 });
 assert.equal(networkAttempts,0);console.log(JSON.stringify({result:'PASS',tests:checks.length,checks,savesInMemory:saves,productionWrites:0,networkAttempts}));
}
run().catch(e=>{console.error(e.stack);process.exitCode=1;});
