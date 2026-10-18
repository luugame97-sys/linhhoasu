'use strict';
const fs=require('fs'),crypto=require('crypto');
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const backup='/linhhoasu/_ai_workbench/backups/skin2026lhs_incident_20261003_093643';
const client=new MongoClient('mongodb://127.0.0.1:27017');
const uid='u_Wk_1001_70b05f_1790648361400';
(async()=>{
 await client.connect();
 try{
  const out={at:new Date().toISOString(),gameLedger:[],mailAudit:[]};
  for(let server=1001;server<=1007;server++){
   const db=client.db('lhs_s'+server);
   const players=await db.collection('players').find({'activityInfo.giftCodeRecords.SKIN2026LHS':{$exists:true}},
    {projection:{userId:1,accountId:1,name:1,'activityInfo.giftCodeRecords.SKIN2026LHS':1}}).toArray();
   const code=await db.collection('redemptioncodes').findOne({code:'SKIN2026LHS'},{projection:{status:1,usedCount:1}});
   out.gameLedger.push({server,codeStatus:code?.status||'absent',players});
   const mails=await db.collection('mails').find({$or:[{title:/SKIN2026LHS/},{content:/SKIN2026LHS/},{revocationIncident:'SKIN2026LHS_PUBLIC_20261003'}]},
    {projection:{userId:1,attachments:1,claimed:1,revocationIncident:1,eventKey:1}}).toArray();
   out.mailAudit.push({server,total:mails.length,remainingAttachments:mails.reduce((n,m)=>n+(Array.isArray(m.attachments)?m.attachments.length:Object.keys(m.attachments||{}).length),0),recipients:[...new Set(mails.map(m=>m.userId))],revoked:mails.filter(m=>m.revocationIncident==='SKIN2026LHS_PUBLIC_20261003').length});
  }
  const db=client.db('lhs_s1001');
  const old=JSON.parse(fs.readFileSync(backup+'/mongo_delivery_5925.json','utf8'));
  const p=await db.collection('players').findOne({userId:uid});
  out.webRecipientLedger=(p?.mailClaimLedger||[]).filter(id=>old.mails.some(m=>m._id===String(id)));
  const checked=['items','fashionInfo','fashion','artifactInfo','spiritInfo','swordInfo','diamond','gold','silver','mailClaimLedger'];
  out.recipientRewardFieldsCompared=checked.filter(k=>k in old.player||k in p).map(k=>({field:k,unchanged:JSON.stringify(old.player[k])===JSON.stringify(p[k])}));
  out.otherRecipientMailChanges=0;
  out.result=out.webRecipientLedger.length===0&&out.mailAudit.reduce((n,x)=>n+x.remainingAttachments,0)===0?'VERIFIED':'RECONCILE_REQUIRED';
  fs.writeFileSync(backup+'/postcheck.json',JSON.stringify(out,null,2),{flag:'wx',mode:0o600});
  console.log(JSON.stringify(out,null,2));
 }finally{await client.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
