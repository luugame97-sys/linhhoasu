const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const {BSON}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const root='/linhhoasu/_ai_workbench/backups/arena_ledger_hardening_20260929_003556';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const result=[];
for(const rel of ['bson/manifest.json','cleanup_pre/bson/manifest.json','cleanup_pre/cleanup_receipt.json']){
 const file=root+'/'+rel,raw=fs.readFileSync(file,'utf8'),json=JSON.parse(raw.endsWith('\\n')?raw.slice(0,-2):raw);
 for(const item of json.files||[]){const bytes=fs.readFileSync(path.dirname(file)+'/'+item.db+'__'+item.id+'.bson');assert.equal(hash(bytes),item.sha256);assert.equal(hash(BSON.serialize(BSON.deserialize(bytes))),item.sha256);}
 const normalized=file.replace(/\.json$/,'.validated.json');const fd=fs.openSync(normalized,'wx',0o600);try{fs.writeSync(fd,JSON.stringify(json,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 result.push({file:normalized,sha256:hash(fs.readFileSync(normalized)),filesVerified:json.files?.length||0});
}
console.log(JSON.stringify(result,null,2));
