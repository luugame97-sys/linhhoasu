'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const app=process.env.FEATURE_APP||path.resolve(__dirname,'..');
const game=process.env.FEATURE_GAME||path.resolve(app,'../../webgame/game');
const main=fs.readFileSync(process.env.FEATURE_MAIN||path.join(game,'js/main.min_a6195824.js'),'utf8');
const patch=fs.readFileSync(process.env.RANGED_PATCH||path.join(game,'js/lhs-ranged-action-v1.js'),'utf8');
const acorn=require(process.env.FEATURE_ACORN||path.join(app,'node_modules/acorn'));
let network=0;const deny=()=>{network++;throw Error('TEST_NETWORK_DENIED');};require('net').Socket.prototype.connect=deny;global.fetch=deny;
for(const n of ['http','https']){require(n).get=deny;require(n).request=deny;}
const log=require.resolve(path.join(app,'src/logger'));require.cache[log]={id:log,filename:log,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const config=require(path.join(app,'src/services/ConfigService')),cfg=config.loadAllTables();
function source(marker,from=0){const at=main.indexOf(marker,from);assert(at>=0,marker);let n=acorn.parseExpressionAt(main,at+marker.indexOf('function'),{ecmaVersion:2022});if(n.type==='SequenceExpression')n=n.expressions[0];return main.slice(n.start,n.end);}
const remoteAt=main.indexOf('i(jXe,vXe=wt)'),fxAt=main.indexOf('b$e=ZJe.prototype');
const remoteCode=Object.fromEntries(['Init','playHitEff','OnUpdate','OnExit'].map(k=>[k,source('.'+k+'=function',remoteAt)]));
const fxCode=Object.fromEntries(['GetScale','CreateData','createMapEff','CacheData','PlayBecastEff','Update'].map(k=>[k,source('.'+k+'=function',fxAt)]));
const clone=x=>JSON.parse(JSON.stringify(x));
function harness(appearance,effect,options={}) {
 let time=0,id=0,callbacks=[],clockJobs=[],errors=[],warn=[],hpChanges=[],hurtCount=0,completion=null,cancelled=false;
 function later(fn,delay,owner){const job={id:++id,due:time+Math.max(0,delay||0),fn,owner};clockJobs.push(job);return job.id;}
 function remove(owner){clockJobs=clockJobs.filter(j=>j.owner!==owner);}
 const timer={doTimer:(delay,_c,fn,owner)=>later(()=>fn.call(owner),delay,owner),removeAll:remove};
 const parent={addChild(mc){mc.parent=this;},addChildAt(mc){mc.parent=this;},removeChild(mc){mc.parent=null;}};
 const body={canPlayAnim:!options.loading,_speed:options.speed||1,_lhsRoleLoadSeq:1,setHitCallBack(){},tuiModel:{skeletonData:{findAnimation:()=>options.missingAnim?null:{duration:options.duration??.7}}}};
 if(options.loading)body.tuiModel.skeletonData=null;
 const actor={x:0,y:0,parent,m_Info:{modeSpeed:options.speed||1},m_Model:{mHeroBody:body},GetInfo:()=>({isPlaySoundEff:false}),GetHandle:()=> 'actor',
  getFlyOutGlobalPos:()=>({x:0,y:0}),UpdateActionName(name,loop,cb){this.m_Model.curAnimState={name,loop};if(cb){callbacks.push(cb);if(!options.loseCallback&&!options.loading)later(()=>{cb();if(options.doubleCallback)cb();},(options.duration??.7)*1000/(options.speed||1),'anim');}}};
 let hitPoints=10000;const info={getAtt:()=>hitPoints,setAtt(_t,value){hpChanges.push({time,value,delta:value-hitPoints});hitPoints=value;}};
 const target={x:240,y:0,mAI:{UpdateBlood(){}},GetInfo:()=>info,GetHandle:()=> 'target',getBecastGlobalPos:()=>({x:240,y:0}),getBecastPosLocal:()=>({x:0,y:-50}),...parent};
 const entities={actor,target};class CommonRaid{constructor(){this.fightActionList={actor:{}};}GetEntity(id){return entities[id];}GetEnitytFSM(){return{OnHurt(){hurtCount++;}};}removeEntityAction(id){const old=this.fightActionList[id];this.fightActionList[id]=null;return old;}Clear(){}OnExit(){}}
 const raid=new CommonRaid();
 const ctx=vm.createContext({console:{warn:x=>warn.push(x),error:x=>errors.push(x)},performance:{now:()=>time},document:{hidden:false,addEventListener(_n,fn){this.visibility=fn;}},
  x:{SEC_MILLI_PER_FRAME:1000/30},y:{ins:()=>timer},yht:{1:['m_stand_1']},MK:{Center:2},Wq:{getFlyEffHitType:t=>t||2},Ft:{Hp:1},
  yK:{IDLE_MAP_ROLE_SCALE:1},Iu:{Type4:4,Anim_Move:2,Normal:1},F:{removeTweens(){}},v8:{TopEffLayer:1},
  nc:{removeFromParent(mc){if(mc&&mc.parent)mc.parent.removeChild(mc);}},Fq:{AddBattleEntity(mc){parent.addChild(mc);}},
  RES:{hasRes:()=>true},rc:{getDistance:(x,y,a,b)=>Math.hypot(x-a,y-b),getAngle:x=>x,getRadian2:()=>0,TEMP_POS:{},Lerp(x,y,a,b,p,out){out.x=x+(a-x)*p;out.y=y+(b-y)*p;}},
  setTimeout:(fn,ms)=>later(fn,ms,'timeout'),clearTimeout:cancelId=>{clockJobs=clockJobs.filter(j=>j.id!==cancelId);},Promise,
  Ad:{createAsyncSpine(file){if(options.failFx)throw Error('INJECTED_FX_FAILURE');return{file,setTimeScale(){},scaleX:1,scaleY:1,setAnimation(_t,_n,loop){if(options.failFxAnimation)throw Error('INJECTED_FX_ANIM_FAILURE');let done;const promise=new Promise(r=>done=r);this.finish=done;return{waitPlayEnd:()=>promise};},...parent};}},bK:class{}});
 class Base {Init(context){this.mContext=context;}}
 class Remote extends Base {}
 class Map {constructor(){this.m_PlayMvList=[];this.m_MvList=[];this.m_LastTime=0;}StartUpdate(){} }
 for(const [key,code]of Object.entries(remoteCode))Remote.prototype[key]=vm.runInContext('('+code+')',ctx);
 for(const [key,code]of Object.entries(fxCode))Map.prototype[key]=vm.runInContext('('+code+')',ctx);
 ctx.vXe={prototype:Base.prototype};
 const atk={PlayHpEff:vm.runInContext('('+source('qXe.PlayHpEff=function')+')',ctx),playRoleCritSoundEffect(){},showDamageText(){}};
 ctx.qXe=ctx.r8=atk;
 const effects=new Map(),manager={Config:cfg,RaidMgr:{mMapRaid:raid},MapEffMgr:effects,SoundManager:{PlayEffect(){}},BoxLayerModel:{isInState:n=>n===5}};
 ctx.Y=manager;ctx.GlobalManager=manager;ctx.MapEffMgr=Map;ctx.RemoteAtkAction=Remote;ctx.AtkAction=atk;ctx.VariableType=ctx.Ft;ctx.BattleCtrl=ctx.Wq;ctx.Const=ctx.x;
 ctx.GameMap=ctx.Fq;ctx.BattleViewLayerEnum=ctx.v8;ctx.DisplayUtils=ctx.nc;ctx.CommonMapRaid=CommonRaid;ctx.window=ctx;
 if(options.patched!==false)vm.runInContext(patch,ctx);
 if(options.patched!==false)assert(ctx.LhsRangedActionV1.installed);
 const action=new Remote();Object.assign(action,{atkId:'actor',defId:'target',damageIndex:0,isSelf:false,atkData:{aprCfg:appearance,effCfg:effect,stepDamage:[{isCrit:effect.onlyCrit===1,damage:-100}]}});
 action.Init(raid);
 function advance(to){while(time<to){let end=Math.min(to,time+20),job;
  while((job=clockJobs.filter(j=>j.due<=end).sort((a,b)=>a.due-b.due)[0])){clockJobs=clockJobs.filter(j=>j!==job);time=job.due;try{job.fn();}catch(e){errors.push(e.message);}}
  time=end;try{effects.Update(time);}catch(e){errors.push(e.message);}
  if(!cancelled&&completion===null){let done;try{done=action.OnUpdate(20);}catch(e){errors.push(e.message);}if(done){completion=time;action.OnExit();}}
 }}
 function snapshot(){return{completion,hpChanges:clone(hpChanges),hurtCount,warnings:warn.slice(),errors:errors.slice(),pending:clockJobs.length,activeFx:effects.m_PlayMvList.length,counts:clone(ctx.LhsRangedActionV1?.counts||{})};}
 return{ctx,action,actor,target,body,effects,raid,entities,callbacks,advance,snapshot,cancel(){cancelled=true;action.OnExit();},visible(value){ctx.document.hidden=!value;if(ctx.document.visibility)ctx.document.visibility();},setTime(value){time=value;}};
}
async function run(){
 const counts={appearances:0,matrix:0,checks:0};const pass=()=>counts.checks++;
 const weapons=Object.values(cfg.AppearanceConfig).filter(a=>a.wuqiEffectId>0&&cfg.EffectConfig[a.wuqiEffectId]?.[a.wuqiType]?.[1]?.atkType===1);counts.appearances=weapons.length;
 for(const a of weapons)for(const effect of Object.values(cfg.EffectConfig[a.wuqiEffectId][a.wuqiType]).filter(e=>e.onlyCrit===0||e.onlyCrit===1))for(const speed of [1,2]){
  const baseline=harness(a,effect,{speed,patched:false,duration:1.2}),fixed=harness(a,effect,{speed,duration:1.2});baseline.advance(2000);fixed.advance(2000);
  const old=baseline.snapshot(),next=fixed.snapshot();assert.equal(next.errors.length,0);assert.equal(next.hpChanges.length,1);assert.equal(next.hpChanges[0].delta,old.hpChanges[0].delta);
  assert(Math.abs(next.hpChanges[0].time-old.hpChanges[0].time)<=25);assert(Math.abs(next.completion-old.completion)<=40);assert.equal(next.warnings.length,0);counts.matrix++;
 }
 pass();
 const a=cfg.AppearanceConfig[28041],effect=cfg.EffectConfig[2804][2][1];
 for(const opts of [{loseCallback:true},{failFx:true},{failFxAnimation:true},{doubleCallback:true},{missingAnim:true},{duration:6,loseCallback:true}]){
  const h=harness(a,effect,opts);h.advance(opts.duration?6600:1800);const r=h.snapshot();assert.equal(r.hpChanges.length,1);assert(r.completion!==null);assert.equal(r.errors.length,0);if(opts.duration)assert(r.completion>=6000);pass();
 }
 for(const when of [0,100,450]){const h=harness(a,effect);h.advance(when);const count=h.snapshot().hpChanges.length;h.cancel();h.callbacks.forEach(f=>f());h.advance(2500);assert.equal(h.snapshot().hpChanges.length,count);assert.equal(h.snapshot().errors.length,0);pass();}
 for(const kind of ['actor','target','raid']){const h=harness(a,effect);h.advance(100);if(kind==='raid')h.ctx.GlobalManager.RaidMgr.mMapRaid={GetEntity:()=>null};else h.entities[kind]={};h.advance(1500);assert.equal(h.snapshot().hpChanges.length,0);assert.equal(h.snapshot().errors.length,0);pass();}
 {const h=harness(a,effect);h.advance(100);h.visible(false);h.advance(2100);assert.equal(h.snapshot().hpChanges.length,0);h.visible(true);h.advance(3200);assert.equal(h.snapshot().hpChanges.length,1);assert(h.snapshot().completion>=2500);pass();}
 {const h=harness(a,effect,{loading:true,loseCallback:true});h.advance(500);h.body.canPlayAnim=true;h.body.tuiModel.skeletonData={findAnimation:()=>({duration:.7})};h.advance(1800);assert.equal(h.snapshot().hpChanges.length,1);assert(h.snapshot().completion>=1200&&h.snapshot().completion<1700);pass();}
 {const h=harness(a,effect,{loading:true,loseCallback:true});h.advance(15200);assert.equal(h.snapshot().hpChanges.length,1);assert(h.snapshot().completion>=15000);pass();}
 {const h=harness(a,effect);h.advance(100);h.body._lhsRoleLoadSeq++;h.actor.m_Model.curAnimState={name:'new_skin_animation',loop:true};h.callbacks[0]();assert.equal(h.actor.m_Model.curAnimState.name,'new_skin_animation');h.advance(1600);assert.equal(h.snapshot().hpChanges.length,1);pass();}
 {const h=harness(a,effect);h.cancel();const holder=h.effects.CreateData(null,'fx_old');holder.bindHandle='target';holder.animName='a_1';holder.catchTime=1;const old=holder.mc;h.effects.Update(1);assert(old.finish);const callback=old.finish;
  assert.equal(h.effects.m_PlayMvList.length,0);const next=h.effects.CreateData(null,'fx_new');assert.equal(holder,next);h.target.addChild(next.mc);const current=next.mc;callback();await Promise.resolve();assert.equal(current.parent,h.target);assert.equal(h.effects.m_PlayMvList[0].mc,current);pass();}
 {const h=harness(a,effect);const init=h.ctx.RemoteAtkAction.prototype.Init;vm.runInContext(patch,h.ctx);assert.equal(h.ctx.RemoteAtkAction.prototype.Init,init);pass();}
 // A slow but advancing renderer must not be truncated by wall-clock duration.
 {const h=harness(a,effect,{loseCallback:true});const track={animation:{name:effect.atkAnim},trackTime:0};h.body.tuiModel.state={getCurrent:()=>track};
  for(let t=20;t<=1800;t+=20){track.trackTime=t/4000;h.advance(t);}assert.equal(h.snapshot().completion,null);h.callbacks[0]();h.advance(1900);assert(h.snapshot().completion>=1800);pass();}
 // A stalled renderer does terminate after a bounded no-progress budget.
 {const h=harness(a,effect,{loseCallback:true});h.body.tuiModel.state={getCurrent:()=>({animation:{name:effect.atkAnim},trackTime:0})};h.advance(2400);assert(h.snapshot().completion<2400);assert.equal(h.snapshot().hpChanges.length,1);pass();}
 // Native caller reuses an action: callbacks from the prior Init are inert.
 {const h=harness(a,effect,{loseCallback:true});const old=h.callbacks[0];h.advance(100);h.action.Init(h.raid);old();assert.equal(h.action.isEnd,false);h.advance(2000);assert.equal(h.snapshot().hpChanges.length,1);pass();}
 // Skin/model disappears after Init; no exception in completion cleanup.
 {const h=harness(a,effect);h.actor.m_Model.mHeroBody=null;h.callbacks[0]();h.advance(1700);assert.equal(h.snapshot().errors.length,0);pass();}
 for(const method of ['removeEntityAction','Clear','OnExit']){const h=harness(a,effect);h.advance(450);h.raid[method]('actor');h.callbacks.forEach(cb=>cb());h.advance(2000);assert.equal(h.snapshot().hpChanges.length,0);assert.equal(h.snapshot().activeFx,0);pass();}
 {const h=harness(a,effect);h.advance(100);h.raid.fightActionList.actor={};h.advance(1400);assert.equal(h.snapshot().hpChanges.length,0);pass();}
 assert.equal(network,0);assert.equal(counts.matrix,468);
 const result={result:'PASS',counts,productionWrites:0,networkAttempts:network,patchHash:crypto.createHash('sha256').update(patch).digest('hex')};
 if(process.env.RANGED_TEST_OUTPUT)fs.writeFileSync(process.env.RANGED_TEST_OUTPUT,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={harness,run};
