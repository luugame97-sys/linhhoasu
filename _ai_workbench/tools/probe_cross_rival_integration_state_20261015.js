'use strict';
const cp=require('child_process'),{MongoClient}=require('mongodb');
const nodes=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6})).filter(p=>/^lhs-s100[1-8]$/.test(p.name));
const env=nodes.find(p=>p.name==='lhs-s1001').pm2_env;
const client=new MongoClient(env.MONGO_URI,{serverSelectionTimeoutMS:5000,maxPoolSize:2});
(async()=>{await client.connect();const rows=[];
  for(const node of nodes.sort((a,b)=>a.name.localeCompare(b.name))){
    const collection=client.db('lhs_s'+node.pm2_env.SERVER_ID).collection('players');
    const cycle='C4_1791738000000',current={'crossRivalInfo.cycleKey':cycle};
    rows.push({serverId:Number(node.pm2_env.SERVER_ID),level100IncludingBots:await collection.countDocuments({level:{$gte:100}},{maxTimeMS:5000}),
      positiveLegacy:await collection.countDocuments({...current,$or:[{'crossRivalInfo.score':{$gt:0}},{'crossRivalInfo.defKill':{$gt:0}},{'crossRivalInfo.coreScore':{$gt:0}}]}),
      priorClaims:await collection.countDocuments({...current,'crossRivalInfo.taskRecord.0':{$exists:true}})});
  }
  const identity=client.db(env.IDENTITY_MONGO_DB);
  const worldCount=await identity.collection('cross_rival_worlds_v2').countDocuments();
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),nodes:rows,v2Worlds:worldCount,productionWrites:0}));
  await client.close();
})().catch(async e=>{console.error(e.message);await client.close();process.exitCode=1;});
