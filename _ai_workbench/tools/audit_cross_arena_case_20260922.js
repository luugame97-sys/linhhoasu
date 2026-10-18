'use strict';
// Read-only diagnostics: native Mongo reads and pure calculator/simulator only.
const cp = require('child_process'), fs = require('fs'), crypto = require('crypto');
const processes = JSON.parse(cp.execSync('pm2 jlist', {encoding:'utf8'}));
const pm = processes.find(p => p.name === 'lhs-s1002');
if (!pm) throw Error('S2_MISSING');
const env = k => pm.pm2_env[k] ?? pm.pm2_env.env?.[k];
for (const k of ['SERVER_ID','CONFIG_BIN_PATH','DROP_LEVEL_100_ENABLED','DROP_LEVEL_100_DISABLED','DROP_LEVEL_46_ENABLED','FASHION_CONTENT_OVERLAY_PATH','FASHION_CHOICE_OVERLAY_PATH','FASHION_CHOICE_STARS_OVERLAY_PATH']) if(env(k)!=null)process.env[k]=String(env(k));
const lp=require.resolve('./src/logger');require.cache[lp]={id:lp,filename:lp,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const {MongoClient}=require('mongodb');
const battle=require('./src/services/BattleService'), read=require('./src/services/ArenaReadModelService'), cfg=require('./src/services/ConfigService');
const hash=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const clone=x=>JSON.parse(JSON.stringify(x));
function simulation(a,d) {
  const original=Math.random, results={wins:0,losses:0,timeouts:0,samples:[]};
  try {for(let seed=1;seed<=40;seed++){
    let state=seed;Math.random=()=>((state=(Math.imul(1664525,state)+1013904223)>>>0)/4294967296);
    const f=battle.simulateBattle(a,d,{isPvp:true});
    results[f.win?'wins':'losses']++;if(f.playerHPLeft>0&&f.monsterHPLeft>0)results.timeouts++;
    if(seed<=2){const acts={};for(const r of f.rounds)for(const act of r.actions||[]){const k=act.caster+':'+act.kind;acts[k]=(acts[k]||0)+1;}
      results.samples.push({seed,win:f.win,rounds:f.totalRounds,hpLeft:[f.playerHPLeft,f.monsterHPLeft],actions:acts});}
  }}finally{Math.random=original;}return results;
}
(async()=>{
 const m=new MongoClient(env('MONGO_URI'),{serverSelectionTimeoutMS:5000});await m.connect();
 try{
  const db=m.db(), shared=env('IDENTITY_MONGO_DB')?m.db(env('IDENTITY_MONGO_DB')):db;
  const out={at:new Date().toISOString(),readOnly:true,productionWrites:0,server:pm.name,cwd:pm.pm2_env.pm_cwd,db:db.databaseName,sharedDb:shared.databaseName,maxRounds:cfg.get('ConstConfig')?.fightMaxRound,sourceHashes:{},players:[],entries:[],fights:[]};
  for(const rel of ['src/services/BattleService.js','src/services/CrossArenaService.js','src/services/ArenaReadModelService.js'])out.sourceHashes[rel]=hash(fs.readFileSync(rel,'utf8'));
  const docs=await db.collection('players').find({name:{$regex:'^(FoxPlayer|.*CaCa)$',$options:'i'}},{maxTimeMS:5000}).limit(12).toArray();
  for(const p of docs){const attrs=battle.calcPlayerPower(clone(p)),s=p.crossArenaInfo||{};
    out.players.push({name:p.name,playerId:p.playerId,dbid:String(p._id),serverId:p.serverId,level:p.level,attrs,power:read.displayPower(attrs),cross:{cycleKey:s.cycleKey,updatedAt:s.updatedAt,publicRow:s.publicRow,challenge:s.challenge,ledgerCount:s.ledger?.length,outboxCount:s.outbox?.length},dbUnchanged:hash(await db.collection('players').findOne({_id:p._id},{maxTimeMS:5000}))===hash(p)});
  }
  const ids=docs.map(p=>String(p.playerId));
  out.entries=await shared.collection('crossevententries').find({event:'crossArena',playerId:{$in:ids}},{projection:{userId:0},maxTimeMS:5000}).sort({updatedAt:-1}).limit(12).toArray();
  const receipts=await shared.collection('crossarenaactions').find({kind:'fight',$or:[{playerId:{$in:ids}},{targetPlayerId:{$in:ids}}]},{projection:{userId:0,fingerprint:0},maxTimeMS:5000}).sort({committedAt:-1}).limit(60).toArray();
  for(const r of receipts){const f=r.response?.fightResult,a=f?.atkAttr,d=f?.defAttr;
    out.fights.push({id:r._id,at:new Date(r.committedAt).toISOString(),cycleKey:r.cycleKey,serverId:r.serverId,targetServerId:r.targetServerId,playerId:r.playerId,targetPlayerId:r.targetPlayerId,win:r.response?.win,attacker:r.log?.attacker,defender:r.log?.defender,atkAttr:a,defAttr:d,damage:f?.damage,power:a&&d?[read.displayPower(a),read.displayPower(d)]:null,simulation:a&&d?simulation(a,d):null});}
  console.log(JSON.stringify(out));
 }finally{await m.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
