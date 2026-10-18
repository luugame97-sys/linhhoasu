'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'_ai_workbench/temp/spirit_grade1000_20260913');
const cfg=require(path.join(root,'linhhoasu/lhs/newServer/src/services/ConfigService'));
const tables=cfg.decodeTables(fs.readFileSync(path.join(out,'server.next.bin'))),t=tables.SpiritGradeConfig;
const source=fs.readFileSync(path.join(out,'spirit.next.js'),'utf8');
const start=source.indexOf('function applySingleUpgrade('),end=source.indexOf('function shouldForceGradeUpFromState',start);
const norm=a=>a||{},int=(x,d=0)=>Number.isFinite(Number(x))?Math.floor(Number(x)):d;
const ctx={getSpiritGradeConfigMap:()=>t,getMaxSpiritRank:()=>1000,toSafeInt:int,
 meetsAttrsTarget:(a,b)=>Object.keys(b).length>0&&Object.keys(b).every(k=>(a[k]||0)>=b[k]),
 hasEnoughItemOrCurrency:(p,id,n)=>(p.items[id]||0)>=n,consumeItemOrCurrency:(p,id,n)=>{p.items[id]-=n;return true;},
 isSpiritGradeFailOpenEnabled:()=>false,isSpiritLevelFailOpenEnabled:()=>false,
 addAttrs:(a,b)=>{for(const k of Object.keys(b))a[k]=(a[k]||0)+b[k];},
 clampAttrsToTarget:(a,b)=>{for(const k of Object.keys(b))a[k]=Math.min(a[k]||0,b[k]);},logger:{info(){}},Math};
vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
let cases=0,total60=0,total61=0;
for(let g=1;g<=1000;g++){
 const r=t[g],n=r.addAttrs[1]/r.addLevelAttrs[1];assert(Number.isSafeInteger(n));
 const player={items:{60:1e12,61:1e12}},info={rank:g,attrs:{}};
 assert.equal(ctx.applySingleUpgrade(player,info,true).updated,false,'SKIP '+g);cases++;
 assert.equal(player.items[61],1e12);
 assert.equal(ctx.applySingleUpgrade(player,info,false).updated,true);
 assert.equal(player.items[60],1e12-r.levelConsume.count);cases++;
 for(const k of Object.keys(r.addAttrs))info.attrs[k]=r.addAttrs[k]-r.addLevelAttrs[k];
 const before60=player.items[60],before61=player.items[61];
 assert.equal(ctx.applySingleUpgrade(player,info,false).updated,true);cases++;
 assert.equal(player.items[60],before60-r.levelConsume.count);
 if(g<1000){assert.equal(info.rank,g+1);assert.equal(player.items[61],before61-r.gradeConsume.count);total61+=r.gradeConsume.count;}
 else{assert.equal(info.rank,1000);assert.deepEqual(info.attrs,r.addAttrs);assert.equal(ctx.applySingleUpgrade(player,info,false).blocked,'max');}
 total60+=n*r.levelConsume.count;
 if(g<1000){const full={rank:g,attrs:{...r.addAttrs}},p={items:{60:10000,61:0}};assert.equal(ctx.applySingleUpgrade(p,full,false).updated,false);assert.equal(p.items[60],10000);p.items[61]=r.gradeConsume.count;assert.equal(ctx.applySingleUpgrade(p,full,false).updated,true);assert.equal(p.items[60],10000);cases++;}
 if(g>=41)for(const k of Object.keys(r.fullAttrs))assert.equal(r.fullAttrs[k],t[g-1].fullAttrs[k]+t[g-1].addAttrs[k]);
}
const build=JSON.parse(fs.readFileSync(path.join(out,'build.json')));assert.equal(total60,build.fromStart.item60);assert.equal(total61,build.fromStart.item61);
// Candidate retains every unrelated compressed frame byte, including Formation 1000.
const {decode}=require('./build_fishing_rank_x10_20260907');
for(const n of ['server','client','client-fashion']){const a=decode(fs.readFileSync(path.join(out,n+'.before.bin'))),b=decode(fs.readFileSync(path.join(out,n+'.next.bin')));for(let i=0;i<a.length;i++)if(a[i].name!=='SpiritGradeConfig')assert(a[i].raw.equals(b[i].raw));assert.deepEqual(b.find(x=>x.name==='SpiritGradeConfig').value,t);}
// Native UI expressions: same no-next-row + full-bar criterion used by SpiritMainView.
assert(!t[1001]);assert(t[40].gradeConsume.count===600);assert.equal(t[1000].gradeConsume,undefined);
const result={result:'PASS',cases,total60,total61,oldGradesPreserved:'1-39 exact;40 only adds bridge cost',unrelatedTablesByteExact:true,nativePlayerE2E:false};
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
