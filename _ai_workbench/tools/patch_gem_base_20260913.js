'use strict';
const fs=require('fs'),path=require('path'),{decode,encode}=require('./build_fishing_rank_x10_20260907');const d=path.resolve(__dirname,'../temp/gem_level100_20260913');
for(const n of ['server','client','fashion']){const file=path.join(d,n+'.next.bin'),frames=decode(fs.readFileSync(file));const f=frames.find(x=>x.name==='GemBaseConfig');if(!f)throw Error('GemBaseConfig missing');f.value.maxQuickLevel=100;f.value.filterLevel=Array.from({length:100},(_,i)=>i+1);f.value.comFilterLevel=Array.from({length:100},(_,i)=>i+1);f.raw=encode(f.name,f.value);fs.writeFileSync(file,Buffer.concat(frames.map(x=>x.raw)));}
console.log('PASS GemBaseConfig maxQuickLevel=100 filter levels=100');
