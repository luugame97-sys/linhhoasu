'use strict';
const fs = require('fs');
const crypto = require('crypto');
const { MongoClient } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const backup='/linhhoasu/_ai_workbench/backups/skin2026lhs_incident_20261003_093643';
const web=JSON.parse(fs.readFileSync(backup+'/web_preimage.json','utf8'));
const client=new MongoClient('mongodb://127.0.0.1:27017');
(async()=>{
 await client.connect();
 try {
  const result={at:new Date().toISOString(),game:[],web:[]};
  for (let server=1001;server<=1007;server++) {
   const db=client.db('lhs_s'+server);
   const code=await db.collection('redemptioncodes').findOne({code:'SKIN2026LHS'});
   const users=[];
   for (const claim of code?.usedBy||[]) {
    const p=await db.collection('players').findOne({userId:claim.userId},{projection:{userId:1,name:1,accountId:1,playerId:1,'activityInfo.giftCodeRecords':1}});
    users.push({claim,player:p});
   }
   result.game.push({server,exists:!!code,status:code?.status,usedCount:code?.usedCount||0,users});
  }
  for (const d of web.deliveries) {
   const db=client.db('lhs_s'+d.server_id);
   const keys=Array.from({length:JSON.parse(d.reward_snapshot).batches.length},(_,i)=>'webgm_gift_'+crypto.createHash('sha256').update(d.account_name+'|'+d.server_id+'|'+d.source_id+'|'+(i+1)).digest('hex'));
   const mails=await db.collection('mails').find({userId:d.role_id,eventKey:{$in:keys}}).toArray();
   const player=await db.collection('players').findOne({userId:d.role_id});
   fs.writeFileSync(backup+'/mongo_delivery_'+d.id+'.json',JSON.stringify({delivery:d,mails,player},null,2),{flag:'wx',mode:0o600});
   const ledger=new Set((player?.mailClaimLedger||[]).map(String));
   const claimed=mails.filter(m=>m.claimed||ledger.has(String(m._id)));
   result.web.push({account:d.account_name,server:d.server_id,role:d.role_id,name:player?.name,playerAccount:player?.accountId,
     deliveryId:d.id,expectedMailCount:keys.length,mailCount:mails.length,claimedCount:claimed.length,
     unclaimedCount:mails.length-claimed.length,ledgerCount:ledger.size,
     sample:mails.slice(0,2).map(m=>({id:m._id,claimed:m.claimed,expireAt:m.expireAt,eventKey:m.eventKey,attachmentCount:Array.isArray(m.attachments)?m.attachments.length:Object.keys(m.attachments||{}).length,fields:Object.keys(m)})),
     claimedMailIds:claimed.map(m=>String(m._id))});
  }
  fs.writeFileSync(backup+'/audit.json',JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
  console.log(JSON.stringify(result,null,2));
 }finally{await client.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
