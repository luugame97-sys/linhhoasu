'use strict';
const fs=require('fs');
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const client=new MongoClient('mongodb://127.0.0.1:27017');
const uid='u_Wk_1001_d7b1ec_1787996263464';
const backup='/linhhoasu/_ai_workbench/backups/skin2026lhs_incident_20261003_093643';
const manifest=JSON.parse(fs.readFileSync('/linhhoasu/_ai_workbench/temp/skin2026lhs_manifest.json','utf8'));
const ids=new Set(Object.keys(manifest.items).map(Number));
const fields=['items','fashionInfo','fashion','artifactInfo','spiritInfo','swordInfo','petInfo','playerData','activityInfo'];
function present(value,prefix){
  const out=[];
  if(Array.isArray(value)) value.forEach((v,i)=>{if(ids.has(Number(v)))out.push({path:`${prefix}[${i}]`,id:Number(v),value:v});else if(v&&typeof v==='object')out.push(...present(v,`${prefix}[${i}]`));});
  else if(value&&typeof value==='object') Object.entries(value).forEach(([k,v])=>{const n=Number(k);if(Number.isInteger(n)&&ids.has(n))out.push({path:prefix?`${prefix}.${k}`:k,id:n,value:v});else if(v&&typeof v==='object')out.push(...present(v,prefix?`${prefix}.${k}`:k));});
  return out;
}
(async()=>{
  await client.connect();
  try{
    const db=client.db('lhs_s1001');
    const p=await db.collection('players').findOne({userId:uid});
    if(!p)throw Error('PLAYER_MISSING');
    const view={_id:p._id,userId:p.userId,accountId:p.accountId,name:p.name,playerId:p.playerId,updatedAt:p.updatedAt,createdAt:p.createdAt,fieldKeys:Object.keys(p)};
    fields.forEach(f=>{view[f]={type:Array.isArray(p[f])?'array':typeof p[f],keys:p[f]&&typeof p[f]==='object'?Object.keys(p[f]).length:0,matched:present(p[f],f).slice(0,500)};});
    const local=client.db('local');
    const exists=await local.listCollections({name:'oplog.rs'},{nameOnly:true}).toArray();
    let ops=[];
    if(exists.length){
      const oplog=local.collection('oplog.rs');
      const since=Math.floor(new Date('2026-10-03T08:40:00Z').getTime()/1000);
      const until=Math.floor(new Date('2026-10-03T08:45:00Z').getTime()/1000);
      ops=await oplog.find({ns:'lhs_s1001.players',op:{$in:['u','i']},ts:{$gte:{$timestamp:since,i:0},$lte:{$timestamp:until,i:999999}}}).toArray();
      ops=ops.filter(x=>JSON.stringify(x.o||{}).includes(uid)||String(x.o2?._id||'')===String(p._id)).map(x=>({ts:x.ts,op:x.op,o:x.o,o2:x.o2}));
    }
    const out={at:new Date().toISOString(),player:view,manifestCount:ids.size,oplogAvailable:exists.length>0,oplogOps:ops};
    fs.writeFileSync(backup+'/admin_audit.json',JSON.stringify(out,null,2),{flag:'wx',mode:0o600});
    console.log(JSON.stringify({at:out.at,player:{accountId:p.accountId,name:p.name,playerId:p.playerId},fieldMatches:Object.fromEntries(fields.map(f=>[f,view[f].matched.length])),oplogAvailable:out.oplogAvailable,oplogOps:ops.length},null,2));
  }finally{await client.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
