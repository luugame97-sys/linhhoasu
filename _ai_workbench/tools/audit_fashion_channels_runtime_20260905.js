'use strict';
// Only direct find/hash operations. Do not import app bootstrap or models.
const fs=require('fs'),crypto=require('crypto');
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const INPUT=__AUDIT_INPUT__;
const all=new Map(INPUT.ids.map(r=>[r.id,r])),idList=[...all.keys()];
const fashionIds=INPUT.ids.filter(r=>r.kind==='fashion').map(r=>r.id);
const anonymous=(db,id)=>crypto.createHash('sha256').update('fashion-channel-audit-v1|'+db+'|'+id).digest('hex').slice(0,14);
const own=(p,id)=>Array.isArray(p.fashionInfo?.activateFashion)&&p.fashionInfo.activateFashion.map(Number).includes(id)||Number(p.fashionInfo?.fashions?.[id])>0;
const group=(title,content)=>/webshop/i.test(title+' '+content)?'webshop':/giftcode/i.test(title+' '+content)?'webGiftcode':/nạp|充值|到账/i.test(title+' '+content)?'rechargeOrOther':'other';
async function main(){const client=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:8000,maxPoolSize:1});await client.connect();const dbs={};
try{for(const dbName of ['lhs_s1001','lhs_s1002']){const db=client.db(dbName);
const players=await db.collection('players').find({isBot:{$ne:true}},{projection:{userId:1,playerId:1,items:1,fashionInfo:1,rechargeInfo:1,mailClaimLedger:1,formationInfo:1,swordInfo:1,artifactInfo:1,spiritInfo:1}}).maxTimeMS(15000).toArray();
const byUser=new Map(players.map(p=>[String(p.userId),p]));const bagRows=[];const bagTotals={};const boxTotals={};const purchaseRows=[];const overlapMissing=[];
for(const p of players){for(const [raw,count] of Object.entries(p.items||{})){const id=Number(raw),c=Number(count),r=all.get(id);if(!r||c<=0)continue;if(r.kind==='dress'){boxTotals[id]=(boxTotals[id]||0)+c;continue;}if(r.kind!=='fashion')continue;
const owned=own(p,id);bagTotals[id]=bagTotals[id]||{id,name:r.name,humans:0,count:0,unownedHumans:0};bagTotals[id].humans++;bagTotals[id].count+=c;if(!owned)bagTotals[id].unownedHumans++;
bagRows.push({subject:anonymous(dbName,p.userId),id,name:r.name,count:c,owned,timedSeconds:r.timedSeconds});}
for(const r of INPUT.ids.filter(r=>r.fashion&&['formation','sword','artifact','spirit'].includes(r.kind))){if(!own(p,r.id))continue;let owned=false;if(r.kind==='formation')owned=(p.formationInfo?.owns||[]).map(Number).includes(r.id);if(r.kind==='sword')owned=(p.swordInfo?.data||[]).some(x=>Number(x.id)===r.id);if(r.kind==='artifact')owned=(p.artifactInfo?.artifacts||[]).some(x=>Number(x.id)===r.id);if(r.kind==='spirit')owned=(p.spiritInfo?.owns||[]).map(Number).includes(r.id);if(!owned)overlapMissing.push({subject:anonymous(dbName,p.userId),id:r.id,name:r.name,kind:r.kind});}
for(const purchase of INPUT.cash){const record=(p.rechargeInfo?.records||[]).find(r=>Number(r.id)===purchase.payId);if(!record||Number(record.count)<=0)continue;const ids=purchase.direct.filter(id=>all.get(id)?.kind!=='dress');purchaseRows.push({subject:anonymous(dbName,p.userId),payId:purchase.payId,count:Number(record.count),missingFashion:ids.filter(id=>all.get(id)?.fashion&&!own(p,id)),ownedFashion:ids.filter(id=>own(p,id))});}}
const mails=await db.collection('mails').find({'attachments.id':{$in:idList}},{projection:{userId:1,attachments:1,claimed:1,read:1,title:1,content:1,createdAt:1,expireAt:1,eventKey:1}}).maxTimeMS(15000).toArray();
const mailGroups={},mailMissing=[];let checkedHumanMails=0;
for(const m of mails){const p=byUser.get(String(m.userId));if(!p)continue;checkedHumanMails++;const source=group(m.title||'',m.content||'');const ledger=(p.mailClaimLedger||[]).map(String).includes(String(m._id));
for(const a of m.attachments||[]){const id=Number(a.id),r=all.get(id);if(!r)continue;const key=source+':'+id;const g=mailGroups[key]||(mailGroups[key]={source,id,name:r.name,kind:r.kind,mails:0,claimed:0,unclaimed:0,ledgerMatches:0,claimedFashionNotOwned:0});g.mails++;if(m.claimed){g.claimed++;if(ledger)g.ledgerMatches++;if(r.kind==='fashion'&&!own(p,id)){g.claimedFashionNotOwned++;mailMissing.push({subject:anonymous(dbName,p.userId),id,name:r.name,source,mailHash:anonymous(dbName,m._id),createdAt:m.createdAt,ledger,timedSeconds:r.timedSeconds,bag:Number(p.items?.[id])||0});}}else g.unclaimed++;}}
dbs[dbName]={humanPlayers:players.length,fashionBagHumans:new Set(bagRows.map(r=>r.subject)).size,fashionBagRows:bagRows.length,fashionBagUnownedRows:bagRows.filter(r=>!r.owned).length,bagTotals:Object.values(bagTotals),bagRows,unopenedSuitBoxes:boxTotals,checkedHumanMails,mailGroups:Object.values(mailGroups),claimedFashionNotOwned:mailMissing,purchaseRows,overlapMissing};}
}finally{await client.close();}
const hashes={};for(const p of INPUT.sourcePaths){const b=fs.readFileSync(p);hashes[p]=crypto.createHash('sha256').update(b).digest('hex');}
console.log(JSON.stringify({readOnly:true,databaseWrites:0,remoteFilesWritten:0,generatedAt:new Date().toISOString(),dbs,sourceHashes:hashes}));}
main().catch(e=>{console.error(e.name);process.exitCode=1;});
