'use strict';
const fs=require('fs'),path=require('path'),{decode,encode}=require('./build_fishing_rank_x10_20260907');const d=path.resolve(__dirname,'../temp/gem_level100_20260913');
for(const n of ['server','client','fashion']){const file=path.join(d,n+'.next.bin'),frames=decode(fs.readFileSync(file)),t={};frames.forEach(f=>t[f.name]=f.value);const changed=new Set(['AssetsConfig']);for(const type of [23,24,25,26,27,28])for(let l=11;l<=100;l++){const id=25000+(l-1)*10+(type-22),base=25000+90+(type-22);if(t.AssetsConfig[id])t.AssetsConfig[id].icon='icon_'+base;}fs.writeFileSync(file,Buffer.concat(frames.map(f=>changed.has(f.name)?encode(f.name,t[f.name]):f.raw)));}
console.log('PASS new gem assets reuse existing level10 icon per type');
