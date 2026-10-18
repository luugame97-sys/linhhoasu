'use strict';
const fs=require('fs'),path=require('path'),{decode,encode}=require('./build_fishing_rank_x10_20260907');
const dir=path.resolve(__dirname,'../temp/gem_level100_20260913'),file=path.join(dir,'lang.next.bin'),frames=decode(fs.readFileSync(file)),f=frames.find(x=>x.name==='LanguageConfig');
const names={23:'sinh mệnh tấn công',24:'sinh mệnh thủ',25:'sinh mệnh tốc độ',26:'tấn công thủ',27:'tốc độ tấn công',28:'thủ tốc độ'};
for(const type of Object.keys(names))for(let level=11;level<=100;level++){const id=25000+(level-1)*10+(Number(type)-22);f.value[id]={cn:`Hồn ngọc ${names[type]} cấp ${level}`};}
f.raw=encode('LanguageConfig',f.value);fs.writeFileSync(file,Buffer.concat(frames.map(x=>x.raw)));
console.log(JSON.stringify({result:'PASS',sample:{'25101':f.value[25101],'25105':f.value[25105],'25106':f.value[25106],'25291':f.value[25291]}}));
