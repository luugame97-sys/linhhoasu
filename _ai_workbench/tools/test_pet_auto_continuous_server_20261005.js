'use strict';
// RAM-only integration checks: real handler, receipt journal, lock and binary tables.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const app = process.env.FEATURE_APP || path.join(root, 'linhhoasu/lhs/newServer');
const clone = x => JSON.parse(JSON.stringify(x));
let networkAttempts = 0;
const deny = () => { networkAttempts++; throw Error('QA_NETWORK_DENIED'); };
require('node:net').Socket.prototype.connect = deny;
require('node:tls').connect = deny;
const log = { info() {}, warn() {}, error() {}, debug() {} };
const loggerPath = require.resolve(path.join(app, 'src/logger'));
require.cache[loggerPath] = { id: loggerPath, filename: loggerPath, loaded: true, exports: log };
const config = require(path.join(app, 'src/services/ConfigService'));
const tables = process.env.FEATURE_CONFIG_BIN
  ? config.decodeTables(fs.readFileSync(process.env.FEATURE_CONFIG_BIN)) : config.loadAllTables();
require(path.join(app, 'src/config/petGrid48')).apply(tables);
const receipts = require(path.join(app, 'src/services/FeatureReceiptService'));
const mutation = require(path.join(app, 'src/services/PlayerMutationService'));
const source = fs.readFileSync(path.join(app, 'src/handlers/pet.js'), 'utf8');
const ack = (r, tag = 3314) => (Array.isArray(r) ? r : [r]).find(p => p.tag === tag).data;
const eq = (a,b,msg) => {
  if(b && Object.hasOwn(b,'composeCount')) b={hatchedCount:0,canContinue:false,stopReason:b.blockedCostQualities?.length?'INSUFFICIENT_COST':b.blockedExpCap?'EXP_LEVEL_CAP':'NO_ACTION',...b};
  assert.deepEqual(clone(a),clone(b),msg);
};
const ids = q => Object.values(tables.PetConfig).filter(p => p.quality === q && p.tag !== 2).map(p => p.id);
const q = Number(Object.keys(tables.PetQualityConfig).find(k => +k >= 2 && +k < 8 && ids(+k).length && tables.PetQualityConfig[k].consumes?.some(c => c.count > 0) && tables.PetQualityConfig[k].composeSuccessRate > 0 && tables.PetQualityConfig[k].composeSuccessRate < 10000));
assert.ok(q, 'need real configured quality supporting paid success and failure');
const pet = (uid, quality=q, slot=uid-1, extra={}) => ({ uid, id:ids(quality)[0], level:1, exp:0, slot, locked:0, passiveSkills:[], lockSkills:[], ...extra });
let serial=0;
function player(pets=[pet(1),pet(2)], field=48) {
  return { userId:'RAM_GRID_'+(++serial), level:120, roleInfo:{stage:1,kungfuId:4}, items:{36:10000000}, currencies:{diamond:10000000,silver:10000000,gold:10000000}, other_attr_info:{}, petInfo:{field,pets,nextUid:100100,unlockAtlas:[],rewardedAtlas:[],wishMap:{},timeRecords:{}} };
}
function load(p, mode='ok', rng=0) {
  const state={ saves:0, invalidations:0, durable:null, original:clone(p), beforeSave:null };
  const deps={
    '../services/ConfigService':{get:k=>tables[k]||{}}, '../logger':log,
    '../services/FeatureReceiptService':receipts, '../services/PlayerMutationService':mutation,
    '../services/RuntimeBus':{getWsServer:()=>({getPlayerForMutation:()=>p,invalidatePlayerForMutation:()=>state.invalidations++})},
    '../services/PlayerService':{
      drainPendingSaves:async()=>{}, savePlayerDeferred:async()=>true,
      savePlayer:async(_id,draft)=>{ state.saves++; state.beforeSave=clone(p); assert.notEqual(draft,p,'draft must be isolated'); eq(p,state.original,'no mutation before confirmation'); if(mode==='null')return null; if(mode==='throw')throw Error('PRECOMMIT'); state.durable=clone(draft); if(mode==='postcommit')throw Error('UNKNOWN_COMMIT'); return true; }
    },
    '../services/MainTaskProgressService':{addPetComposeCount:()=>false,addPetWashCount:()=>false,refreshMainTaskProgress:()=>false},
    '../services/CurrencySync':{buildClientItemList:p=>Object.entries(p.items).map(([id,count])=>({id:+id,count}))},
    './raid':{addRewardToPlayer:(p,id,count)=>{p.items[id]=(p.items[id]||0)+count;}},
    './task':{buildActiveTaskUpdatePackets:()=>[]}
  };
  const module={exports:{}};
  vm.runInNewContext(source,{module,exports:module.exports,require:k=>{assert.ok(k in deps,'unexpected dependency '+k);return deps[k];}, process:{env:{}}, Date, Math:Object.assign(Object.create(Math),{random:()=>rng}), console },{filename:'pet.grid48.test.js'});
  return {...state, state, handler:module.exports, session:{userId:p.userId,player:p}};
}
const intent = suffix => ({quality:q+1,requestId:Date.now()+'-'+String(suffix).replace(/[^A-Za-z0-9_-]/g,'_').padEnd(8,'x')});
const count=(p,id)=>({1:p.currencies.diamond,2:p.currencies.silver,6:p.currencies.gold}[id]??p.items[id]??0);
function cost(p,before){for(const c of tables.PetQualityConfig[q].consumes||[]) assert.equal(count(before,c.id)-count(p,c.id),c.count,'configured cost '+c.id);}
const passed=[];
async function main(){
  assert.equal(tables.PetBaseConfig.initialField,48); assert.equal(tables.PetBaseConfig.fieldMax,48); assert.equal(tables.PetBaseConfig.fieldConsume.length,0);
  for(const field of [8,16]) { const p=player([pet(123,q,7),pet(456,9,-1)],field), h=load(p); const before=p.petInfo.pets.map(p=>[p.uid,p.id,p.slot]); h.handler.ensurePetInfo(p); assert.equal(p.petInfo.field,48); eq(p.petInfo.pets.map(p=>[p.uid,p.id,p.slot]),before); }
  passed.push('legacy 8/16 hydrate to free48 preserving UID/id/slot');
  { const p=player([pet(123,q,7)],8);p.items[24]=5;const h=load(p);assert.equal(h.handler.settleFreePetEgg(p),true);assert.equal(p.petInfo.field,48);assert.equal(p.petInfo.pets[0].uid,123);assert.equal(p.petInfo.pets[0].slot,7);assert.equal(h.handler.settleFreePetEgg(p),false); }
  passed.push('login changed flag persists free48 even when free eggs already full');
  { const p=player([pet(1)]),h=load(p); assert.equal(ack(await h.handler.handlePetChangeSlot({uid:1,slot:47},h.session,1),3301).result,0); assert.equal(p.petInfo.pets[0].slot,47); assert.notEqual(ack(await h.handler.handlePetChangeSlot({uid:1,slot:48},h.session,2),3301).result,0); assert.equal(p.petInfo.pets[0].slot,47); }
  passed.push('slot47 accepted, slot48 rejected');
  for(const quality of [-1,1,11,2.5,'4',null]) {if(quality===null)continue; const p=player(),h=load(p),before=clone(p); assert.notEqual(ack(await h.handler.handlePetAutoCompose({quality},h.session,1)).result,0); eq(p,before); assert.equal(h.state.saves,0); }
  passed.push('invalid quality cannot mutate or save');
  { const p=player(); p.items={};p.currencies={diamond:0,silver:0,gold:0};const h=load(p);const pets=clone(p.petInfo.pets); await h.handler.handlePetAutoCompose(intent('poor'),h.session,1);eq(p.petInfo.pets.map(x=>[x.uid,x.id]),pets.map(x=>[x.uid,x.id]));eq(p.items,{});eq(p.currencies,{diamond:0,silver:0,gold:0}); }
  passed.push('insufficient cost leaves pets and currency intact');
  {const protectedPets=[pet(3,q,2,{locked:1}),pet(4,q,-1),pet(5,q,4,{level:2}),pet(6,q,5),pet(7,9,6),pet(8,10,7)]; const p=player([pet(1),pet(2),...protectedPets]);p.other_attr_info.petSoulInfo={petSouls:[{id:1,petUid:6}]};const h=load(p);await h.handler.handlePetAutoCompose(intent('protect'),h.session,1);for(const original of protectedPets){const got=p.petInfo.pets.find(x=>x.uid===original.uid);assert.ok(got,'protected uid '+original.uid); for(const key of ['uid','id','slot','level','locked'])assert.equal(got[key],original[key]);}}
  passed.push('lock/battle/level/soul/q9/q10 survive batch');
  for(const rng of [0,0.999999]) {const p=player(),before=clone(p),h=load(p,'ok',rng);const out=ack(await h.handler.handlePetAutoCompose(intent('roll'+rng),h.session,1));assert.equal(out.result,0);assert.equal(h.state.saves,1);assert.equal(p.petInfo.pets.length,1);cost(p,before);assert.equal(tables.PetConfig[p.petInfo.pets[0].id].quality,rng===0?q+1:q);assert.ok(h.state.durable.other_attr_info.featureReceipts.rows.length);}
  passed.push('configured success/failure outcomes charge configured cost once with durable receipt');
  {const p=player(),h=load(p),params=intent('duplicate');const [a,b]=await Promise.all([h.handler.handlePetAutoCompose(params,h.session,1),h.handler.handlePetAutoCompose(params,h.session,2)]);assert.equal(ack(a).result,0);assert.equal(ack(b).replayed,true);assert.equal(h.state.saves,1);const saved=clone(p);assert.equal(ack(await h.handler.handlePetAutoCompose(params,h.session,3)).replayed,true);eq(p,saved);assert.equal(ack(await h.handler.handlePetAutoCompose({...params,quality:q},h.session,4)).code,'FEATURE_REQUEST_CONFLICT');eq(p,saved);}
  passed.push('concurrent/retry same intent settles once; changed intent conflicts');
  for(const mode of ['null','throw','postcommit']) {const p=player(),before=clone(p),h=load(p,mode),params=intent(mode);await assert.rejects(h.handler.handlePetAutoCompose(params,h.session,1));eq(p,before);assert.equal(h.state.invalidations,1);assert.equal(h.session.player,null);if(mode==='postcommit'){const restored=h.state.durable,h2=load(restored),snapshot=clone(restored);assert.equal(ack(await h2.handler.handlePetAutoCompose(params,h2.session,2)).replayed,true);eq(restored,snapshot);assert.equal(h2.state.saves,0);}}
  passed.push('null/precommit/unknown commit do not publish draft; restore persisted receipt prevents second debit');
  // Omission regressions use actual costs, EXP rows and level cap from the binary.
  // Collect failures so a baseline run demonstrates each independent dead end.
  const regressionFailures=[];
  async function regression(name, fn) {
    try { await fn(); passed.push(name); }
    catch(error) { regressionFailures.push({name,error:error.message}); }
  }
  const costs2=tables.PetQualityConfig[2].consumes;
  const costs3=tables.PetQualityConfig[3].consumes;
  assert.equal(costs2.length,1); assert.equal(costs3.length,1);
  assert.equal(costs2[0].id,36); assert.equal(costs3[0].id,36);
  assert.ok(costs3[0].count>costs2[0].count);
  assert.ok(costs3[0].count-costs2[0].count<costs3[0].count);
  const expPet=(uid,quality,level,slot=uid-1,extra={})=>({
    ...pet(uid,quality,slot,extra),
    id:Object.values(tables.PetConfig).find(row=>row.tag===2&&row.quality===quality).id,
    level
  });
  const cap=tables.PetBaseConfig.levelMax;
  async function batch(p,name,quality=4) {
    const h=load(p);
    assert.equal(ack(await h.handler.handlePetAutoCompose({...intent(name),quality},h.session,1)).result,0);
    assert.equal(h.state.saves,1);
    assert.equal(new Set(p.petInfo.pets.map(x=>x.uid)).size,p.petInfo.pets.length);
    assert.ok(p.petInfo.pets.every(x=>x.level<=cap),'no EXP cap overflow');
  }
  for(const budget of [costs2[0].count,costs3[0].count]) {
    await regression(budget===costs2[0].count
      ? 'unaffordable first quality does not block affordable lower-quality pair'
      : 'low-quality pair takes priority independent of reversed pet insertion order',async()=>{
      const p=player([pet(1,3),pet(2,3),pet(3,2),pet(4,2)]);
      p.items[36]=budget;
      await batch(p,'mixed_budget_'+budget);
      assert.equal(p.petInfo.pets.length,3,'one affordable low-quality pair should compose');
      for(const uid of [1,2]) assert.ok(p.petInfo.pets.some(x=>x.uid===uid&&tables.PetConfig[x.id].quality===3),'higher-quality pair retained '+uid);
      assert.equal(p.petInfo.pets.filter(x=>tables.PetConfig[x.id].quality===2).length,0,'both low-quality inputs consumed');
      assert.equal(p.items[36],budget-costs2[0].count,'only lower-quality configured fee');
    });
  }
  await regression('EXP oversized first material skips to a fitting alternate material',async()=>{
    const p=player([expPet(1,6,cap-1),expPet(2,5,2),expPet(3,4,1)]);
    const before=clone(p.items); await batch(p,'exp_material');
    assert.equal(p.petInfo.pets.length,2);
    assert.equal(p.petInfo.pets.find(x=>x.uid===1).level,cap);
    assert.equal(p.petInfo.pets.find(x=>x.uid===2).level,2);
    assert.ok(!p.petInfo.pets.some(x=>x.uid===3)); eq(p.items,before,'EXP feeding has no compose fee');
  });
  await regression('capped highest EXP target does not block another fitting target',async()=>{
    const p=player([expPet(1,6,cap),expPet(2,5,10),expPet(3,4,1)]);
    await batch(p,'exp_target');
    assert.equal(p.petInfo.pets.length,2);
    assert.equal(p.petInfo.pets.find(x=>x.uid===1).level,cap);
    assert.equal(p.petInfo.pets.find(x=>x.uid===2).level,11);
  });
  await regression('unaffordable normal pairs do not block free EXP feeding',async()=>{
    const p=player([pet(1,2),pet(2,2),expPet(3,5,1),expPet(4,4,1)]);
    p.items={}; p.currencies={diamond:0,silver:0,gold:0};
    await batch(p,'exp_no_budget');
    assert.equal(p.petInfo.pets.length,3);
    for(const uid of [1,2]) assert.ok(p.petInfo.pets.some(x=>x.uid===uid&&x.level===1));
    assert.equal(p.petInfo.pets.find(x=>x.uid===3).level,2);
    eq(p.items,{}); eq(p.currencies,{diamond:0,silver:0,gold:0});
  });
  await regression('target quality and protected EXP remain untouched while eligible pair merges',async()=>{
    const protectedPets=[pet(1,4),pet(2,4),expPet(3,6,1,2,{locked:1}),expPet(4,5,1,-1),expPet(5,4,1,4)];
    const p=player([...protectedPets,pet(6,2),pet(7,2)]);
    p.other_attr_info.petSoulInfo={petSouls:[{id:1,petUid:5}]};
    await batch(p,'target_protection');
    for(const original of protectedPets) {
      const got=p.petInfo.pets.find(x=>x.uid===original.uid); assert.ok(got,'protected pet retained '+original.uid);
      for(const key of ['uid','id','slot','level','locked']) assert.equal(got[key],original[key]);
    }
  });
  await regression('summary is persisted and replayed with current pets; legacy receipts still replay',async()=>{
    const p=player([pet(1,2),pet(2,2),expPet(3,6,cap),expPet(4,5,10)]);
    p.items[36]=0;
    const params=intent('summary_replay'),h=load(p);
    const out=ack(await h.handler.handlePetAutoCompose(params,h.session,1));
    eq(out.summary,{composeCount:0,expMergeCount:0,blockedCostQualities:[2],blockedExpCap:true});
    eq(receipts.read(p,3314,params).summary,out.summary);
    p.petInfo.pets.push(pet(5,4));
    const restored=load(p),before=clone(p);
    const replay=ack(await restored.handler.handlePetAutoCompose(params,restored.session,2));
    assert.equal(replay.replayed,true); eq(replay.summary,out.summary);
    eq(replay.pets,p.petInfo.pets); eq(p,before); assert.equal(restored.state.saves,0);
    const legacy=player(),legacyParams=intent('legacy_receipt');
    receipts.record(legacy,3314,legacyParams,{result:0});
    const legacyHandler=load(legacy),legacyBefore=clone(legacy);
    const legacyOut=ack(await legacyHandler.handler.handlePetAutoCompose(legacyParams,legacyHandler.session,3));
    assert.equal(legacyOut.replayed,true); assert.equal(legacyOut.summary,undefined);
    eq(legacy,legacyBefore); assert.equal(legacyHandler.state.saves,0);
  });
  await regression('full48 board exhausts every eligible cascade with exact configured fees',async()=>{
    const p=player(Array.from({length:48},(_,i)=>pet(i+1,2,i))),h=load(p),before=p.items[36];
    const out=ack(await h.handler.handlePetAutoCompose({...intent('full_board'),quality:4},h.session,1));
    assert.equal(p.petInfo.pets.length,12);
    assert.ok(p.petInfo.pets.every(x=>tables.PetConfig[x.id].quality===4));
    assert.equal(new Set(p.petInfo.pets.map(x=>x.uid)).size,12);
    assert.ok(p.petInfo.pets.every(x=>x.slot>=0&&x.slot<48));
    assert.equal(before-p.items[36],24*costs2[0].count+12*costs3[0].count);
    eq(out.summary,{composeCount:36,expMergeCount:0,blockedCostQualities:[],blockedExpCap:false});
    assert.equal(h.state.saves,1);
  });
  await regression('higher target6/7/8 composes q5/q6/q7 to q6/q7/q9 and preserves q9/q10',async()=>{
    for(const quality of [5,6,7]) {
      const protectedPets=[pet(3,9),pet(4,10)];
      const p=player([pet(1,quality),pet(2,quality),...protectedPets]),h=load(p),before=p.items[36];
      const out=ack(await h.handler.handlePetAutoCompose({...intent('higher_'+quality),quality:quality+1},h.session,1));
      assert.equal(p.petInfo.pets.length,3);
      const resultQuality=quality===7?9:quality+1;
      assert.equal(p.petInfo.pets.filter(x=>x.uid!==3&&x.uid!==4&&tables.PetConfig[x.id].quality===resultQuality).length,1);
      assert.equal(before-p.items[36],tables.PetQualityConfig[quality].consumes[0].count);
      for(const original of protectedPets) {
        const got=p.petInfo.pets.find(x=>x.uid===original.uid); assert.ok(got);
        for(const key of ['uid','id','slot','level','locked']) assert.equal(got[key],original[key]);
      }
      eq(out.summary,{composeCount:1,expMergeCount:0,blockedCostQualities:[],blockedExpCap:false});
    }
  });
  await regression('target2 preserves normal pets while merging EXP',async()=>{
    const p=player([pet(1,2),pet(2,2),expPet(3,5,1),expPet(4,4,1)]),h=load(p),before=p.items[36];
    const out=ack(await h.handler.handlePetAutoCompose({...intent('target2_exp'),quality:2},h.session,1));
    assert.equal(p.petInfo.pets.length,3);
    for(const uid of [1,2]) assert.ok(p.petInfo.pets.some(x=>x.uid===uid&&tables.PetConfig[x.id].quality===2));
    assert.equal(p.petInfo.pets.find(x=>x.uid===3).level,2);assert.equal(p.items[36],before);
    eq(out.summary,{composeCount:0,expMergeCount:1,blockedCostQualities:[],blockedExpCap:false});
  });
  await regression('target10 applies q9 success or retain-primary failure once with protections and receipt',async()=>{
    for(const rng of [0,0.999999]) {
      const protectedPets=[pet(3,9,2,{level:2}),pet(4,9,3,{locked:1}),pet(5,9,-1),pet(6,9,5),pet(7,10,6)];
      const p=player([pet(1,9),pet(2,9),...protectedPets]);
      p.other_attr_info.petSoulInfo={petSouls:[{id:1,petUid:6}]};
      const h=load(p,'ok',rng),before=p.items[36],params={...intent('q9_'+rng),quality:10};
      const out=ack(await h.handler.handlePetAutoCompose(params,h.session,1));
      assert.equal(out.result,0);assert.equal(p.petInfo.pets.length,6);
      assert.equal(before-p.items[36],tables.PetQualityConfig[9].consumes[0].count);
      if(rng===0) {
        assert.ok(!p.petInfo.pets.some(x=>x.uid===1||x.uid===2));
        assert.equal(p.petInfo.pets.filter(x=>tables.PetConfig[x.id].quality===10).length,2);
      } else {
        assert.ok(!p.petInfo.pets.some(x=>x.uid===1));
        assert.equal(p.petInfo.pets.find(x=>x.uid===2).id,ids(9)[0]);
      }
      for(const original of protectedPets) {
        const got=p.petInfo.pets.find(x=>x.uid===original.uid);assert.ok(got);
        for(const key of ['uid','id','slot','level','locked'])assert.equal(got[key],original[key]);
      }
      eq(out.summary,{composeCount:1,expMergeCount:0,blockedCostQualities:[],blockedExpCap:false});
      eq(receipts.read(p,3314,params).summary,out.summary);
      const snapshot=clone(p);assert.equal(ack(await h.handler.handlePetAutoCompose(params,h.session,2)).replayed,true);
      eq(p,snapshot);assert.equal(h.state.saves,1);
    }
  });
  await regression('hatch8 bounded cycle prefers24 then25 and replay never duplicates eggs',async()=>{
    const p=player([]);p.items[24]=5;p.items[25]=20;
    const h=load(p),params={...intent('hatch8'),quality:2,openEggs:true};
    const out=ack(await h.handler.handlePetAutoCompose(params,h.session,1));
    assert.equal(out.summary.hatchedCount,8);assert.equal(p.items[24]||0,0);assert.equal(p.items[25],17);
    assert.equal(out.summary.canContinue,true);assert.equal(out.summary.stopReason,'BATCH_LIMIT');assert.equal(p.petInfo.pets.length+out.summary.expMergeCount,8);
    assert.ok(out.timeRecords);assert.equal(h.state.saves,1);
    const before=clone(p);assert.equal(ack(await h.handler.handlePetAutoCompose(params,h.session,2)).replayed,true);eq(p,before);
    assert.equal(ack(await h.handler.handlePetAutoCompose({...params,openEggs:false},h.session,3)).code,'FEATURE_REQUEST_CONFLICT');
  });
  await regression('hatching merges until owned stock exhausted and full protected board consumes none',async()=>{
    const p=player([]);p.items[25]=3;const h=load(p);
    const out=ack(await h.handler.handlePetAutoCompose({...intent('stock3'),quality:4,openEggs:true},h.session,1));
    assert.equal(out.summary.hatchedCount,3);assert.equal(p.items[25]||0,0);assert.equal(out.summary.canContinue,false);assert.ok(out.summary.composeCount+out.summary.expMergeCount>0);
    const full=player(Array.from({length:48},(_,i)=>pet(i+1,2,i,{locked:1})));full.items[24]=5;full.items[25]=20;
    const fh=load(full);const fo=ack(await fh.handler.handlePetAutoCompose({...intent('full_locked'),openEggs:true},fh.session,1));
    assert.equal(fo.summary.hatchedCount,0);assert.equal(fo.summary.stopReason,'BOARD_FULL');assert.equal(fo.summary.canContinue,false);
    assert.equal(full.items[24],5);assert.equal(full.items[25],20);assert.equal(full.petInfo.pets.length,48);
  });
  await regression('hatch faults never publish and invalid openEggs cannot mutate',async()=>{
    for(const openEggs of ['true',1,{},[]]) {const p=player(),h=load(p),before=clone(p);assert.notEqual(ack(await h.handler.handlePetAutoCompose({...intent('badbool'),openEggs},h.session,1)).result,0);eq(p,before);assert.equal(h.state.saves,0);}
    for(const mode of ['null','throw','postcommit']) {
      const p=player([]);p.items[25]=10;const before=clone(p),h=load(p,mode),params={...intent('hatchfault_'+mode),openEggs:true};
      await assert.rejects(h.handler.handlePetAutoCompose(params,h.session,1));eq(p,before);assert.equal(h.state.invalidations,1);
      if(mode==='postcommit'){const restored=h.state.durable,rh=load(restored),snapshot=clone(restored);assert.equal(ack(await rh.handler.handlePetAutoCompose(params,rh.session,2)).replayed,true);eq(restored,snapshot);assert.equal(rh.state.saves,0);}
    }
  });
  await regression('continuous hatch settles earned free egg and returns authoritative recovery clock',async()=>{
    const p=player([]),start=Date.now()-6*60*60*1000-1000;
    p.petInfo.timeRecords[24]=start;const h=load(p);
    const out=ack(await h.handler.handlePetAutoCompose({...intent('recovery_egg'),quality:2,openEggs:true},h.session,1));
    assert.equal(out.summary.hatchedCount,1);assert.equal(out.summary.canContinue,false);assert.equal(p.items[24]||0,0);
    assert.equal(out.timeRecords[24],start+6*60*60*1000);
    assert.equal(p.petInfo.timeRecords[24],out.timeRecords[24]);
  });
  assert.equal(networkAttempts,0);
  console.log(JSON.stringify({passed,regressionFailures,qualityFixture:q,checks:passed.length,productionWrites:0,networkAttempts},null,2));
  assert.equal(regressionFailures.length,0,'auto-compose omission regressions failed');
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
