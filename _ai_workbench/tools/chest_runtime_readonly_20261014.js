'use strict';
// Read-only process/source and aggregated stock evidence. No player identities.
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto');
const root='/linhhoasu/lhs/newServer';
const empty=[406,408,432,434,444,446,100071,100072,100073,100181,100182,100183,100184,100211,100212,100213,100241,100242,100243,100261,100262,100263,100511,100512,100513,100721,100722,100723,100724,100725,100726,100727,100728,100729,100802];
const blocked=[412,413,94301,94401,94416,94418,94419,94420,94421,94422,94515,94701,94703,94705,94706,94708,94709,94711,94713,94715,94718,94719,94721,94724,94725,94726,94729,94801,94802,94902,94904,94908,94911,94923,94926,94929,94932,94935,94938,94941,100020,100021,100022,100026,100030,100031,100032,100036,100040,100060,100139,100160,100170,100185,100190,100200,100230,100250,100641,100642,100643,101000,101310,90021,90022,90151];
const ids=[...empty,...blocked];
const processes=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6})).filter(p=>/^lhs-s100[1-8]$/.test(p.name));
const stat=fs.statSync(root+'/src/handlers/item.js');
const sha256=crypto.createHash('sha256').update(fs.readFileSync(root+'/src/handlers/item.js')).digest('hex');
const {MongoClient}=require(root+'/node_modules/mongodb');
(async()=>{
 const inventory=[];
 for(const p of processes){
  const client=new MongoClient(p.pm2_env.MONGO_URI||p.pm2_env.env?.MONGO_URI,{serverSelectionTimeoutMS:10000});
  try{
   await client.connect();
   const projection={_id:0,...Object.fromEntries(ids.map(id=>['items.'+id,1]))};
   const rows=await client.db().collection('players').find({isBot:{$ne:true},$or:ids.map(id=>({['items.'+id]:{$gt:0}}))},{projection,maxTimeMS:10000}).toArray();
   const items=[];for(const id of ids){let owners=0,quantity=0;for(const row of rows){const n=Number(row.items?.[id]||0);if(n>0){owners++;quantity+=n;}}if(owners)items.push({id,owners,quantity});}
   inventory.push({server:p.name,affectedPlayers:rows.length,items});
  } finally {await client.close();}
 }
 console.log(JSON.stringify({at:new Date().toISOString(),productionWrites:0,scope:'non-bot players; projected tracked items only; no identity fields',itemHash:sha256,processes:processes.map(p=>({name:p.name,status:p.pm2_env.status,start:new Date(p.pm2_env.pm_uptime).toISOString(),startedAfterItemChange:p.pm2_env.pm_uptime>stat.mtimeMs,script:p.pm2_env.pm_exec_path,configOverride:p.pm2_env.CONFIG_BIN_PATH||null})),emptyIds:empty,blockedIds:blocked,inventory}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
