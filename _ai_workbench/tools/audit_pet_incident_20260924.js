'use strict';
// Read-only production inventory and bounded log audit. No game RPC or writes.
const fs = require('fs');
const crypto = require('crypto');
const cp = require('child_process');
const app = '/linhhoasu/lhs/newServer';
const { MongoClient } = require(app + '/node_modules/mongodb');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const logPath = require.resolve(app + '/src/logger');
require.cache[logPath] = { id: logPath, filename: logPath, loaded: true, exports: { info(){}, debug(){}, warn(){}, error(){} } };
const config = require(app + '/src/services/ConfigService');
const tables = config.loadAllTables();
const cfg = tables.PetConfig || {};
const projection = { _id:0, userId:1, name:1, level:1, serverId:1, isBot:1, petInfo:1, shopInfo:1, 'other_attr_info.petSoulInfo.petSouls':1, 'petSoulInfo.petSouls':1, 'items.24':1, 'items.25':1, 'items.26':1, 'items.36':1, 'currencies.diamond':1, updatedAt:1 };
function summarize(p, detail = false) {
  const info=p.petInfo || {}, pets=Array.isArray(info.pets)?info.pets:[], field=Number(info.field??8);
  const uids=new Set(), slots=new Map(), problems=[];
  for (const pet of pets) {
    const uid=Number(pet.uid),slot=Number(pet.slot);
    if(!Number.isSafeInteger(uid)||uid<=0)problems.push('invalidUid');
    if(uids.has(uid))problems.push('duplicateUid'); uids.add(uid);
    if(!cfg[pet.id])problems.push('unknownPetId');
    if(!Number.isInteger(slot)||slot < -3 ||slot>=field)problems.push('slotOutOfRange');
    // Native getPetEquips maps -1/-2/-3 to the three battle slots.
    // Only non-negative values are compose slots. Negative values are the
    // native battle-pet slots and may be repeated in legacy inventories.
    if (slot >= 0) slots.set(slot,(slots.get(slot)||0)+1);
  }
  if([...slots.values()].some(n=>n>1))problems.push('duplicateSlot');
  const free=Array.from({length:Math.min(Math.max(field,0),100)},(_,i)=>i).filter(i=>!slots.has(i));
  const composePets=pets.filter(x=>Number(x.slot)>=0 && Number(x.locked||x.lock||0)<=0 && Number(cfg[x.id]?.tag||1)!==2);
  const groups={};for(const x of composePets){const q=Number(cfg[x.id]?.quality||0);if(q>0 && q<9)(groups[q]??=[]).push(x);}
  const eligibleQuality=Object.keys(groups).map(Number).find(q=>groups[q].length>=2)||0;
  const costRow=(tables.PetQualityConfig||{})[eligibleQuality]?.consumes?.[0];
  const costNeeded=eligibleQuality>0?Number(costRow?.count||0):0;
  const row={userId:p.userId,name:p.name,isBot:!!p.isBot,level:p.level,field,petCount:pets.length,freeSlots:free,issues:[...new Set(problems)],egg:{24:Number(p.items?.[24]||0),25:Number(p.items?.[25]||0),26:Number(p.items?.[26]||0)},fruit:Number(p.items?.[36]||0),diamond:Number(p.currencies?.diamond||0),shopBuy25:Number(p.shopInfo?.buyRecords?.[25]||0),updatedAt:p.updatedAt,compose:{eligibleQuality,costNeeded,blockedNoCost:eligibleQuality>0&&Number(p.items?.[36]||0)<costNeeded}};
  if(detail){row.nextUid=info.nextUid;row.updatedAt=p.updatedAt;row.timeRecords=info.timeRecords;row.pets=pets.map(p=>({...p,quality:cfg[p.id]?.quality,type:cfg[p.id]?.type,tag:cfg[p.id]?.tag}));row.soulBindings=(p.other_attr_info?.petSoulInfo?.petSouls||p.petSoulInfo?.petSouls||[]).map(s=>({id:s.id,petUid:s.petUid}));}
  return row;
}
(async()=>{
 const out={at:new Date().toISOString(),productionWrites:0,account:'Tuanpkt',files:{},servers:[],target:[]};
 for(const rel of ['src/handlers/pet.js','src/handlers/pet-soul.js','src/services/PlayerService.js','src/net/WSServer.js','src/handlers/index.js','src/services/ConfigService.js','src/protocol/PacketManager.js','src/protocol/Codec.js','src/protocol/BinJsonUtil.js','src/protocol/ByteArray.js']){const p=app+'/'+rel;const b=fs.readFileSync(p);out.files[rel]={sha256:sha(b),normalized:sha(Buffer.from(b.toString('utf8').replace(/\r\n/g,'\n'))),mtime:fs.statSync(p).mtime.toISOString()};}
 const client='/linhhoasu/webgame/game/js/main.min_drop100.js';out.files.client={sha256:sha(fs.readFileSync(client))};
 out.config={PetBaseConfig:tables.PetBaseConfig,PetEggConfig:tables.PetEggConfig,quality:Object.values(tables.PetQualityConfig).map(q=>({quality:q.quality,id:q.id,rate:q.composeSuccessRate,consumes:q.consumes})),petRows:Object.keys(cfg).length};
 const procs=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})).filter(p=>/^lhs-s100[1-5]$/.test(p.name));
 const mongo=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:7000,maxPoolSize:2});await mongo.connect();
 try{
 const accounts=await mongo.db('lhs_s1001').collection('accounts').find({accountId:/^Tuanpkt$/i},{projection:{_id:0,account:1,accountId:1,roles:1}}).limit(4).toArray();
 out.identity=accounts.map(a=>({account:a.account,accountId:a.accountId,roles:(a.roles||[]).map(r=>({userId:r.userId,serverId:r.serverId,name:r.name}))}));
 const targetUids=accounts.flatMap(a=>(a.roles||[]).map(r=>r.userId)).filter(Boolean);
 for(const proc of procs){
   const e=proc.pm2_env,db='lhs_'+proc.name.slice(4),col=mongo.db(db).collection('players');
   const row={name:proc.name,status:e.status,cwd:e.pm_cwd,start:new Date(e.pm_uptime).toISOString(),configPath:e.CONFIG_BIN_PATH||e.env?.CONFIG_BIN_PATH||null,composeFailOpen:e.PET_COMPOSE_FAIL_OPEN??null};
   const people=await col.find({'petInfo.pets.0':{$exists:true}},{projection}).toArray();
   const summaries=people.map(p=>summarize(p));
   const anomalyPlayers=people.filter(p=>summarize(p).issues.length);
   row.inventory={playersWithPets:summaries.length,fullSlots:summaries.filter(p=>!p.freeSlots.length).length,eligibleCompose:summaries.filter(p=>p.compose.eligibleQuality>0).length,eligibleComposeBlockedNoCost:summaries.filter(p=>p.compose.blockedNoCost).length,anomalies:anomalyPlayers.map(p=>{const s=summarize(p),slots={};for(const x of p.petInfo.pets)if(Number(x.slot)>=0)slots[x.slot]=(slots[x.slot]||0)+1;return {userId:s.userId,name:s.name,issues:s.issues,field:s.field,petCount:s.petCount,duplicateSlots:Object.entries(slots).filter(([k,n])=>n>1)}})};
   const target=await col.find({$or:[{userId:{$in:targetUids}},{name:/^Tuanpkt$/i}]},{projection}).limit(5).toArray();
   out.target.push(...target.map(p=>({server:proc.name,...summarize(p,true)})));
   row.logs=[];
   const logDir=e.LOG_DIR||e.env?.LOG_DIR||app+'/logs';
   const appLogs=fs.existsSync(logDir)?fs.readdirSync(logDir).filter(n=>/^(combined|error).*\.log$/.test(n)).sort().slice(-4).map(n=>logDir+'/'+n):[];
   row.logDir=logDir;
   for(const p of [...new Set([e.pm_out_log_path,e.pm_err_log_path,...appLogs].filter(Boolean))]){
     let lines=[];try{lines=cp.execFileSync('tail',['-c','3000000',p],{encoding:'utf8',maxBuffer:4000000}).split('\n');}catch(err){row.logs.push({file:p,error:err.message.slice(0,120)});continue;}
     const matched=lines.filter(l=>/tag[=:\s]+(?:3300|3301|3302|3311|3314|1200|1202)\b|\[Pet\]|pet\.js|PetCompose|PetUseEgg|legacy shop buy|goodsId=25|PAID_USE_RECHARGE_PATH|not enough currency/i.test(l));
     const targetLines=lines.filter(l=>targetUids.some(id=>l.includes(id))&&(/pet|3300|3301|3302|3311|3314|1200|1202|goodsId=25|shop buy|error|Error|fail/i.test(l)));
     row.logs.push({file:p,totalBytes:fs.statSync(p).size,scannedBytes:3000000,matches:matched.length,samples:matched.slice(-10),target:targetLines.slice(-30)});
   }
   out.servers.push(row);
 }
 }finally{await mongo.close();}
 console.log(JSON.stringify(out));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
