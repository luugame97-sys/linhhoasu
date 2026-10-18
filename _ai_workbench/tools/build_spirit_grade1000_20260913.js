'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {decode,encode}=require('./build_fishing_rank_x10_20260907');
const out=path.resolve(__dirname,'../temp/spirit_grade1000_20260913');
const sha=b=>require('crypto').createHash('sha256').update(b).digest('hex');
function extend(old){
 assert.equal(Object.keys(old).length,40);
 const next=JSON.parse(JSON.stringify(old));
 next[40].gradeConsume={id:61,count:600};
 for(let g=41;g<=1000;g++){
  const d=g-40,prev=next[g-1],step={1:2200+50*d,2:264+6*d,3:44+d};
  next[g]={id:g,levelConsume:{id:60,count:225+6*d},
   addAttrs:Object.fromEntries(Object.entries(step).map(([k,v])=>[k,v*10*g])),
   addLevelAttrs:step,
   fullAttrs:Object.fromEntries(Object.keys(step).map(k=>[k,prev.fullAttrs[k]+prev.addAttrs[k]]))};
  if(g<1000)next[g].gradeConsume={id:61,count:600+58*d};
 }
 return next;
}
function build(input,output){
 const before=fs.readFileSync(input),rows=decode(before),r=rows.find(x=>x.name==='SpiritGradeConfig'),next=extend(r.value);
 const bytes=Buffer.concat(rows.map(x=>x===r?encode(x.name,next):x.raw));
 const decoded=decode(bytes);
 for(let i=0;i<rows.length;i++){
  assert.equal(rows[i].name,decoded[i].name);
  if(rows[i]!==r)assert(rows[i].raw.equals(decoded[i].raw),'UNRELATED_BYTES');
 }
 assert.deepEqual(decoded.find(x=>x.name===r.name).value,next);
 for(let g=1;g<=40;g++){const actual={...next[g]};if(g===40)delete actual.gradeConsume;assert.deepEqual(actual,r.value[g]);}
 fs.writeFileSync(output,bytes);return {beforeHash:sha(before),afterHash:sha(bytes),next};
}
function costs(t,first,last){let item60=0,item61=0;for(let g=first;g<=last;g++){
 const r=t[g],steps=Math.max(...Object.keys(r.addAttrs).map(k=>Math.ceil(r.addAttrs[k]/r.addLevelAttrs[k])));
 item60+=steps*r.levelConsume.count;if(g<last)item61+=r.gradeConsume.count;
 }return{item60,item61};}
if(require.main===module){
 const files=[];let table;
 for(const n of ['server','client','client-fashion']){const r=build(path.join(out,n+'.before.bin'),path.join(out,n+'.next.bin'));if(table)assert.deepEqual(table,r.next);table=r.next;files.push({name:n,beforeHash:r.beforeHash,afterHash:r.afterHash});}
 const result={result:'PASS',files,grade40:table[40],grade41:table[41],grade1000:table[1000],
  fromReached40:costs(table,40,1000),fromFull40:{...costs(table,40,1000),item60:costs(table,40,1000).item60-90000},fromStart:costs(table,1,1000)};
 fs.writeFileSync(path.join(out,'build.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
module.exports={extend,build,costs};
