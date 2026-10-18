'use strict';
// Remove only the isolated native QA namespace created by this task. Never
// touch the public C4 world or any player/mail collection.
const cp=require('child_process'),{MongoClient}=require('mongodb');
const env=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6})).find(p=>p.name==='lhs-s1001').pm2_env;
const client=new MongoClient(env.MONGO_URI,{serverSelectionTimeoutMS:5000});
const prefix='rival_v2_QA_native_20261015_admin_';
(async()=>{await client.connect();const db=client.db(env.IDENTITY_MONGO_DB),out=[];
  for(const name of ['cross_rival_qa_worlds_v2','cross_rival_qa_fights_v2','cross_rival_qa_leases_v2','cross_rival_qa_settlements_v2']){
    const c=db.collection(name), before=await c.countDocuments({_id:{$regex:'^'+prefix}});
    const result=await c.deleteMany({_id:{$regex:'^'+prefix}});out.push({collection:name,before,deleted:result.deletedCount});
  }
  const publicCount=await db.collection('cross_rival_worlds_v2').countDocuments({_id:{$regex:'^rival_v2_C4_'}});
  console.log(JSON.stringify({namespace:prefix,out,publicWorldsPreserved:publicCount,productionPlayerWrites:0}));
  await client.close();
})().catch(async e=>{console.error(e.message);await client.close();process.exitCode=1;});
