'use strict';
// Diagnosis only: shipped action code, real configs, virtual clock, no game/DB writes.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const wb=path.resolve(__dirname,'..'),app=path.join(wb,'../linhhoasu/lhs/newServer'),game=path.join(wb,'../linhhoasu/webgame/game');
let networkAttempts=0;
const deny=()=>{networkAttempts++;throw Error('AUDIT_NETWORK_DENIED');};
require('net').Socket.prototype.connect=deny;global.fetch=deny;
for(const name of ['http','https']){require(name).request=deny;require(name).get=deny;}
const logger=require.resolve(path.join(app,'src/logger'));
require.cache[logger]={id:logger,filename:logger,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const config=require(path.join(app,'src/services/ConfigService')),tables=config.loadAllTables();
const main=fs.readFileSync(path.join(game,'js/main.min_a6195824.js'),'utf8'),index=fs.readFileSync(path.join(game,'index.html'),'utf8');
const acorn=require(path.join(app,'node_modules/acorn'));
function source(marker,from=0,text=main){const at=text.indexOf(marker,from);assert(at>=0,marker);let n=acorn.parseExpressionAt(text,at+marker.indexOf('function'),{ecmaVersion:2022});if(n.type==='SequenceExpression')n=n.expressions[0];assert.equal(n.type,'FunctionExpression');return text.slice(n.start,n.end);}
const remoteAt=main.indexOf('i(jXe,vXe=wt)'),meleeAt=main.indexOf('i(qXe,fXe=wt)');
assert(remoteAt>0&&meleeAt>0);
const remoteSource=Object.fromEntries(['Init','playHitEff','OnUpdate','OnExit'].map(k=>[k,source('.'+k+'=function',remoteAt)]));
const meleeSource=Object.fromEntries(['Init','playHitEff','OnUpdate','OnExit'].map(k=>[k,source('.'+k+'=function',meleeAt)]));
const clone=x=>JSON.parse(JSON.stringify(x));
function harness(appearance,effect,options={}){
 let now=0,nextId=0,completionMs=null,frameErrors=[],hpEvents=0,hitEvents=0,flyEvents=0;
 const pending=new Map(),warnings=[];
 function later(fn,delay,owner){const id=++nextId;pending.set(id,{id,fn,due:now+Math.max(0,Number(delay)||0),owner});return id;}
 function cancelOwner(owner){for(const [id,job]of pending)if(job.owner===owner)pending.delete(id);}
 const timer={doTimer:(ms,count,fn,owner)=>later(()=>fn.call(owner),ms,owner),removeAll:cancelOwner};
 const body={canPlayAnim:options.loading!==true,setHitCallBack(){},tuiModel:{skeletonData:{findAnimation:()=>({duration:.7})}}};
 const attacker={x:0,y:0,parent:{},m_Info:{modeSpeed:options.speed||1},m_Model:{mHeroBody:body},GetInfo:()=>({}),getFlyOutGlobalPos:()=>({x:0,y:0}),
  UpdateActionName(name,loop,callback){if(callback&&!options.loseAnimationCallback)later(callback,700/(options.speed||1),'animation');}};
 const target={x:240,y:0,getBecastGlobalPos:()=>({x:240,y:0}),getBecastPosLocal:()=>({x:0,y:-50}),GetInfo:()=>null};
 const raid={GetEntity:id=>id==='actor'?attacker:target};
 const ctx=vm.createContext({vXe:{prototype:{Init(){}}},fXe:{prototype:{Init(){}}},Y:{Config:tables,RaidMgr:{mMapRaid:raid},
  BoxLayerModel:{isInState:n=>n===5},MapEffMgr:{createMapEff(){flyEvents++;if(options.throwOnFly)throw Error('INJECTED_FX_FAILURE');},PlayBecastEff(){hitEvents++;return{};}},SoundManager:{PlayEffect(){}}},
  x:{SEC_MILLI_PER_FRAME:1000/30},y:{ins:()=>timer},yht:{1:['m_stand']},MK:{Center:2},Wq:{getFlyEffHitType:t=>t||2},
  rc:{getDistance:(x,y,a,b)=>Math.hypot(x-a,y-b)},RES:{hasRes:()=>true},r8:{PlayHpEff(_d,_a,_t,_c,_self,_damage,delay){later(()=>hpEvents++,delay,'hp');},playRoleCritSoundEffect(){}},
  setTimeout:(fn,ms)=>later(fn,ms,'timeout'),clearTimeout:id=>pending.delete(id),console:{warn:x=>warnings.push(String(x)),error:x=>warnings.push(String(x))},document:{hidden:false}});
 class Remote{}
 class Melee{}
 for(const [k,code]of Object.entries(remoteSource))Remote.prototype[k]=vm.runInContext('('+code+')',ctx);
 for(const [k,code]of Object.entries(meleeSource))Melee.prototype[k]=vm.runInContext('('+code+')',ctx);
 ctx.qXe=ctx.r8;
 const window={RemoteAtkAction:Remote,AtkAction:Melee,GlobalManager:ctx.Y};ctx.window=window;
 if(options.guard!==false)vm.runInContext('('+source('var installLhsActionCompletionGuards = function',0,index)+')()',ctx);
 const action=new (options.melee?Melee:Remote)();Object.assign(action,{atkId:'actor',defId:'target',damageIndex:0,isSelf:false,atkData:{aprCfg:appearance,effCfg:effect,stepDamage:[{isCrit:effect.onlyCrit===1,damage:-100}]}});
 try{action.Init(raid);}catch(error){frameErrors.push({time:0,message:error.message,phase:'init'});}
 function advance(to){while(now<to){const end=Math.min(to,now+20);let job;while((job=[...pending.values()].filter(x=>x.due<=end).sort((a,b)=>a.due-b.due)[0])){pending.delete(job.id);now=job.due;try{job.fn();}catch(error){frameErrors.push({time:now,message:error.message,phase:'timer'});}}now=end;let done;try{done=action.OnUpdate(20);}catch(error){frameErrors.push({time:now,message:error.message,phase:'update'});}if(done&&completionMs===null)completionMs=now;}}
 function snapshot(){return{completionMs,isEnd:!!action.isEnd,isFlyEnd:!!action.isFlyEnd,hpEvents,hitEvents,flyEvents,warnings,errors:frameErrors,pendingTimers:pending.size};}
 return{advance,snapshot,action,pending,attacker};
}
const resourceIndex=JSON.parse(fs.readFileSync(path.join(wb,'temp/fashion_rods_audit_20260908/resource-index.json'),'utf8'));
const remoteWeapons=Object.values(tables.AppearanceConfig).filter(a=>a.wuqiEffectId>0&&tables.EffectConfig[a.wuqiEffectId]?.[a.wuqiType]?.[1]?.atkType===1);
const matrix=[],badConfigs=[],unregistered=[];
for(const appearance of remoteWeapons){const effects=Object.values(tables.EffectConfig[appearance.wuqiEffectId][appearance.wuqiType]);
 for(const effect of effects.filter(e=>e.onlyCrit===0||e.onlyCrit===1)){
  if(!effect.becastEff||!Array.isArray(effect.becastEff.files)||!effect.becastEff.files.length)badConfigs.push({appearanceId:appearance.id,key:effect.key});
  const names=[effect.flyImg?.file,...(effect.becastEff?.files||[])].filter(Boolean);
  for(const name of names)if(!resourceIndex[name+'_skel']&&!resourceIndex[name+'_json'])unregistered.push(name);
  for(const speed of [1,2]){const h=harness(appearance,effect,{speed});h.advance(2000);const result=h.snapshot();assert(result.completionMs!==null&&result.warnings.length===0&&result.errors.length===0,JSON.stringify({appearance:appearance.id,key:effect.key,result}));matrix.push({appearanceId:appearance.id,effectId:effect.id,key:effect.key,speed,completionMs:result.completionMs});}
 }
}
const example=tables.AppearanceConfig[28041],normal=tables.EffectConfig[2804][2][1];
const faultCases=[];
for(const [label,options,advance]of [['healthy',{},1000],['missing-animation-callback',{loseAnimationCallback:true},5100],['loading-missing-callback',{loseAnimationCallback:true,loading:true},15100],['projectile-create-throws',{throwOnFly:true},5100],['melee-missing-callback',{melee:true,loseAnimationCallback:true},1500]]){
 const h=harness(example,normal,options);h.advance(advance);faultCases.push({label,injected:label!=='healthy',...h.snapshot()});
}
assert.equal(faultCases.find(c=>c.label==='missing-animation-callback').completionMs,5000);
assert.equal(faultCases.find(c=>c.label==='loading-missing-callback').completionMs,15000);
assert.equal(faultCases.find(c=>c.label==='melee-missing-callback').completionMs,860);
// Real timer ownership bug: flight completion is owned by actor, not action.
const exited=harness(example,normal);exited.advance(450);const beforeExit=exited.snapshot();exited.action.OnExit();exited.advance(900);const afterExit=exited.snapshot();
assert.equal(beforeExit.hitEvents,0);assert.equal(afterExit.hitEvents,1);
// Real pooled-FX lifetime bug: a late waitPlayEnd callback uses a reused holder.
let completeOld;const wait=new Promise(resolve=>completeOld=resolve),removed=[];
const fx={mc:{setAnimation:()=>({waitPlayEnd:()=>wait})},bindHandle:'target',isInit:false,isLoop:false,isTargetBottom:false,animName:'a_1',catchTime:4000,ft:null};
const fxContext=vm.createContext({Y:{RaidMgr:{mMapRaid:{GetEntity:()=>({addChild(){}})}}},nc:{removeFromParent:obj=>removed.push(obj)},rc:{},Fq:{},v8:{}});
const mapFxAt=main.indexOf('b$e=ZJe.prototype');assert(mapFxAt>0);
const updateFx=vm.runInContext('('+source('b$e.Update=function',mapFxAt)+')',fxContext);
const fxMgr={m_LastTime:0,m_PlayMvList:[fx],CacheData(holder){holder.mc=null;}};
updateFx.call(fxMgr,1);updateFx.call(fxMgr,4001);const replacement={label:'new-unrelated-fx'};fx.mc=replacement;completeOld();
Promise.resolve().then(()=>{
 assert.equal(removed[0],replacement);
 const output={result:'PASS',at:new Date().toISOString(),mode:'DIAGNOSIS_ONLY',productionWrites:0,networkAttempts,
  sourceHashes:Object.fromEntries(['js/main.min_a6195824.js','index.html','js/lhs-fashion-gear-v1.js'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(game,p))).digest('hex')])),
  configTableHashes:Object.fromEntries(['FashionConfig','AppearanceConfig','EffectConfig'].map(n=>[n,crypto.createHash('sha256').update(JSON.stringify(tables[n])).digest('hex')])),
  catalog:{remoteWeaponAppearances:remoteWeapons.length,normalAndCritSpeedCases:matrix.length,badConfigs,unregisteredSkeletonKeys:[...new Set(unregistered)]},
  faultCases,timerOwnership:{afterExitHitStillRuns:afterExit.hitEvents>beforeExit.hitEvents},pooledEffect:{lateCallbackRemovedNewEffect:removed[0]===replacement},
  caveat:'Virtual scene with real native functions and config. Callback loss/loading/FX failure are injected; not a reproduction in a player browser. No specific skin or player incident identified.'};
 const out=path.join(wb,'temp/ranged_skin_stutter_20260908');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify(output,null,2)+'\n');
 console.log(JSON.stringify(output));
}).catch(error=>{console.error(error);process.exitCode=1;});
