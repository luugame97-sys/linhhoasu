'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const {decode,encode}=require('./build_fishing_rank_x10_20260907');
const WORK=path.resolve(__dirname,'../..'),ROOT=path.join(WORK,'_ai_workbench/temp/fishing_rank_x10_20260907');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function language(source){
 const bytes=fs.readFileSync(source),rows=decode(bytes),table=rows.find(r=>r.name==='LanguageConfig');assert(table);
 const before=JSON.parse(JSON.stringify(table.value));const old=table.value[10000119].cn;assert.equal((old.match(/20%/g)||[]).length,1);
 table.value[10000119].cn=old.replace('20%','2%');const output=Buffer.concat(rows.map(r=>r===table?encode(r.name,r.value):r.raw));
 const after=decode(output);assert.deepEqual(after.find(r=>r.name==='LanguageConfig').value,table.value);
 const restored=JSON.parse(JSON.stringify(table.value));restored[10000119].cn=old;assert.deepEqual(restored,before);
 return {output,beforeHash:hash(bytes),afterHash:hash(output),description:table.value[10000119].cn};
}
const results=[];
for(const [name,source]of [['lang',path.join(ROOT,'lang.before.bin')],['lang.local',path.join(WORK,'linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin')]]){
 const r=language(source);fs.writeFileSync(path.join(ROOT,name+'.next.bin'),r.output);results.push({name,beforeHash:r.beforeHash,afterHash:r.afterHash,description:r.description});
}
const before=JSON.parse(fs.readFileSync(path.join(ROOT,'economy.before.json')));assert.equal(before.currency.saleChanceBps,2000);
const after=JSON.parse(fs.readFileSync(path.join(WORK,'linhhoasu/lhs/newServer/src/config/fishingEconomy.json')));assert.equal(after.currency.saleChanceBps,200);
const compare=JSON.parse(JSON.stringify(after));compare.currency.saleChanceBps=2000;compare.version=before.version;assert.deepEqual(compare,before,'OUT_OF_SCOPE_ECONOMY_CHANGE');
fs.copyFileSync(path.join(WORK,'linhhoasu/lhs/newServer/src/config/fishingEconomy.json'),path.join(ROOT,'economy.next.json'));
let index=fs.readFileSync(path.join(ROOT,'index.before.html'),'utf8');index=index.replace(/var translationVersion = '[^']+';/,"var translationVersion = '20260907_fishing_rank10_coin2_v1';");fs.writeFileSync(path.join(ROOT,'index.next.html'),index);
const result={result:'PASS',currency:{beforeBps:2000,afterBps:200,min:after.currency.min,max:after.currency.max,bonusBps:after.currency.bonusBps},results,economyHash:hash(fs.readFileSync(path.join(ROOT,'economy.next.json')))};
fs.writeFileSync(path.join(ROOT,'currency-build.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
