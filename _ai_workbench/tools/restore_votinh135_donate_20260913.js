'use strict';
const fs=require('fs'),crypto=require('crypto'),mongoose=require('/linhhoasu/lhs/newServer/node_modules/mongoose');
const Player=require('/linhhoasu/lhs/newServer/src/db/models/Player');
const userId='u_Wk_1002_af2f6f_1788608815820',marker='votinh135RestoreDonate20260913';
const add={7:10500000,8:19000,20:1010000};
(async()=>{
 await mongoose.connect('mongodb://127.0.0.1:27017/lhs_s1002');
 try {
  const p=await Player.findOne({userId}).lean(); if(!p) throw Error('PLAYER_NOT_FOUND');
  const before=Object.fromEntries([7,8,20,60,61].map(i=>[i,Number(p.items?.[i]||0)]));
  if(p.moderation?.[marker]) throw Error('ALREADY_RESTORED');
  const backup='/linhhoasu/_ai_workbench/backups/votinh135_restore_20260913';fs.mkdirSync(backup,{recursive:true,mode:0o700});
  const file=backup+'/'+crypto.createHash('sha256').update(userId).digest('hex')+'.before.json';
  if(fs.existsSync(file)) throw Error('BACKUP_EXISTS');
  fs.writeFileSync(file,JSON.stringify({userId,before,add,at:new Date().toISOString()},null,2),{flag:'wx',mode:0o600});
  const q={userId};q['moderation.'+marker]={$exists:false};
  const inc={};for(const i of [7,8,20])inc['items.'+i]=add[i];
  const rec={incident:'votinh135_restore_donate_20260913',restored:add,before,target:Object.fromEntries([7,8,20].map(i=>[i,before[i]+add[i]])),at:new Date().toISOString()};
  const saved=await Player.findOneAndUpdate(q,{$inc:inc,$set:{['moderation.'+marker]:rec}},{new:true}).lean();if(!saved)throw Error('CAS_FAILED');
  const after=Object.fromEntries([7,8,20,60,61].map(i=>[i,Number(saved.items?.[i]||0)]));console.log(JSON.stringify({result:'PASS',userId,before,restored:add,after,backup:file}));
 } finally { await mongoose.disconnect(); }
})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1});
