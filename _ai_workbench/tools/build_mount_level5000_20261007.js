'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const {decode,encode}=require('../tools/build_fishing_rank_x10_20260907');
const root=path.resolve(__dirname,'../temp/mount_level5000_20261007'),before=path.join(root,'before'),next=path.join(root,'next');
const factors={2:10,3:20,4:50,6:100,7:200};
const slopes={2:20,3:25,4:30,6:40,7:50};
function clone(x){return JSON.parse(JSON.stringify(x));}
function sha(b){return crypto.createHash('sha256').update(b).digest('hex');}
function numericKeys(o){return Object.keys(o).map(Number).sort((a,b)=>a-b);}
function build(input){
 const bytes=fs.readFileSync(input), frames=decode(bytes), frame=frames.find(x=>x.name==='SwordLevelConfig');
 assert(frame,'SwordLevelConfig missing'); const original=clone(frame.value), table=frame.value;
 for(const [qText,factor] of Object.entries(factors)){
  const q=Number(qText), levels=table[q]||table[qText]; assert(levels,`quality ${q} missing`);
  const keys=numericKeys(levels); assert.deepEqual(keys,Array.from({length:1000},(_,i)=>i+1),`quality ${q} baseline keys`);
  for(let l=1;l<=999;l++) assert.deepEqual(levels[l],original[q][l],`old row changed q${q} l${l}`);
  const terminal=clone(levels[1000]); assert.equal(terminal.level,1000); assert.equal(terminal.consumes.id,20);
  const lastDelta=(Number(levels[1000].attrs[51])-Number(levels[999].attrs[51])); assert.equal(lastDelta,slopes[q]);
  // Make the former terminal row payable for the 1000 -> 1001 step.
  levels[1000].consumes={id:20,count:factor*1000};
  assert.deepEqual(levels[1000].attrs,original[q][1000].attrs);
  for(let l=1001;l<=5000;l++){
   const row=clone(terminal); row.level=l;
   row.attrs=Object.fromEntries(Object.entries(terminal.attrs).map(([k,v])=>[k,Number(v)+(l-1000)*slopes[q]]));
   row.consumes={id:20,count:l===5000?0:factor*l};
   assert(Object.values(row.attrs).every(Number.isSafeInteger)); assert(Number.isSafeInteger(row.consumes.count));
   levels[l]=row;
  }
  assert.equal(levels[1000].consumes.count,factor*1000);
  assert.equal(levels[1001].consumes.count,factor*1001);
  assert.equal(levels[4999].consumes.count,factor*4999);
  assert.equal(levels[5000].consumes.count,0);
  assert.equal(levels[5000].attrs[51],Number(original[q][1000].attrs[51])+4000*slopes[q]);
 }
 const output=Buffer.concat(frames.map(x=>x===frame?encode(x.name,table):x.raw));
 const check=decode(output),after=check.find(x=>x.name==='SwordLevelConfig');
 assert(after); assert.deepEqual(numericKeys(after.value[2]),Array.from({length:5000},(_,i)=>i+1));
 for(const f of frames){const a=check.find(x=>x.name===f.name);assert(a,`missing ${f.name}`);if(f!==frame)assert(a.raw.equals(f.raw),`unrelated frame changed ${f.name}`);}
 return {output,table,old:original,beforeHash:sha(bytes),afterHash:sha(output),bytesBefore:bytes.length,bytesAfter:output.length};
}
if(require.main===module){
 fs.mkdirSync(next,{recursive:true}); let ref=null,results=[];
 for(const [name,file] of [['server','server.bin'],['client','client.bin'],['fashion','config_fashion_20260909.bin']]){
  const r=build(path.join(before,file)); if(ref) assert.deepEqual(r.table,ref,`SwordLevelConfig mismatch ${name}`); ref=r.table; fs.writeFileSync(path.join(next,name+'.bin'),r.output); results.push({name,beforeHash:r.beforeHash,afterHash:r.afterHash,bytesBefore:r.bytesBefore,bytesAfter:r.bytesAfter});
 }
 const index=fs.readFileSync(path.join(before,'index.html'),'utf8');
 const old=(index.match(/var translationVersion = '[^']+';/g)||[]); assert.equal(old.length,1);
 const nextIndex=index.replace(/var translationVersion = '[^']+';/,"var translationVersion = '20261007_mount_level5000_v1';"); assert.notEqual(nextIndex,index); fs.writeFileSync(path.join(next,'index.html'),nextIndex);
 const expected={2:{attr5000:100320,cost1000:10000,cost1001:10010,totalTo5000:124975000},3:{attr5000:125515,cost1000:20000,cost1001:20020,totalTo5000:249950000},4:{attr5000:150710,cost1000:50000,cost1001:50050,totalTo5000:624875000},6:{attr5000:201100,cost1000:100000,cost1001:100100,totalTo5000:1249750000},7:{attr5000:251490,cost1000:200000,cost1001:200200,totalTo5000:2499500000}};
 const report={result:'PASS',version:'mount_level5000_v1',oldMax:1000,max:5000,qualities:Object.keys(factors).map(Number),factors,slopes,expected,results}; fs.writeFileSync(path.join(root,'build.json'),JSON.stringify(report,null,2)+'\n'); console.log(JSON.stringify(report,null,2));
}
module.exports={build,factors,slopes};

