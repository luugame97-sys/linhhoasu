'use strict';
// Generated binary merge: preserve unrelated local config tables byte-for-byte.
const fs=require('fs'),path=require('path'),z=require('zlib'),assert=require('assert/strict'),crypto=require('crypto');
const{BinJsonUtil:B,ByteArray:A}=require(path.resolve('linhhoasu/lhs/newServer/src/protocol/BinJsonUtil'));
const base=path.resolve('_ai_workbench/temp/fishing_audit_20260906T212212Z'),root=path.resolve('_ai_workbench/temp/fishing_economy_20260907'),backup=path.resolve('_ai_workbench/backups/fishing_economy_local_20260907');
function decode(file){const b=fs.readFileSync(file);let i=0,out=[];while(i<b.length){const start=i,n=b[i++],name=b.toString('utf8',i,i+n);i+=n;const len=b.readUInt32BE(i);i+=4;const x=z.inflateSync(b.subarray(i,i+len));i+=len;out.push({name,raw:b.subarray(start,i),value:B.readFullJson(new A(x))});}return out;}
const reports=[];
for(const[name,rel]of[['server.bin','linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin'],['client.bin','linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin'],['lang.bin','linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin']]){
 const local=decode(rel),before=decode(path.join(base,name)),next=decode(path.join(root,name)),allowed=name==='lang.bin'?['LanguageConfig']:['ShopConfig','Activity6RankConfig','AssetsConfig','AssetsUseConfig'];
 for(const k of allowed)assert.deepEqual(local.find(r=>r.name===k).value,before.find(r=>r.name===k).value,'LOCAL_CHANGED_TARGET '+k);
 const preserved=local.filter(r=>!allowed.includes(r.name)&&JSON.stringify(r.value)!==JSON.stringify(before.find(x=>x.name===r.name)?.value)).map(r=>r.name);
 const dest=path.join(backup,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(rel,dest);
 fs.writeFileSync(rel,Buffer.concat(local.map(r=>allowed.includes(r.name)?next.find(x=>x.name===r.name).raw:r.raw)));
 reports.push({path:rel,preservedDifferentTables:preserved,hash:crypto.createHash('sha256').update(fs.readFileSync(rel)).digest('hex')});
}
const ix='linhhoasu/webgame/game/index.html';assert.equal(fs.readFileSync(ix,'utf8').replace(/\r\n/g,'\n').trim(),fs.readFileSync(path.join(root,'index.before.html'),'utf8').replace(/\r\n/g,'\n').trim());
fs.copyFileSync(ix,path.join(backup,'index.before.html'));fs.copyFileSync(path.join(root,'index.fixed.html'),ix);
fs.writeFileSync(path.join(root,'local-bin-sync.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
