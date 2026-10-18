'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const TASK=path.resolve(__dirname,'../temp/mount_star_fix_20261017'),CAND=TASK+'/candidate',pre=JSON.parse(fs.readFileSync(TASK+'/preflight.json','utf8'));
const config={get:n=>pre.config[n]},{create}=require(CAND+'/src/services/MountStarProgressService');
const clone=x=>JSON.parse(JSON.stringify(x)),equal=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));
let checks=0;function test(name,fn){fn();checks++;}
const domain=create({config,randomInt:()=>0,clock:()=>100});
const skill=(id=106,quality=6,level=1)=>({id,quality,level});
const mount=(uid=1,star=1)=>({id:22506,uid,quality:7,level:92,star,lock:0,skills:[skill(),skill(152,3),skill(154,3),skill(104,6)]});
const helpers={normalizeMountSkills:clone,buildMountAttrs:()=>({51:1}),ensureMountInfo:p=>p.swordInfo,addRewardToPlayer:(p,id,count)=>{p.items[id]=(p.items[id]||0)+count;},buildMountRewardResponse:items=>({items,equips:[],gems:[]}),buildMountRewardSync:(p,items)=>({tag:1202,msgUid:0,data:{items,changed:items.map(i=>({id:i.id,count:p.items[i.id]}))}}),buildMountInfoUpdatePayload:clone};
for(const star of [0,1,2,5,23,39,40])test('recovery '+star,()=>{
 const m=mount(1,star),info={data:[m]},before=clone(m.skills),r=domain.repairInfo(info,'fixture');
 const target=Math.min(40,4+Math.max(0,star-1));assert.equal(domain.total(m.skills),target);for(let i=0;i<4;i++){assert.equal(m.skills[i].id,before[i].id);assert.equal(m.skills[i].quality,before[i].quality);assert(m.skills[i].level>=1&&m.skills[i].level<=10);}
 const snapshot=clone(info);assert.equal(domain.repairInfo(info,'fixture').changed,0);equal(info,snapshot);
 const alternate={data:[mount(1,star)]};domain.repairInfo(alternate,'fixture');equal(alternate,info);assert.equal(r.added,target-4);
});
test('preserve higher skills',()=>{const m=mount(1,5);m.skills.forEach(s=>s.level=7);const old=clone(m);domain.repairInfo({data:[m]},'x');equal(m,old);});
for(const[q,initial]of Object.entries(pre.config.SwordBaseConfig.passiveSkillInitialCount))test('recovery quality'+q,()=>{const m=mount(1,20);m.quality=Number(q);m.skills=m.skills.slice(0,initial);domain.repairInfo({data:[m]},'x');assert.equal(domain.total(m.skills),Math.min(40,initial+19,initial*10));});
for(const star of [0,1,5,23,39])for(const matStar of [0,1,5,39,40])test('progress '+star+':'+matStar,()=>{const m=mount(1,star),mat=mount(2,matStar);domain.repairInfo({data:[m]},'x');const sum=domain.total(m.skills);domain.progress(m,mat,helpers);assert.equal(m.star,Math.min(40,star+matStar+1));assert.equal(domain.total(m.skills),Math.min(40,sum+matStar+1));assert(m.skills.every(s=>s.level<=10));equal(m.skills,m.passiveSkills);});
test('add missing slots within gain budget',()=>{const m=mount(1,0);m.skills=m.skills.slice(0,1);domain.progress(m,mount(2,0),helpers);assert.equal(domain.total(m.skills),2);assert.equal(m.skills.length,2);});
test('max skills no overflow',()=>{const m=mount(1,30);m.skills.forEach(s=>s.level=10);domain.progress(m,mount(2,1),helpers);assert.equal(domain.total(m.skills),40);});
test('skill quality config failure',()=>{const m=mount();m.skills[0].quality=999;assert.throws(()=>domain.progress(m,mount(2),helpers),/CONFIG/);});
// Execute the real transaction implementation with exact-role lock/receipt code and RAM-only DB.
function moduleFrom(file,imports){const module={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require:n=>n in imports?imports[n]:require(n),console,Buffer,Date,Math,JSON,Object,Number,Array,Map,Set,Error,Promise});return module.exports;}
const common=path.resolve(__dirname,'../temp/shop_essence_max_20261017/live/src/services');
const mutation=moduleFrom(common+'/PlayerMutationService.js',{}),receipts=moduleFrom(common+'/FeatureReceiptService.js',{});
let saved=0,mode='normal',store;
function fresh(){return{userId:'RAM_ROLE',playerId:'RAM_ID',level:200,swordInfo:{data:[mount(1,5),mount(2,1)],equippedUid:1},items:{20:100},currencies:{diamond:1000},other_attr_info:{}};}
let service;
const collection={updateOne:async(filter,update)=>{if(JSON.stringify(store.swordInfo)!==JSON.stringify(filter.swordInfo.$eq))return{matchedCount:0};Object.assign(store,clone(update.$set));return{matchedCount:1};}};
const players={drainPendingSaves:async()=>{},loadPlayer:async()=>service.recoverLoaded(clone(store),collection),savePlayer:async(uid,p,options)=>{saved++;assert.equal(options.onlyFields.length,4);for(const key of options.mountCAS.fields)if(JSON.stringify(store[key])!==JSON.stringify(options.mountCAS.expected[key]))return null;
 if(mode==='fail')throw Error('fixture-fail');if(mode==='conflict')return null;for(const k of options.onlyFields)store[k]=clone(p[k]);if(mode==='unknown')throw Error('fixture-commit-unknown');return p;}};
service=moduleFrom(CAND+'/src/services/MountStarProgressService.js',{'./ConfigService':config,'./PlayerMutationService':mutation,'./FeatureReceiptService':receipts,'./PlayerService':players,'./RuntimeBus':{getWsServer:()=>({invalidatePlayerForMutation(){}})},'./CurrencySync':{buildClientItemList:p=>Object.entries(p.items).map(([id,count])=>({id:Number(id),count}))}});
const request=(suffix='a')=>({targetUid:1,matUid:2,requestId:Date.now()+'-fixture0000000'+suffix});
const reply=(r,uid)=>(Array.isArray(r)?r:[r]).find(p=>p.tag===3205&&p.msgUid===uid).data;
async function transactionTests(){
 store=fresh();let session={userId:store.userId,player:clone(store)},p=request();
 const results=await Promise.all([service.swallow(p,session,7,helpers),service.swallow(p,session,8,helpers)]);
 assert.equal(saved,1);assert.equal(store.swordInfo.data.length,1);assert.equal(store.swordInfo.data[0].star,7);assert.equal(domain.total(store.swordInfo.data[0].skills),10);assert.equal(store.items[20],2500);assert.equal(reply(results[1],8).replay,true);checks++;
 for(const change of [{matUid:1},{targetUid:999},{matUid:999},{matUid:0},{matUid:2.5}]){store=fresh();session={userId:store.userId,player:clone(store)};const before=clone(store);store.swordInfo.data[0].star=1;before.swordInfo.data[0].star=1;const r=await service.swallow({...request(),...change},session,7,helpers);assert.equal(reply(r,7).result,-1);equal(store,before);checks++;}
 for(const mutate of [s=>s.swordInfo.data[1].lock=1,s=>s.swordInfo.equippedUid=2,s=>s.swordInfo.data[1].id=22501,s=>s.swordInfo.data[0].star=40]){store=fresh();store.swordInfo.data[0].star=1;mutate(store);session={userId:store.userId,player:clone(store)};const r=await service.swallow(request(),session,7,helpers);assert.equal(reply(r,7).result,-1);checks++;}
 for(const state of ['fail','conflict','unknown']){store=fresh();store.swordInfo.data[0].star=1;mode=state;session={userId:store.userId,player:clone(store)};p=request(state);await assert.rejects(service.swallow(p,session,7,helpers));assert.equal(session.player,null);if(state!=='unknown'){assert.equal(store.items[20],100);assert.equal(store.swordInfo.data.length,2);}else{mode='normal';const n=clone(store),r=await service.swallow(p,{userId:store.userId,player:clone(store)},7,helpers);assert.equal(reply(r,7).replay,true);equal(store,n);}checks++;}mode='normal';
 store=fresh();const race=clone(store);race.swordInfo.data[0].star=7;const badCollection={updateOne:async()=>({matchedCount:0})};await assert.rejects(service.recoverLoaded(race,badCollection),/CAS/);assert.equal(domain.total(race.swordInfo.data[0].skills),4);checks++;
}
function clientTests(){
 class Model{constructor(){this.calls=[];this._mountInfo={data:[]};}SendUpgrade(){}Rpc(...a){this.calls.push(a);}}
 const model=new Model(),events=[],root={W:{MountModel:model},UserInfo:{ServerID:1001,UserID:'RAM'},crypto:crypto.webcrypto,MessageCenter:{ins:()=>({dispatch:(...v)=>events.push(v)})},UserTips:{ins:()=>({showTips(){}})},MessageDef:{},setTimeout(){}};
 vm.runInNewContext(fs.readFileSync(CAND+'/web/js/lhs-mount-fix-v1.js','utf8'),{window:root,Date,Math,Number,Array,Object,String,Uint8Array});assert(root.LhsMountStarFix.installed);checks++;
 let success=0;model.Rpc(3205,{targetUid:1,matUid:2},()=>success++);const first=model.calls[0];assert(first[1].requestId);assert.equal(model.Rpc(3205,{targetUid:1,matUid:2},()=>success++),false);checks++;
 first[3]({timeout:true});model.Rpc(3205,{targetUid:1,matUid:2},()=>success++);assert.equal(model.calls[1][1].requestId,first[1].requestId);model.calls[1][2]({result:-1});assert.equal(success,0);checks++;
 model.Rpc(3205,{targetUid:1,matUid:2},()=>success++);model.calls[2][2]({result:0,replay:true,data:{uid:1}});assert.equal(success,0);checks++;
 model.Rpc(3205,{targetUid:1,matUid:3},()=>success++);model.calls[3][2]({result:0,data:{uid:1}});assert.equal(success,1);checks++;
}
(async()=>{await transactionTests();clientTests();let repairProfiles=0,repairMounts=0;
 const audit=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../temp/mount_skill_star_audit_20261017/live.json'),'utf8'));const info={data:clone(audit.player.mounts)};const recovered=domain.repairInfo(info,'snapshot');assert(recovered.changed>=3);repairMounts=recovered.changed;
 const p=info.data.find(m=>m.uid===100002);assert.equal(domain.total(p.skills),8);checks++;
 const report={status:'PASS',checks,fixtureSaveAttempts:saved,productionWrites:0,networkCalls:0,recoveredSnapshotMounts:repairMounts,legacyEquippedSum:p.skills.reduce((n,s)=>n+s.level,0),futureServerScope:'unconditional shared source; no server allowlist'};
 fs.writeFileSync(TASK+'/tests.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));})().catch(e=>{console.error(e.stack);process.exitCode=1;});
