'use strict';
// Build a scoped native-client candidate; never edit the baseline/live file.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const acorn=require(path.resolve(__dirname,'../../linhhoasu/lhs/newServer/node_modules/acorn'));
const root=path.resolve(process.argv[2]),source=fs.readFileSync(path.join(root,'main.js'),'utf8');
const marker='u.sendDealFishMutl=function',at=source.indexOf(marker);assert(at>=0);
let node=acorn.parseExpressionAt(source,at+marker.indexOf('function'),{ecmaVersion:'latest'});if(node.type==='SequenceExpression')node=node.expressions[0];
let body=source.slice(node.start,node.end);
assert(body.includes('{dealMap:n,auto:'));
body=body.replace('{dealMap:n,auto:','{dealMap:n,integrityVersion:1,auto:');
const swap='h.fishInfos.find(function(x){return x.replaceUid==e})';
assert(body.includes('0<(null==(d=h.fishInfos)?void 0:d.length)'));
body=body.replace('0<(null==(d=h.fishInfos)?void 0:d.length)','!!(h.fishInfos&&'+swap+')');
assert.equal(body.split('h.fishInfos[0]').length-1,2);
body=body.replaceAll('h.fishInfos[0]',swap);
const tail='A.ins().dispatch(E.FISH_DEAL_UPDATE)';assert(body.includes(tail));
body=body.replace(tail,'h.state&&(m.fishInfo.slots=h.state.slots,m.fishInfo.fishResult=h.state.fishResult,m.fishInfo.pics=h.state.pics,m.fishInfo.fishTypeQualityPic=h.state.fishTypeQualityPic),h.orderState&&(m.fishInfo.orders=h.orderState),'+tail);
let output=source.slice(0,node.start)+body+source.slice(node.end);
const tree=acorn.parse(output,{ecmaVersion:'latest'}),edits=[];
const tags=new Set([4000,4002,4004,4005,4006,4007,4008,4009,4010,4011,4012,4013,4015,4016,4020,4021,4022,4030,4031,4050,4060,4061,4062,4063]);
function walk(n){
 if(!n||typeof n!=='object')return;
 if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='Rpc'&&tags.has(n.arguments[0]?.value)){
  const cb=n.arguments.find(a=>a.type==='FunctionExpression');
  if(cb?.params[0]?.type==='Identifier'){
   const p=cb.params[0].name,tag=n.arguments[0].value;
   const guard=`if(${p}&&${p}.result!=null&&Number(${p}.result)!==0){Y.FishingModel.isAutoFish=false;Y.FishingModel.clickProtect=false;Y.FishingModel.fishing=false;Y.OldTrekFishingModel&&(Y.OldTrekFishingModel.isAutoFish=false);S.ins().showTips(${p}.reason&&/UNVERIFIED|HELD/.test(${p}.reason)?"Chức năng này tạm khóa để bảo toàn cá và vật phẩm.":"Thao tác chưa hoàn tất. Kiểm tra cá chờ xử lý, vật phẩm và điều kiện mở khóa.");return;}`;
   edits.push({at:cb.body.start+1,text:guard,tag});
  }
 }
 for(const [k,v]of Object.entries(n)){if(k==='start'||k==='end')continue;if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}
}
walk(tree);assert(edits.some(e=>e.tag===4008));assert(edits.some(e=>e.tag===4061));
for(const e of edits.sort((a,b)=>b.at-a.at))output=output.slice(0,e.at)+e.text+output.slice(e.at);
acorn.parse(output,{ecmaVersion:'latest'});
fs.writeFileSync(path.join(root,'main.fixed.js'),output);
fs.writeFileSync(path.join(root,'client-build.json'),JSON.stringify({callbackGuards:edits.length,tags:edits.map(e=>e.tag).sort((a,b)=>a-b),changes:['per-UID swap','authoritative deal state','reject failed RPC before optimistic UI']},null,2)+'\n');
console.log('CLIENT_BUILD='+JSON.stringify({guards:edits.length,bytes:Buffer.byteLength(output)}));
