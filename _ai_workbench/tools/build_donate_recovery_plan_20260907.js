'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../temp/donate_revision_20260907');
const sql=JSON.parse(fs.readFileSync(path.join(root,'sql-cutoff.json'),'utf8'));
const initial=JSON.parse(fs.readFileSync(path.join(root,'sql-before.json'),'utf8'));
const mongo=JSON.parse(fs.readFileSync(path.join(root,'mongo-cutoff.json'),'utf8'));
const changes=JSON.parse(fs.readFileSync(path.join(root,'catalog-apply.json'),'utf8'));
const oldRows=new Map(initial.milestones.map(r=>[Number(r.id),r]));
const newer=new Map(changes.changes.map(r=>[r.id,JSON.parse(r.after)]));
const hash=value=>crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const ts=s=>Date.parse(s.replace(' ','T')+'+07:00');
const attachments=raw=>{if(typeof raw==='string')raw=JSON.parse(raw);const out={};if(Array.isArray(raw)){for(const i of raw){const id=Number(i.id??i.item_id),n=Number(i.count??i.amount);assert(Number.isSafeInteger(n)&&n>0);out[id]=(out[id]||0)+n;}}else Object.assign(out,raw);return out;};
const entries=[],held=[],auditUsed=new Set(),ledgerUsed=new Set(),deferred=[];
for(const claim of sql.claims){
 const id=Number(claim.milestone_id),old=oldRows.get(id),next=newer.get(id);if(!next)continue;
 const server=mongo.servers[claim.server_id];assert(server);
 const event='webgm_recharge_'+hash([claim.account_name,claim.server_id,claim.milestone_id,claim.claim_period].join('|'));
 const ds=sql.deliveries.filter(d=>d.kind==='recharge'&&d.account_name===claim.account_name&&d.server_id===claim.server_id&&Number(d.source_id)===id&&d.claim_period===claim.claim_period);
 assert(ds.length<=1);
 const audits=sql.audit.filter(a=>a.account_name===claim.account_name&&a.server_id===claim.server_id&&a.details.startsWith(old.title+' => ')
  &&Math.abs(ts(a.created_at)-ts(claim.created_at))<=60000);
 const d=ds[0],audit=audits.length===1?audits[0]:null;
 const mails=server.mails.filter(m=>m.eventKey===event);assert(mails.length<=1);const mail=mails[0];
 const role=mail?.userId||d?.role_id||audit?.target_role_id;
 const player=server.players.find(p=>p.userId===role);assert(player&&player.accountId===claim.account_name&&Number(player.serverId)===Number(claim.server_id),'IDENTITY_CLAIM_'+claim.id+' roleFound='+!!player+' audits='+audits.length+' delivery='+ds.length);
 let map;if(d)map=attachments(JSON.parse(d.reward_snapshot).batches.flat());else if(audit){assert(!auditUsed.has(audit.id));auditUsed.add(audit.id);map=attachments(audit.details.split(' => ')[1]);}else throw Error('NO_AUDIT_'+claim.id);
 if(mail)assert.deepEqual(attachments(mail.attachments),map,'mail snapshot mismatch '+claim.id);
 const ledger=new Set(player.mailClaimLedger||[]);
 let mailId=mail?String(mail._id):null,proof='';
 if(mailId&&ledger.has(mailId))proof='mail_and_player_ledger';
 else if(mailId){held.push({claimId:Number(claim.id),accountId:player.accountId,userId:player.userId,serverId:Number(claim.server_id),reason:mail.claimed?'MAIL_CLAIMED_WITHOUT_PLAYER_LEDGER':'MAIL_NOT_CLAIMED',skill:map[5]||0,baozi:map[4]||0});continue;}
 else{
   const times=[ts(claim.created_at),audit?ts(audit.created_at):0].filter(Boolean);
   const available=[...ledger].filter(mid=>/^[a-f0-9]{24}$/.test(mid)&&!server.mails.some(m=>String(m._id)===mid)&&!ledgerUsed.has(mid)
    &&times.some(t=>Math.abs(parseInt(mid.slice(0,8),16)*1000-t)<=2000));
   if(available.length!==1){deferred.push({claim,old,next,map,player,audit,event,available});continue;}
   mailId=available[0];proof='audit_snapshot_and_unique_deleted_mail_ledger';
 }
 assert(!ledgerUsed.has(mailId));ledgerUsed.add(mailId);
 const skill=Number(map[5]||0);assert(skill%10===0);
 const baoziDelta=old.period_type==='week'&&Number(old.milestone_amount)>=400000?Math.max(0,Number(next[4]||0)-Number(map[4]||0)):0;
 entries.push({claimId:Number(claim.id),milestoneId:id,period:claim.claim_period,periodType:old.period_type,milestoneAmount:Number(old.milestone_amount),accountId:player.accountId,userId:player.userId,playerId:player.playerId,serverId:Number(claim.server_id),name:player.name,mailId,eventKey:event,auditId:audit?Number(audit.id):null,proof,skill,chicken:skill/10,baoziDelta});
}
function resolveDeleted(d,mid,proof,groupIds){
 const {claim,old,next,map,player,audit,event}=d;const skill=Number(map[5]||0);assert(skill%10===0);assert(!ledgerUsed.has(mid));ledgerUsed.add(mid);
 entries.push({claimId:Number(claim.id),milestoneId:Number(claim.milestone_id),period:claim.claim_period,periodType:old.period_type,milestoneAmount:Number(old.milestone_amount),accountId:player.accountId,userId:player.userId,playerId:player.playerId,serverId:Number(claim.server_id),name:player.name,mailId:mid,eventKey:event,auditId:Number(audit.id),proof,groupLedgerIds:groupIds,skill,chicken:skill/10,baoziDelta:old.period_type==='week'&&Number(old.milestone_amount)>=400000?Math.max(0,Number(next[4]||0)-Number(map[4]||0)):0});
}
let todo=deferred.slice(),progress=true;
while(progress){progress=false;for(const d of todo.slice()){const possible=d.available.filter(x=>!ledgerUsed.has(x));if(possible.length===1){resolveDeleted(d,possible[0],'audit_snapshot_and_eliminated_unique_deleted_ledger');todo=todo.filter(x=>x!==d);progress=true;}}}
// Dense bursts can have interchangeable deleted mail timestamps. Only accept a
// closed connected component: exactly N distinct consumed ledger IDs for N
// audited grants of this SAME role. Per-role sum is proven, not per-mail order.
while(todo.length){const first=todo.shift(),group=[first],ids=new Set(first.available.filter(x=>!ledgerUsed.has(x)));let changed=true;
 while(changed){changed=false;for(const d of todo.slice()){if(d.player.userId===first.player.userId&&d.available.some(x=>ids.has(x))){group.push(d);d.available.filter(x=>!ledgerUsed.has(x)).forEach(x=>ids.add(x));todo=todo.filter(x=>x!==d);changed=true;}}}
 const mids=[...ids].sort(),claimRows=group.sort((a,b)=>Number(a.claim.id)-Number(b.claim.id));
 if(mids.length===group.length&&mids.length>0){for(let i=0;i<group.length;i++)resolveDeleted(claimRows[i],mids[i],'audit_and_closed_consumed_ledger_group',mids);}
 else for(const d of group)held.push({claimId:Number(d.claim.id),accountId:d.player.accountId,userId:d.player.userId,serverId:Number(d.claim.server_id),reason:'DELETED_MAIL_LEDGER_AMBIGUOUS',candidates:mids.length,claims:group.length,skill:d.map[5]||0,baozi:d.map[4]||0});
}
const targets=new Map();
for(const e of entries){let t=targets.get(e.userId);if(!t){t={accountId:e.accountId,userId:e.userId,playerId:e.playerId,serverId:e.serverId,name:e.name,skill:0,chicken:0,baoziDelta:0,claims:[]};targets.set(e.userId,t);}t.skill+=e.skill;t.chicken+=e.chicken;t.baoziDelta+=e.baoziDelta;t.claims.push({claimId:e.claimId,mailId:e.mailId,skill:e.skill,chicken:e.chicken,baoziDelta:e.baoziDelta});}
const rows=[...targets.values()];for(const r of rows){const p=mongo.servers[r.serverId].players.find(p=>p.userId===r.userId);r.observedSkill=Number(p.items?.[5]||0);r.enough=r.observedSkill>=r.skill;}
const evidenceSha256=hash({sql:hash(fs.readFileSync(path.join(root,'sql-cutoff.json'),'utf8')),mongo:hash(fs.readFileSync(path.join(root,'mongo-cutoff.json'),'utf8')),entries});
const plan={incident:'donate_revision_20260907',evidenceSha256,cutoffClaimId:changes.cutoffClaimId,rows,entries,held};
fs.writeFileSync(path.join(root,'recovery-plan.json'),JSON.stringify(plan,null,2));
console.log(JSON.stringify({rows:rows.length,entries:entries.length,held:held.map(({accountId,userId,...r})=>r),skill:rows.reduce((s,r)=>s+r.skill,0),chicken:rows.reduce((s,r)=>s+r.chicken,0),baoziDelta:rows.reduce((s,r)=>s+r.baoziDelta,0),insufficient:rows.filter(r=>!r.enough).length},null,2));
