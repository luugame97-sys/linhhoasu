'use strict';
const crypto=require('crypto'),fs=require('fs'),path=require('path');
const mongoose=require('/linhhoasu/lhs/newServer/node_modules/mongoose');
const Player=require('/linhhoasu/lhs/newServer/src/db/models/Player');
const Mail=require('/linhhoasu/lhs/newServer/src/db/models/Mail');
const rows=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const marker='donateCompRollback20260913';
const ids=[7,8,20,60,61];
function key(r){return 'webgm_recharge_'+crypto.createHash('sha256').update(r.account_name+'|'+r.server_id+'|'+r.source_id+'|'+r.claim_period).digest('hex');}
function sums(ms){const o={};for(const m of ms)for(const a of (m.attachments||[])){const id=String(a.id),q=Math.max(0,Number(a.count)||0);if(ids.includes(Number(id)))o[id]=(o[id]||0)+q;}return o;}
(async()=>{const out=[];const byServer={};for(const r of rows)(byServer[r.server_id]??=[]).push(r);for(const [server,list] of Object.entries(byServer)){await mongoose.connect('mongodb://127.0.0.1:27017/lhs_s'+server);try{for(const r of list){const k=key(r),ms=await Mail.find({userId:r.role_id,eventKey:k}).lean(),p=await Player.findOne({userId:r.role_id}).lean();if(!p){out.push({id:r.id,action:'manual',reason:'PLAYER_NOT_FOUND'});continue;}const claimed=ms.filter(m=>!!m.claimed),unclaimed=ms.filter(m=>!m.claimed);if(unclaimed.length){await Mail.deleteMany({userId:r.role_id,eventKey:k,claimed:{$ne:true}});out.push({id:r.id,action:'mail_revoked',mailCount:unclaimed.length});}
if(claimed.length){const need=sums(claimed),bal=Object.fromEntries(ids.map(i=>[i,Number(p.items?.[i]||0)]));const enough=ids.every(i=>(bal[i]||0)>=(need[String(i)]||0));if(enough&&!p.moderation?.[marker]){const inc={};for(const i of ids)if(need[String(i)])inc['items.'+i]=-need[String(i)];const q={userId:r.role_id};for(const i of ids)q['items.'+i]={'$gte':need[String(i)]||0};const rec={incident:'donate_comp_20260912',sourceId:Number(r.source_id),deliveryId:Number(r.id),items:need,appliedAt:new Date().toISOString()};const saved=await Player.findOneAndUpdate(q,{$inc:inc,$set:{['moderation.'+marker]:rec}},{new:true}).lean();if(saved){await Mail.deleteMany({userId:r.role_id,eventKey:k,claimed:true});out.push({id:r.id,action:'player_rolled_back',items:need});}else out.push({id:r.id,action:'manual',reason:'BALANCE_CHANGED'});}else out.push({id:r.id,action:'manual',reason:p.moderation?.[marker]?'ALREADY_ROLLED_BACK':'INSUFFICIENT_BALANCE',needed:need,balances:bal});}
if(!ms.length)out.push({id:r.id,action:'manual',reason:'MAIL_NOT_FOUND'});
}}finally{await mongoose.disconnect();}}console.log(JSON.stringify(out));})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1});
