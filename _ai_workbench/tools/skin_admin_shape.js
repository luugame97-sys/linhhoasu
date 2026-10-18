'use strict';
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const c=new MongoClient('mongodb://127.0.0.1:27017');
function shape(v,d=0){if(d>4)return typeof v;if(Array.isArray(v))return {array:v.length,sample:v.slice(0,3).map(x=>shape(x,d+1))};if(v&&typeof v==='object'){const o={};for(const [k,x] of Object.entries(v).slice(0,80))o[k]=shape(x,d+1);return o;}return typeof v==='number'?'number':typeof v;}
(async()=>{await c.connect();try{const p=await c.db('lhs_s1001').collection('players').findOne({userId:'u_Wk_1001_d7b1ec_1787996263464'},{projection:{fashionInfo:1,artifactInfo:1,spiritInfo:1,swordInfo:1,items:1}});console.log(JSON.stringify({fashionInfo:shape(p.fashionInfo),artifactInfo:shape(p.artifactInfo),spiritInfo:shape(p.spiritInfo),swordInfo:shape(p.swordInfo),items:shape(p.items)},null,2));}finally{await c.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1});
