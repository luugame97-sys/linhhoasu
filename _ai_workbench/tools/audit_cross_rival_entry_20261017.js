'use strict';
// Read-only diagnosis: no gameplay RPC, service initialization, or database writes.
const fs=require('fs'),cp=require('child_process');
const {MongoClient}=require('mongodb');
const nodes=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6}))
  .filter(p=>/^lhs-s\d+$/.test(p.name)).sort((a,b)=>a.name.localeCompare(b.name));
for(const [k,v] of Object.entries(nodes[0].pm2_env))if(typeof v==='string')process.env[k]=v;
const loggerPath=require.resolve('./src/logger');
require.cache[loggerPath]={id:loggerPath,filename:loggerPath,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const config=require('./src/services/ConfigService');config.loadAllTables();
const rules=require('./src/services/CrossRivalRules'),cross=require('./src/services/CrossServerEventService');
const schedule=require('./src/services/CrossEventScheduleService'),now=Date.now(),cycle=cross.cycleFor('crossRival',now);
function tail(file){if(!file||!fs.existsSync(file))return[];const size=fs.statSync(file).size,b=Buffer.alloc(Math.min(size,524288)),fd=fs.openSync(file,'r');try{fs.readSync(fd,b,0,b.length,Math.max(0,size-b.length));}finally{fs.closeSync(fd);}return b.toString('utf8').split('\n').slice(1);}
(async()=>{
 const result={checkedAt:new Date(now).toISOString(),release:rules.release,cycle,phase:rules.phase(cycle,now,schedule.metadata('crossRival',cycle)),openConfig:config.get('CrossRivalOpenConfig'),servers:[],worlds:[],native:[],productionWrites:0,playerWrites:0,gameRpcCalls:0};
 for(const p of nodes){const e=p.pm2_env,sid=Number(e.SERVER_ID),lines=[...tail(e.pm_out_log_path),...tail(e.pm_err_log_path)];
  let ready;try{const r=await fetch('http://127.0.0.1:'+e.HTTP_PORT+'/ready',{signal:AbortSignal.timeout(5000)});ready={http:r.status,body:await r.json()};}catch(err){ready={error:err.message};}
  const errors=lines.filter(l=>/CrossRival|tag=6551|CROSS_RIVAL_/.test(l));
  result.servers.push({serverId:sid,status:e.status,pid:p.pid,cwd:e.pm_cwd,crossEnabled:e.CROSS_EVENT_ENABLED,poolAllowed:cross.isServerAllowed(sid),camp:rules.camp(sid),rivalAllowed:rules.allowed(sid,'read-only-probe',now),ready,logs:errors.slice(-20).map(l=>l.replace(/user=\S+|playerId=\S+|name=\S+/g,'[redacted]'))});
 }
 const e=nodes[0].pm2_env,client=new MongoClient(e.MONGO_URI,{serverSelectionTimeoutMS:5000,maxPoolSize:1});
 try{await client.connect();const db=client.db(e.IDENTITY_MONGO_DB);
  for(const w of await db.collection(rules.collection('worlds')).find({'cycle.key':cycle.key},{maxTimeMS:5000}).limit(3).toArray()){
   const codes={},byServer={};let latest=[];
   for(const p of Object.values(w.players||{})){byServer[p.serverId]=(byServer[p.serverId]||0)+1;for(const h of p.history||[]){if(h.result?.code)codes[h.result.code]=(codes[h.result.code]||0)+1;latest.push({at:h.at,serverId:p.serverId,result:h.result});}}
   latest.sort((a,b)=>b.at-a.at);
   result.worlds.push({id:w._id,revision:w.revision,cycle:w.cycle,players:Object.keys(w.players||{}).length,byServer,codes,latest:latest.slice(0,20),pending:Object.values(w.players||{}).filter(p=>p.pending).length,outboxPending:Object.values(w.outbox||{}).filter(p=>p.state==='pending').length});
  }
 }finally{await client.close();}
 const text=fs.readFileSync('/linhhoasu/webgame/game/js/main.min_drop200.js','utf8');
 for(const needle of ['could not enter','could not','CrossRivalMapEnter','CrossRivalMapItem','CrossRivalCampItem']){let from=0,count=0;while(count++<4){const i=text.indexOf(needle,from);if(i<0)break;result.native.push({needle,context:text.slice(Math.max(0,i-350),i+650)});from=i+needle.length;}}
 console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
