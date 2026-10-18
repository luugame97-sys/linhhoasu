'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),vm=require('vm'),crypto=require('crypto');
const {decode}=require('./build_fishing_rank_x10_20260907');const root=path.resolve(__dirname,'../temp/fishing_rank_x10_20260907');
const client=decode(fs.readFileSync(path.join(root,'client.next.bin'))),lang=decode(fs.readFileSync(path.join(root,'lang.next.bin')));
const rank=client.find(r=>r.name==='Activity6RankConfig').value[6006],desc=lang.find(r=>r.name==='LanguageConfig').value[10000119].cn;
assert(desc.includes('2%'));assert(!desc.includes('20%'));
const source=fs.readFileSync(path.resolve(__dirname,'../../linhhoasu/webgame/game/js/lhs-item-quantity-v1.js'),'utf8');
// Execute the actual shipped, pure formatting functions; no renderer mocks/visual claim.
const body=source.slice(source.indexOf('    function digits('),source.indexOf('    // Legacy overLength'));
const formatter=vm.runInNewContext('(function(){'+body+';return {compact:compact,full:full};})()');
const expected=['10M','8M','6M','5M','4M','3.5M','3M','2M'];const rows=[];
Object.values(rank).forEach((r,i)=>{for(const id of[1,6]){const n=r.rewards.find(x=>x.id===id).count;assert.equal(formatter.compact(n),expected[i]);rows.push({rank:r.rankShow,id,count:n,icon:formatter.compact(n),detail:formatter.full(n)});}});
const localIndex=fs.readFileSync(path.resolve(__dirname,'../../linhhoasu/webgame/game/index.html'),'utf8');assert.equal(localIndex.replace(/\r\n/g,'\n'),fs.readFileSync(path.join(root,'index.next.html'),'utf8').replace(/\r\n/g,'\n'));assert(localIndex.includes('20260907_item_quantity_v2'));
const result={result:'PASS',rows,description:desc,clientSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'client.next.bin'))).digest('hex'),langSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'lang.next.bin'))).digest('hex'),nativeUIThisTurn:false};
fs.writeFileSync(path.join(root,'client-check.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
