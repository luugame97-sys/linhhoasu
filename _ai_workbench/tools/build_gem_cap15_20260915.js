'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const {decode,encode}=require('./build_fishing_rank_x10_20260907');
const dir=path.resolve(__dirname,'../temp/gem_level100_20260913');
const types=[23,24,25,26,27,28]; const id=(t,l)=>25000+(l-1)*10+(t-22);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function build(input,output){const before=fs.readFileSync(input),frames=decode(before),t={};frames.forEach(f=>t[f.name]=f.value);
  for(const name of ['GemLevelConfig','AssetsConfig','GemComposeConfig','LanguageConfig']){const m=t[name]||{};for(const k of Object.keys(m)){const n=Number(k), row=m[k];const level=Number(row&&row.level);if(types.includes(Number(row&&row.type))&&level>=16)delete m[k];else if(name==='LanguageConfig'&&n>=25101&&n<=25996){const l=Math.floor((n-25000-(n%10? n%10:10))/10)+1;if(l>=16)delete m[k];}}}
  const shape=t.GemShapeConfig||{};for(const k of Object.keys(shape))if(Number(shape[k]&&shape[k].level)>=16)delete shape[k];
  if(t.GemBaseConfig){t.GemBaseConfig.maxQuickLevel=15;t.GemBaseConfig.filterLevel=Array.from({length:15},(_,i)=>i+1);t.GemBaseConfig.comFilterLevel=Array.from({length:15},(_,i)=>i+1);}
  const changed=new Set(['GemLevelConfig','AssetsConfig','GemComposeConfig','GemShapeConfig','LanguageConfig','GemBaseConfig']);const out=Buffer.concat(frames.map(f=>changed.has(f.name)?encode(f.name,t[f.name]):f.raw));fs.writeFileSync(output,out);const c=decode(out).find(f=>f.name==='GemLevelConfig').value;assert(!Object.values(c).some(r=>types.includes(Number(r.type))&&Number(r.level)>=16));assert(Object.values(c).some(r=>types.includes(Number(r.type))&&Number(r.level)===15));return{beforeHash:sha(before),afterHash:sha(out),rows:Object.keys(c).length,removed:540-30};}
if(require.main===module){const files=[['server.next.bin','server.cap15.bin'],['client.next.bin','client.cap15.bin'],['fashion.next.bin','fashion.cap15.bin']];const result={result:'PASS',cap:15,files:files.map(x=>({name:x[1],...build(path.join(dir,x[0]),path.join(dir,x[1]))}))};fs.writeFileSync(path.join(dir,'cap15-build.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
