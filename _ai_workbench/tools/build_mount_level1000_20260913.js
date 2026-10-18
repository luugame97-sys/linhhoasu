'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {decode,encode}=require('./build_fishing_rank_x10_20260907');
const dir=path.resolve(__dirname,'../temp/mount_level1000_20260913');
const factors={2:10,3:20,4:50,6:100,7:200};
function build(bytes){
 const frames=decode(bytes),frame=frames.find(x=>x.name==='SwordLevelConfig');
 const table=JSON.parse(JSON.stringify(frame.value));
 for(const [q,factor]of Object.entries(factors)){
  const levels=table[q];assert.equal(Object.keys(levels).length,150);
  const last=levels[150],prev=levels[149];assert.equal(last.consumes.count,0);
  for(let l=1;l<150;l++){assert.equal(levels[l].consumes.id,20);assert.equal(levels[l].consumes.count,factor*l);}
  levels[150]={...last,consumes:{id:20,count:150*factor}};
  for(let l=151;l<=1000;l++)levels[l]={...last,level:l,attrs:Object.fromEntries(Object.keys(last.attrs).map(k=>[k,last.attrs[k]+(l-150)*(last.attrs[k]-prev.attrs[k])])),consumes:{id:20,count:l===1000?0:l*factor}};
  for(let l=1;l<150;l++)assert.deepEqual(levels[l],frame.value[q][l]);
  assert.deepEqual(levels[150].attrs,frame.value[q][150].attrs);
 }
 const output=Buffer.concat(frames.map(x=>x===frame?encode(x.name,table):x.raw)),check=decode(output);
 for(let i=0;i<frames.length;i++){assert.equal(check[i].name,frames[i].name);if(frames[i]!==frame)assert(check[i].raw.equals(frames[i].raw));}
 assert.deepEqual(check.find(x=>x.name==='SwordLevelConfig').value,table);
 return{output,table};
}
if(require.main===module){fs.mkdirSync(path.join(dir,'next'),{recursive:true});let table;for(const n of ['server.bin','client.bin','fashion.bin']){const r=build(fs.readFileSync(path.join(dir,'before',n)));if(table)assert.deepEqual(table,r.table);table=r.table;fs.writeFileSync(path.join(dir,'next',n),r.output);}
 const costs=Object.entries(factors).map(([quality,f])=>({quality:+quality,from150:488325*f,from1:499500*f,lastUpgrade:999*f}));
 fs.writeFileSync(path.join(dir,'build.json'),JSON.stringify({result:'PASS',oldMax:150,max:1000,stars:40,costs},null,2));console.log(JSON.stringify(costs));}
module.exports={build,factors};
