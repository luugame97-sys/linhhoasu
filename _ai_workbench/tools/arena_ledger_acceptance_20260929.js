'use strict';
const fs=require('fs'),assert=require('assert/strict'),crypto=require('crypto'),cp=require('child_process');
const {MongoClient,BSON}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const root='/linhhoasu/_ai_workbench/backups/arena_ledger_hardening_20260929_003556';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const hdoc=d=>hash(BSON.serialize(d));
(async()=>{
 const out={at:new Date().toISOString(),source:{},health:[],counts:{},targets:[],envUnchanged:[]};
 for(const f of ['src/handlers/arena.js','src/services/PlayerService.js','ecosystem.config.js'])out.source[f]=hash(fs.readFileSync('/linhhoasu/lhs/newServer/'+f));
 const before=JSON.parse(fs.readFileSync(root+'/pm2.before.json','utf8')),now=JSON.parse(cp.execFileSync('pm2',['jlist'],{maxBuffer:8e6}));
 for(const p of now.filter(p=>/^lhs-s100[1-6]$|^lhs-real-bots(?:-s[2-6])?$/.test(p.name))){const b=before.find(b=>b.name===p.name),keys=['SERVER_ID','BOT_ENABLED','BOT_COUNT_PER_MAP','BOT_MAX_TOTAL','REAL_BOT_ENABLED','REAL_BOT_LAZY_ENABLED','REAL_BOT_MAX_ACTIVE','MONGO_URI','REDIS_PREFIX'];out.envUnchanged.push({name:p.name,pid:p.pid,start:p.pm2_env.pm_uptime,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,changedKeys:keys.filter(k=>JSON.stringify(p.pm2_env[k])!==JSON.stringify(b?.pm2_env[k]))});}
 const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();
 try{
  for(let sid=1001;sid<=1006;sid++){
   const coll=c.db('lhs_s'+sid).collection('players');out.counts[sid]=await coll.countDocuments({'arenaReceiptLedger.targetScore.document':{$exists:true}});
   const p=[8080,8083,8084,8085,8086,8087][sid-1001],t=Date.now();const ready=await fetch('http://127.0.0.1:'+p+'/ready',{signal:AbortSignal.timeout(8000)});const h=await(await fetch('http://127.0.0.1:'+(9200+sid-1001)+'/health',{signal:AbortSignal.timeout(8000)})).json();out.health.push({sid,ready:ready.status,ws:h.status,pid:h.runtime?.pid,clients:h.runtime?.clients,elapsedMs:Date.now()-t});
  }
  for(const file of fs.readdirSync(root+'/cleanup_pre/bson').filter(n=>n.endsWith('.bson'))){
   const bytes=fs.readFileSync(root+'/cleanup_pre/bson/'+file),old=BSON.deserialize(bytes),db=file.split('__')[0],expected=BSON.deserialize(bytes);let removed=0;
   for(const e of expected.arenaReceiptLedger||[])if(e?.targetScore&&Object.hasOwn(e.targetScore,'document')){delete e.targetScore.document;removed++;}
   const live=await c.db(db).collection('players').findOne({_id:old._id});assert(live,'PLAYER_MISSING');
   const keys=['arenaScore','arenaScoreReceipts','items','currencies','arenaLogOutbox','arenaReceiptLedger'];
   const checks=Object.fromEntries(keys.map(k=>[k,hdoc({value:expected[k]})===hdoc({value:live[k]})]));
   out.targets.push({db,idHash:hash(Buffer.from(String(old._id))).slice(0,12),backupSha256:hash(bytes),roundTrip:hash(BSON.serialize(old))===hash(bytes),removed,beforeBson:bytes.length,expectedBson:BSON.serialize(expected).length,currentBson:BSON.serialize(live).length,fullDocumentMatchesExceptRemoved:hdoc(expected)===hdoc(live),checks});
  }
 }finally{await c.close();}
 out.accepted=Object.values(out.counts).every(n=>n===0)&&out.targets.every(t=>t.roundTrip&&Object.values(t.checks).every(Boolean))&&out.health.every(h=>h.ready===200&&h.ws==='ok')&&out.envUnchanged.every(p=>p.status==='online'&&p.changedKeys.length===0);
 const file=root+'/acceptance-'+Date.now()+'.json';fs.writeFileSync(file,JSON.stringify(out,null,2),{flag:'wx',mode:0o600});out.evidence=file;
 console.log(JSON.stringify(out,null,2));if(!out.accepted)process.exitCode=2;
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
