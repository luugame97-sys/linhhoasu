'use strict';
// Reproduce production handlers on a copied role with storage and network isolated.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'../..');
const dir=path.join(root,'_ai_workbench/temp/oldtrek_fix_20261001');
const app=path.join(root,'linhhoasu/lhs/newServer');
const tables=require(path.join(app,'src/services/ConfigService')).decodeTables(fs.readFileSync(path.join(dir,'baseline/config.bin')));
const focused=JSON.parse(fs.readFileSync(path.join(dir,'focus.json'),'utf8')).found.flatMap(r=>r.rows)[0];
const copy=v=>JSON.parse(JSON.stringify(v));
const keyState=p=>({oldTrekInfo:p.other_attr_info?.oldTrekInfo,items:p.items,currencies:p.currencies});
function harness(mode='baseline',options={}){
  const loaded=new Map(),errors=[],casMisses=[],writes=[],logs=[];
  let stored=copy(focused),deferred=null;
  const logger={info(){},debug(){},warn:m=>logs.push(m),error:m=>logs.push(m)};
  const ps={
    async savePlayer(userId,player,opts){
      if(deferred){stored=copy(deferred);deferred=null;}
      if(opts?.oldTrekCAS){
        const actual=keyState(stored),miss=[];
        for(const [k,v]of Object.entries(opts.oldTrekCAS))if(JSON.stringify(actual[k])!==JSON.stringify(v))miss.push(k);
        if(miss.length){casMisses.push(miss);return null;}
      }
      stored=copy(player);writes.push(copy(player.other_attr_info.oldTrekInfo.sailInfo?.currentEvent));return player;
    },
    async drainPendingSaves(){if(deferred){stored=copy(deferred);deferred=null;}},
    async loadPlayer(){return copy(stored);},
  };
  function load(rel){
    if(loaded.has(rel))return loaded.get(rel);
    const candidate=path.join(dir,'candidate/server',rel), baseline=path.join(dir,'baseline/server',rel);
    const file=mode==='candidate'&&fs.existsSync(candidate)?candidate:baseline;
    const mod={exports:{}};loaded.set(rel,mod.exports);
    let src=fs.readFileSync(file,'utf8');
    if(rel==='src/handlers/old-trek.js')src=src.replace('} catch (error) {\n','} catch (error) {\n __auditErrors.push(error.stack);\n');
    const ctx={module:mod,exports:mod.exports,console,Buffer,Date,Math,JSON,Set,Map,Number,Promise,structuredClone,
      process:{env:{OLD_TREK_EVENT_ENGINE_ENABLED:'1'}},setTimeout,clearTimeout,__auditErrors:errors,
      require(name){
        if(name==='node:crypto')return crypto;
        if(name==='node:async_hooks')return require(name);
        const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(rel),name));
        if(resolved==='src/services/ConfigService')return{get:n=>tables[n]||{}};
        if(resolved==='src/services/PlayerService')return ps;
        if(resolved==='src/logger')return logger;
        if(resolved==='src/handlers/raid')return{addRewardToPlayer(p,id,n){p.items[id]=Number(p.items[id]||0)+n;}};
        if(resolved==='src/handlers/chat')return{buildSummary:p=>({name:p.name,dbid:p.playerId})};
        if(resolved.endsWith('.json'))return JSON.parse(fs.readFileSync(path.join(dir,'baseline/server',resolved),'utf8'));
        if(name.startsWith('.'))return load(resolved+'.js');
        throw Error('ISOLATED_DEPENDENCY_BLOCKED:'+name);
      }};
    vm.runInNewContext(src,ctx,{filename:file});loaded.set(rel,mod.exports);return mod.exports;
  }
  const handler=load('src/handlers/old-trek.js');
  const s={userId:focused.userId,player:copy(focused)};
  return{handler,s,errors,casMisses,writes,logs,ps,
    stored:()=>copy(stored),queueDeferred(value){deferred=copy(value);},setStored(p){stored=copy(p);}};
}
async function run(mode){
  const records=[];
  for(const scenario of ['terminal117_clean','terminal117_deferred_currency_change','terminal117_unsaved_session_currency']){
    const h=harness(mode);const event=h.s.player.other_attr_info.oldTrekInfo.sailInfo.currentEvent;
    assert.equal(event.id,117);
    if(scenario==='terminal117_deferred_currency_change'){
      h.s.player.currencies.silver+=1;h.s.player.items[2]+=1;h.queueDeferred(h.s.player);
    }
    if(scenario==='terminal117_unsaved_session_currency'){h.s.player.currencies.silver+=1;h.s.player.items[2]+=1;}
    const r=await h.handler.handleOldTrekAction(7002,{eventUid:event.uid,operate:0,param:0,requestId:'repro_'+scenario},h.s,90);
    const packets=Array.isArray(r)?r:[r];
    records.push({scenario,reply:packets.map(p=>({tag:p.tag,msgUid:p.msgUid,result:p.data?.result,code:p.data?.code})),
      sessionAlive:!!h.s.player,errors:h.errors.map(s=>s.split('\n').slice(0,3).join('\n')),casMisses:h.casMisses,
      writes:h.writes.length,currentEvent:h.stored().other_attr_info.oldTrekInfo.sailInfo.currentEvent?.id||null});
  }
  const result={mode,productionWrites:0,networkCalls:0,records};
  fs.writeFileSync(path.join(dir,'repro-'+mode+'.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
if(require.main===module)run(process.argv[2]||'baseline').catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={harness,tables,focused,copy};
