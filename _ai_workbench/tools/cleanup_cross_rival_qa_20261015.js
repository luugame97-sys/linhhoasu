'use strict';
// Only the two failed fixture runs created by this task. Never enumerate/drop
// all databases by prefix or age; ownership and exact player IDs are required.
const cp=require('child_process'),{MongoClient}=require('mongodb');
const env=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6})).find(p=>p.name==='lhs-s1001').pm2_env;
const client=new MongoClient(env.MONGO_URI,{serverSelectionTimeoutMS:5000});
const targets=['lhs_qa_rival_20261015_084404_615862'];
(async()=>{await client.connect();const result=[];
for(const name of targets){
 const db=client.db(name),owner=await db.collection('qa_owner').findOne({_id:'cross-rival-integration',database:name});
 const roles=await db.collection('players').find({},{projection:{userId:1}}).toArray();
 const collections=await db.listCollections().toArray();
 if(!owner||roles.length!==2||roles.some(p=>!['QA_RIVAL_A','QA_RIVAL_B'].includes(p.userId)))throw Error('QA_OWNERSHIP_FAILED:'+name);
 for(const collection of collections)if(!['qa_owner','players','worlds','fights','mails','settlements'].includes(collection.name)&&await db.collection(collection.name).countDocuments({}, {limit:1}))throw Error('QA_UNEXPECTED_NONEMPTY_COLLECTION:'+collection.name);
 await db.dropDatabase();result.push({database:name,fixtureRolesRemoved:roles.length,removed:true});
}
console.log(JSON.stringify({result,productionWrites:0}));await client.close();
})().catch(async e=>{console.error(e.message);await client.close();process.exitCode=1;});
