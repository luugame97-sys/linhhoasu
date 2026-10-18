'use strict';
const fs=require('fs');
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const manifest=JSON.parse(fs.readFileSync('/linhhoasu/_ai_workbench/temp/skin2026lhs_gap_manifest.json','utf8'));
const backup='/linhhoasu/_ai_workbench/backups/skin2026lhs_incident_20261003_093643';
const client=new MongoClient('mongodb://127.0.0.1:27017');
function ids(v){return v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).map(Number).filter(Number.isFinite):[];}
(async()=>{await client.connect();try{const db=client.db('lhs_s1001');const p=await db.collection('players').findOne({userId:manifest.userId});if(!p||p.accountId!==manifest.accountId||p.name!==manifest.roleName)throw Error('ADMIN_PLAYER_IDENTITY_MISMATCH');const owned=new Set(ids(p.fashionInfo&&p.fashionInfo.fashions));const missing=manifest.fashionIds.filter(id=>!owned.has(id));if(JSON.stringify(missing)!==JSON.stringify(manifest.missingIds))throw Error('FASHION_GAP_CHANGED_REAUDIT_REQUIRED');fs.writeFileSync(backup+'/vanduc97_gap_preimage.json',JSON.stringify({at:new Date().toISOString(),manifest,player:p},null,2),{flag:'wx',mode:0o600});const out={at:new Date().toISOString(),accountId:p.accountId,roleName:p.name,userId:p.userId,playerId:p.playerId,expectedMissing:manifest.missingIds.length,currentMissing:missing.length,playerUpdatedAt:p.updatedAt,backup};fs.writeFileSync(backup+'/gap_preflight.json',JSON.stringify(out,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify(out,null,2));}finally{await client.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1});
