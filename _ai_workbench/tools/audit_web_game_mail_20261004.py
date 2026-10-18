"""Reconcile the recent bounded WebGM sample with persisted game mail, read only."""
import json
from pathlib import Path
from skin_incident_remote import connect,run
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'_ai_workbench/temp/web_game_identity_20261004'
sample=json.loads((OUT/'web.json').read_text(encoding='utf8'))['deliveries']
JS=r'''
const crypto=require('crypto');
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const sample=__SAMPLE__;
const client=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:5000});
(async()=>{await client.connect();try{
 const accounts=[...new Set(sample.map(d=>d.account_name))],byAccount={},mails={};
 const identities=await client.db('lhs_s1001').collection('accounts').find({accountId:{$in:accounts}},
  {projection:{_id:0,accountId:1,lastSelectedServerId:1,lastLoginTime:1,'roles.userId':1,'roles.serverId':1,'roles.lastLoginTime':1,'roles.roleId':1}}).toArray();
 const identityMap=new Map(identities.map(x=>[x.accountId,x]));
 const keysByServer={};for(const d of sample){const keys=Array.from({length:d.batchCount},(_,i)=>'webgm_gift_'+crypto.createHash('sha256').update(d.account_name+'|'+d.server_id+'|'+d.source_id+'|'+(i+1)).digest('hex'));d.keys=keys;(keysByServer[d.server_id]||=[]).push(...keys);}
 for(let sid=1001;sid<=1007;sid++){
  const db=client.db('lhs_s'+sid),roles=await db.collection('players').find({accountId:{$in:accounts}},
   {projection:{_id:0,userId:1,playerId:1,accountId:1,name:1,serverId:1,level:1,createdAt:1,mailClaimLedger:1}}).maxTimeMS(6000).toArray();
  for(const p of roles)(byAccount[p.accountId]||=[]).push({...p,dbServer:sid});
  const keys=keysByServer[String(sid)]||[];
  if(keys.length)mails[sid]=await db.collection('mails').find({eventKey:{$in:keys}},
    {projection:{_id:1,userId:1,eventKey:1,claimed:1,revocationIncident:1,createdAt:1,targetServerId:1,attachments:1}}).maxTimeMS(7000).toArray();
 }
 const summary={sample:sample.length,recipientFound:0,recipientMissing:0,ownerMismatch:0,serverMismatch:0,
   expectedBatches:0,mailExists:0,claimed:0,unclaimed:0,revoked:0,missingMailButClaimLedger:0,missingMailUnknown:0,
   accountsWithMultipleServers:0,accountsWithMultipleSameServerRoles:0,deliveriesDifferentFromLatestGameRole:0};
 const rows=[];
 for(const d of sample){
  const roles=byAccount[d.account_name]||[],recipient=roles.find(p=>p.userId===d.role_id&&p.dbServer===Number(d.server_id));
  const identity=identityMap.get(d.account_name),last=identity?.roles?.filter(r=>Number(r.lastLoginTime)>0).sort((a,b)=>b.lastLoginTime-a.lastLoginTime)[0];
  if(recipient)summary.recipientFound++;else summary.recipientMissing++;
  if(recipient&&recipient.accountId!==d.account_name)summary.ownerMismatch++;
  if(recipient&&Number(recipient.serverId)!==Number(d.server_id))summary.serverMismatch++;
  const found=(mails[d.server_id]||[]).filter(m=>d.keys.includes(m.eventKey));
  const ledger=new Set(recipient?.mailClaimLedger||[]);
  let claimed=0,unclaimed=0,revoked=0;
  for(const m of found){if(m.userId!==d.role_id)summary.ownerMismatch++;if(m.revocationIncident){revoked++;continue;}if(m.claimed||ledger.has(String(m._id)))claimed++;else unclaimed++;}
  const mismatch=!!last&&last.userId!==d.role_id;
  summary.expectedBatches+=d.batchCount;summary.mailExists+=found.length;summary.claimed+=claimed;summary.unclaimed+=unclaimed;summary.revoked+=revoked;
  summary.missingMailUnknown+=d.batchCount-found.length;
  if(mismatch)summary.deliveriesDifferentFromLatestGameRole++;
  rows.push({delivery:d.id,account:d.account_name,webServer:d.server_id,role:d.role_id,recipient:recipient?{name:recipient.name,level:recipient.level}:null,
   mailCount:found.length,expectedBatches:d.batchCount,claimed,unclaimed,revoked,latestGameRole:last?{server:last.serverId,userId:last.userId,lastLoginTime:last.lastLoginTime}:null,
   latestRoleMismatch:mismatch,sameServerRoles:roles.filter(p=>p.dbServer===Number(d.server_id)).map(p=>({userId:p.userId,name:p.name,level:p.level})),
   alternateRoles:roles.filter(p=>p.userId!==d.role_id).map(p=>({userId:p.userId,name:p.name,level:p.level,server:p.dbServer})),createdAt:d.created_at});
 }
 for(const roles of Object.values(byAccount)){if(new Set(roles.map(p=>p.dbServer)).size>1)summary.accountsWithMultipleServers++;
  if(new Set(roles.map(p=>p.dbServer)).size<roles.length)summary.accountsWithMultipleSameServerRoles++;}
 console.log(JSON.stringify({at:new Date().toISOString(),summary,rows}));
}finally{await client.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1});
'''.replace('__SAMPLE__',json.dumps(sample,ensure_ascii=False))
with connect() as c,c.open_sftp() as s:
 result=json.loads(run(c,'node -',JS))
 (OUT/'mail_audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
 for remote,rel in [('/linhhoasu/lhs/newServer/src/net/HTTPServer.js','HTTPServer.js'),('/linhhoasu/lhs/newServer/src/net/Session.js','Session.js'),('/linhhoasu/webgame/game/index.html','game_index.html')]:
  (OUT/rel).write_bytes(s.open(remote,'rb').read())
 print(json.dumps({'at':result['at'],'summary':result['summary'],'mismatchSamples':[
    r for r in result['rows'] if r['latestRoleMismatch'] and r['unclaimed']>0][:6]},ensure_ascii=False,indent=2))
