'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'../temp/donate_revision_20260907');
const sql=JSON.parse(fs.readFileSync(path.join(root,'sql-before.json'),'utf8'));
const mongo=JSON.parse(fs.readFileSync(path.join(root,'mongo-before.json'),'utf8'));
if(fs.existsSync(path.join(root,'players-expanded.json'))){const expanded=JSON.parse(fs.readFileSync(path.join(root,'players-expanded.json'),'utf8'));for(const[s,v]of Object.entries(expanded))mongo.servers[s].players=v.players;}
const milestones=new Map(sql.milestones.map(r=>[Number(r.id),r]));
const key=(a,s,id,p)=>'webgm_recharge_'+crypto.createHash('sha256').update([a,s,id,p].join('|')).digest('hex');
const counts={claims:sql.claims.length,exactMail:0,noMail:0,delivery:0,oldAudit:0,auditMatch:0,unclaimed:0,claimed:0,unknownMilestone:0};
const rows=[];
for(const c of sql.claims){
 const m=milestones.get(Number(c.milestone_id));if(!m){counts.unknownMilestone++;continue;}
 const server=mongo.servers[c.server_id];if(!server)continue;
 const event=key(c.account_name,c.server_id,c.milestone_id,c.claim_period);
 const mails=server.mails.filter(r=>r.eventKey===event);
 const d=sql.deliveries.find(r=>r.account_name===c.account_name&&r.server_id===c.server_id&&Number(r.source_id)===Number(c.milestone_id)&&r.claim_period===c.claim_period);
 let audits=sql.audit.filter(r=>r.account_name===c.account_name&&r.server_id===c.server_id&&r.details.startsWith(m.title+' => '));
 if(!audits.length)audits=sql.audit.filter(r=>r.account_name===c.account_name&&r.server_id===c.server_id&&Math.abs(Date.parse(r.created_at.replace(' ','T')+'+07:00')-Date.parse(c.created_at.replace(' ','T')+'+07:00'))<3000);
 audits=audits.filter(r=>Math.abs(Date.parse(r.created_at.replace(' ','T')+'+07:00')-Date.parse(c.created_at.replace(' ','T')+'+07:00'))<10000);
 const audit=audits.length===1?audits[0]:null;
 if(d)counts.delivery++;if(audit)counts.auditMatch++;
 if(mails.length)counts.exactMail++;else counts.noMail++;
 const mail=mails.length===1?mails[0]:null;
 const player=mail?server.players.find(p=>p.userId===mail.userId):null;
 if(mail){if(mail.claimed||(player?.mailClaimLedger||[]).includes(String(mail._id)))counts.claimed++;else counts.unclaimed++;}
 const attachments=mail?mail.attachments:d?JSON.parse(d.reward_snapshot).batches.flat():audit&&audit.details.includes(' => ')?JSON.parse(audit.details.split(' => ')[1]):null;
 rows.push({claimId:Number(c.id),accountId:c.account_name,serverId:Number(c.server_id),milestoneId:Number(m.id),period:c.claim_period,periodType:m.period_type,amount:Number(m.milestone_amount),eventKey:event,
  claimedAt:c.created_at,mailId:mail?String(mail._id):null,mailClaimed:mail?!!mail.claimed:null,mailLedger:mail?!!player?.mailClaimLedger?.includes(String(mail._id)):false,roleId:mail?.userId||d?.role_id||audit?.target_role_id||null,
  attachments,attachmentSource:mail?'mail':d?'outbox':audit?'audit':null,auditCandidates:audits.length,auditId:audit?Number(audit.id):null,mailCount:mails.length});
}
const totals={};for(const row of rows){const k=row.serverId+'|'+row.accountId;if(!totals[k])totals[k]={serverId:row.serverId,accountId:row.accountId,skill:0,claimedSkill:0,unclaimedSkill:0,unknownSkill:0,baoziDelta:0,claims:0,missing:0};const t=totals[k];t.claims++;if(!row.attachments){t.missing++;continue;}
 const map=Array.isArray(row.attachments)?Object.fromEntries(row.attachments.map(i=>[i.id||i.item_id,Number(i.count??i.amount)])):row.attachments;
 const skill=Number(map[5]||0);t.skill+=skill;if(row.mailClaimed||row.mailLedger)t.claimedSkill+=skill;else if(row.mailId)t.unclaimedSkill+=skill;else t.unknownSkill+=skill;
 if(row.periodType==='week'&&row.amount>=400000){const newQty=Number(JSON.parse(milestones.get(row.milestoneId).reward_items)[4]||0)*10;t.baoziDelta+=Math.max(0,newQty-Number(map[4]||0));}}
for(const t of Object.values(totals)){const p=mongo.servers[t.serverId].players.find(p=>p.accountId===t.accountId);t.skillBalance=p?.items?.[5]??null;t.balanceSufficient=t.skillBalance!==null&&t.skillBalance>=t.skill;}
const result={counts,auditFormat:sql.audit.reduce((a,r)=>{const k=r.details.includes(' => ')?'snapshot':'delivery-id';a[k]=(a[k]||0)+1;return a;},{}),playerCount:Object.keys(totals).length,rows,totals:Object.values(totals)};
fs.writeFileSync(path.join(root,'correlation-preview.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({counts,auditFormat:result.auditFormat,playerCount:result.playerCount,players:Object.values(totals).map(({accountId,...r})=>r),missingExamples:rows.filter(r=>!r.attachments).slice(0,6).map(({claimId,periodType,amount,auditCandidates})=>({claimId,periodType,amount,auditCandidates}))},null,2));
