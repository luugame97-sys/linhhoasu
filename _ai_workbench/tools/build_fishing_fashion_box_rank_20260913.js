'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'../..');
const {BinJsonUtil:B,ByteArray:A}=require(path.join(ROOT,'linhhoasu/lhs/newServer/src/protocol/BinJsonUtil'));
const TARGETS={
 server:'linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin',
 client:'linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin',
 fashion:'linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin',
};
const COUNTS={1:10,2:7,3:5,4:3,11:2,51:2,101:2,501:2};
function hash(b){return crypto.createHash('sha256').update(b).digest('hex');}
function decode(b){let p=0,out=[];while(p<b.length){const start=p,n=b[p++],name=b.toString('utf8',p,p+n);p+=n;const len=b.readUInt32BE(p);p+=4;const raw=zlib.inflateSync(b.subarray(p,p+len));p+=len;out.push({name,value:B.readFullJson(new A(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength))),raw:b.subarray(start,p)});}assert.equal(p,b.length);return out;}
function encode(name,value){const a=new A(undefined,1024*1024);B.json2bin(value,a);const body=zlib.deflateSync(Buffer.from(a.buffer));const n=Buffer.from(name),h=Buffer.alloc(1+n.length+4);h[0]=n.length;n.copy(h,1);h.writeUInt32BE(body.length,n.length+1);return Buffer.concat([h,body]);}
function build(file){const before=fs.readFileSync(file),parts=decode(before),row=parts.find(x=>x.name==='Activity6RankConfig');assert(row);const table=row.value?.[6006];assert(table);const changed=[];for(const [k,count] of Object.entries(COUNTS)){const r=table[k];assert(r&&r.rankMin===Number(k)&&r.rankMax>=r.rankMin,'RANK_BRACKET_'+k);const old=r.rewards.filter(x=>x.id===99002);if(old.length===1){assert.equal(old[0].count,count,'EXISTING_COUNT_MISMATCH_'+k);continue;}assert.equal(old.length,0,'DUPLICATE_99002_'+k);r.rewards.push({id:99002,count});changed.push({rank:k,count});}const output=Buffer.concat(parts.map(x=>x===row?encode(x.name,row.value):x.raw));const after=decode(output);assert.equal(after.length,parts.length);for(let i=0;i<parts.length;i++){assert.equal(after[i].name,parts[i].name);if(parts[i]!==row)assert(after[i].raw.equals(parts[i].raw),'UNRELATED_BYTES_CHANGED_'+parts[i].name);}return {output,beforeHash:hash(before),afterHash:hash(output),changed,tables:parts.length};}
if(require.main===module){const out={result:'PASS',scope:'Activity6RankConfig[6006], item99002 only',files:{}};for(const [name,rel] of Object.entries(TARGETS)){const file=path.join(ROOT,rel);const r=build(file);const next=path.join(ROOT,'_ai_workbench/temp/fishing_fashion_box_rank_20260913',name+'.next.bin');fs.mkdirSync(path.dirname(next),{recursive:true});fs.writeFileSync(next,r.output);out.files[name]={rel,beforeHash:r.beforeHash,afterHash:r.afterHash,changed:r.changed,tables:r.tables};}fs.writeFileSync(path.join(ROOT,'_ai_workbench/temp/fishing_fashion_box_rank_20260913/build.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));}
module.exports={decode,encode,build,TARGETS,COUNTS};
