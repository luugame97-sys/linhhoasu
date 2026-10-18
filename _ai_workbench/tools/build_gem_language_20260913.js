'use strict';
const fs=require('fs'),path=require('path'),{decode,encode}=require('./build_fishing_rank_x10_20260907');
const dir=path.resolve(__dirname,'../temp/gem_level100_20260913'),file=path.join(dir,'lang.before.bin'),frames=decode(fs.readFileSync(file)),f=frames.find(x=>x.name==='LanguageConfig');
for(const type of [23,24,25,26,27,28])for(let level=11;level<=100;level++){const id=25000+(level-1)*10+(type-22);f.value[id]={cn:`Hồn ngọc loại ${type} - Cấp ${level}`};}
f.raw=encode('LanguageConfig',f.value);fs.writeFileSync(path.join(dir,'lang.next.bin'),Buffer.concat(frames.map(x=>x.raw)));console.log(JSON.stringify({result:'PASS',rows:Object.keys(f.value).length,bytes:fs.statSync(path.join(dir,'lang.next.bin')).size}));
