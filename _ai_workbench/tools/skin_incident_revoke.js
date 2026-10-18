'use strict';
const fs=require('fs');
const {MongoClient,ObjectId}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const client=new MongoClient('mongodb://127.0.0.1:27017');
const backup='/linhhoasu/_ai_workbench/backups/skin2026lhs_incident_20261003_093643';
const incident='SKIN2026LHS_PUBLIC_20261003';
const saved=JSON.parse(fs.readFileSync(backup+'/mongo_delivery_5925.json','utf8'));
const uid='u_Wk_1001_70b05f_1790648361400';
const hash=x=>require('crypto').createHash('sha256').update(JSON.stringify(x)).digest('hex');
(async()=>{
 await client.connect();
 try {
  if(saved.delivery.role_id!==uid||saved.delivery.account_name!=='lhs_bui1'||saved.mails.length!==109)throw Error('BACKUP_IDENTITY_MISMATCH');
  const db=client.db('lhs_s1001'), mails=db.collection('mails'),players=db.collection('players');
  const ids=saved.mails.map(m=>new ObjectId(m._id));
  const current=await mails.find({_id:{$in:ids},userId:uid}).toArray();
  const player=await players.findOne({userId:uid},{projection:{accountId:1,mailClaimLedger:1}});
  if(player?.accountId!=='lhs_bui1')throw Error('PLAYER_IDENTITY_MISMATCH');
  if(current.length!==109||current.some(m=>m.claimed)||ids.some(id=>(player.mailClaimLedger||[]).includes(String(id))))throw Error('CLAIM_STATE_CHANGED_REAUDIT_REQUIRED');
  for(const mail of current){
   const original=saved.mails.find(m=>m._id===String(mail._id));
   if(!original||original.eventKey!==mail.eventKey||hash(original.attachments)!==hash(mail.attachments))throw Error('MAIL_PREIMAGE_CHANGED');
  }
  fs.writeFileSync(backup+'/mail_revoke_preimage.json',JSON.stringify({at:new Date(),mails:current,player},null,2),{flag:'wx',mode:0o600});
  let changed=0;
  for(const mail of current){
   const result=await mails.updateOne({_id:mail._id,userId:uid,eventKey:mail.eventKey,claimed:false,attachments:mail.attachments},
    {$set:{attachments:[],claimed:true,read:true,revokedAt:new Date(),revocationIncident:incident,
     title:'Quà thử nghiệm đã thu hồi',content:'Mã thử nghiệm đã đóng; phần đính kèm được thu hồi trước khi nhận.',text:'Mã thử nghiệm đã đóng; phần đính kèm được thu hồi trước khi nhận.',updatedAt:new Date()}});
   if(result.modifiedCount!==1)throw Error('MAIL_CAS_FAILED:'+mail._id);
   changed++;
  }
  const after=await mails.find({_id:{$in:ids},userId:uid}).toArray();
  const p=await players.findOne({userId:uid},{projection:{mailClaimLedger:1}});
  const raced=ids.filter(id=>(p.mailClaimLedger||[]).includes(String(id))).map(String);
  const result={at:new Date().toISOString(),account:'lhs_bui1',server:1001,delivery:5925,changed,
   emptyRevokedMails:after.filter(m=>m.revocationIncident===incident&&m.claimed&&m.attachments.length===0).length,
   attachmentsRemoved:current.reduce((s,m)=>s+m.attachments.length,0),
   eventKeysPreserved:after.every(m=>saved.mails.some(x=>x._id===String(m._id)&&x.eventKey===m.eventKey)),
   originalClaimLedgerMatches:raced,playerWrites:0,backup};
  fs.writeFileSync(backup+'/revocation.json',JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
  console.log(JSON.stringify(result,null,2));
  if(raced.length)throw Error('CONCURRENT_CLAIM_REQUIRES_RECONCILIATION');
 }finally{await client.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
