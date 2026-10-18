'use strict';
// Exact table-only binary rewrite. Baseline quantities prevent multiplying twice.
const fs=require('fs'),path=require('path'),zlib=require('zlib'),assert=require('assert/strict'),crypto=require('crypto');
const WORK=path.resolve(__dirname,'../..'),ROOT=path.join(WORK,'_ai_workbench/temp/fishing_rank_x10_20260907');
const {BinJsonUtil:B,ByteArray:A}=require(path.join(WORK,'linhhoasu/lhs/newServer/src/protocol/BinJsonUtil'));
const beforeCounts={1:1000000,2:800000,3:600000,4:500000,11:400000,51:350000,101:300000,501:200000};
function hash(b){return crypto.createHash('sha256').update(b).digest('hex');}
function decode(b){let p=0,rows=[];while(p<b.length){const start=p,n=b[p++],name=b.toString('utf8',p,p+n);p+=n;const len=b.readUInt32BE(p);p+=4;const x=zlib.inflateSync(b.subarray(p,p+len));p+=len;rows.push({name,value:B.readFullJson(new A(x.buffer.slice(x.byteOffset,x.byteOffset+x.byteLength))),raw:b.subarray(start,p)});}assert.equal(p,b.length);return rows;}
function encode(name,value){const a=new A(undefined,1024*1024);B.json2bin(value,a);const b=zlib.deflateSync(Buffer.from(a.buffer)),n=Buffer.from(name),h=Buffer.alloc(1+n.length+4);h[0]=n.length;n.copy(h,1);h.writeUInt32BE(b.length,n.length+1);return Buffer.concat([h,b]);}
function build(file){
 const bytes=fs.readFileSync(file),rows=decode(bytes),table=rows.find(r=>r.name==='Activity6RankConfig');assert(table);
 const original=JSON.parse(JSON.stringify(table.value)),target=table.value[6006];assert.deepEqual(Object.keys(target).sort(),Object.keys(beforeCounts).sort());let changed=0;
 for(const [key,row]of Object.entries(target)){assert.equal(row.rankMin,Number(key));for(const id of [1,6]){const matches=row.rewards.filter(r=>r.id===id);assert.equal(matches.length,1);assert.equal(matches[0].count,beforeCounts[key],'BASELINE_MISMATCH_'+key+'_'+id);matches[0].count=beforeCounts[key]*10;assert(Number.isSafeInteger(matches[0].count));changed++;}}
 const output=Buffer.concat(rows.map(r=>r===table?encode(r.name,r.value):r.raw)),after=decode(output);assert.equal(changed,16);assert.equal(rows.length,714);
 for(let i=0;i<rows.length;i++){assert.equal(after[i].name,rows[i].name);assert.deepEqual(after[i].value,rows[i].value);if(rows[i]!==table)assert(after[i].raw.equals(rows[i].raw),'UNRELATED_BYTES_CHANGED');}
 const restored=JSON.parse(JSON.stringify(table.value));for(const row of Object.values(restored[6006]))for(const r of row.rewards)if([1,6].includes(r.id))r.count/=10;assert.deepEqual(restored,original,'OUT_OF_SCOPE_CHANGE');
 return {output,table:target,beforeHash:hash(bytes),afterHash:hash(output),changed,tables:rows.length};
}
if(require.main===module){
 const results=[];let reference;
 for(const name of ['server','client']){const r=build(path.join(ROOT,name+'.before.bin'));fs.writeFileSync(path.join(ROOT,name+'.next.bin'),r.output);if(reference)assert.deepEqual(r.table,reference);reference=r.table;results.push({name,beforeHash:r.beforeHash,afterHash:r.afterHash,changed:r.changed,tables:r.tables});}
 // Preserve any independent local table drift (notably SystemConfig).
 for(const [name,rel]of [['server','linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin'],['client','linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin']]){
  const r=build(path.join(WORK,rel));assert.deepEqual(r.table,reference);fs.writeFileSync(path.join(ROOT,name+'.local-next.bin'),r.output);results.push({name:'local-'+name,path:rel,beforeHash:r.beforeHash,afterHash:r.afterHash});
 }
 const index=fs.readFileSync(path.join(ROOT,'index.before.html'),'utf8');assert.equal((index.match(/var translationVersion = '[^']+';/g)||[]).length,1);fs.writeFileSync(path.join(ROOT,'index.next.html'),index.replace(/var translationVersion = '[^']+';/,"var translationVersion = '20260907_fishing_rank_x10_v1';"));
 const result={result:'PASS',scope:'Activity6RankConfig[6006], item1+item6 only, x10 current quantities',results,rank:reference};fs.writeFileSync(path.join(ROOT,'build.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
module.exports={decode,build,encode};
