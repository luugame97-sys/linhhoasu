'use strict';
const fs=require('fs');
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const client=new MongoClient('mongodb://127.0.0.1:27017');
const manifest=JSON.parse(fs.readFileSync('/linhhoasu/_ai_workbench/temp/skin2026lhs_manifest_web.json','utf8'));
const allFashion=new Set((manifest.groups.fashion_all||[]).map(Number));
const uid='u_Wk_1001_d7b1ec_1787996263464';
function keys(v){return v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).map(Number).filter(Number.isFinite):[];}
(async()=>{await client.connect();try{const db=client.db('lhs_s1001');const p=await db.collection('players').findOne({userId:uid});if(!p||p.accountId!=='vanduc97')throw Error('ADMIN_PLAYER_IDENTITY_MISMATCH');const owned=new Set(keys(p.fashionInfo&&p.fashionInfo.fashions));const activated=new Set(Array.isArray(p.fashionInfo&&p.fashionInfo.activateFashion)?p.fashionInfo.activateFashion.map(Number):[]);const missing=[...allFashion].filter(id=>!owned.has(id)).sort((a,b)=>a-b);const ownedFashion=[...allFashion].filter(id=>owned.has(id)).sort((a,b)=>a-b);const overlapActivated=[...allFashion].filter(id=>activated.has(id)).length;console.log(JSON.stringify({accountId:p.accountId,name:p.name,serverId:p.serverId,userId:p.userId,playerId:p.playerId,manifestFashionCount:allFashion.size,ownedFashionCount:ownedFashion.length,missingCount:missing.length,missing,activatedFashionCount:overlapActivated,updatedAt:p.updatedAt},null,2));}finally{await client.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1});
