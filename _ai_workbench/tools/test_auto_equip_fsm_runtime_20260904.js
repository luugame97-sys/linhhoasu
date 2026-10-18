'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(process.argv[2],'utf8');
const start=source.indexOf('o.dealSelect=function(t){var e,i;'),end=source.indexOf(',o.openHeroReplaceView=function(t,e)',start);
assert.ok(start>=0&&end>start,'IdleFightStateSelect anchors missing');
const code=source.slice(start,end)+';';
function scenario({equipped={},drops=[],keep=[],rpcOk=true}){
  const ctx={o:{},U9:{isOpen:true,autoConfig:{autoEquipUpgrade:true,enoughPower:false}},xV:{isAutoOpenShowMatrix:false},YV:{calPower:x=>x?Number(x.power)||0:0},E:{SHOW_EQUIP_MATRIX:1,EQUIP_REPLACE:2,EQUIP_MATRIX_VIEW_UPDATE:3,ATTR_CHANGE:4},P:{ins:()=>({})}};
  const held=new Set(keep),removed=[],sale=[],popups=[],states=[],rpc=[];
  ctx.x9={CheckAutoStop(list){const out=[];for(const item of [...list]){if(!equipped[item.type]||held.has(item.uid))continue;out.push(item);list.splice(list.indexOf(item),1)}return out}};
  ctx.Y={BoxLayerModel:{openEquipList:drops},EquipModel:{getPresetIdx:()=>0,getMapEquipInfo:type=>equipped[type]||null,getEquipFromPlan:()=>0,removeOpenListEquip:uid=>removed.push(uid),equipReplace(item){const old=equipped[item.type];equipped[item.type]=item;return old},addEquipToOpenList(){},addEquip(item){equipped[item.type]=item}},RaidMgr:{mMapRaid:{GetEntity:()=>null}},ActorModel:{actorID:1}};
  ctx.A={ins:()=>({dispatch(){},dispatchImmediate(){}})};
  vm.runInNewContext(code,ctx);
  ctx.o.openHeroReplaceView=(_layer,items)=>popups.push(...items);
  const layer={addSaleList(items){if(items)sale.push(...items)},changeState(x){states.push(x)},Rpc(tag,data,cb){rpc.push({tag,data});cb(rpcOk?{result:0,beforePower:equipped[drops.find(x=>x.uid===data.uid)?.type]?.power||0,afterPower:(drops.find(x=>x.uid===data.uid)||{}).power||0}:{result:1})}};
  ctx.o.dealSelect(layer);
  return{ctx,equipped,removed,sale,popups,states,rpc};
}
let r=scenario({equipped:{},drops:[{uid:101,type:1,power:200}]});
assert.equal(r.rpc.length,1);assert.equal(r.rpc[0].data.uid,101);assert.equal(r.equipped[1].uid,101);assert.deepEqual(r.popups,[]);assert.deepEqual(r.states,[2]);
r=scenario({equipped:{1:{uid:1,type:1,power:100}},drops:[{uid:201,type:1,power:300},{uid:202,type:1,power:50}],keep:[201]});
assert.equal(r.rpc[0].data.uid,201);assert.equal(r.equipped[1].uid,201);assert.ok(r.sale.some(x=>x.uid===202));assert.ok(r.sale.some(x=>x.uid===1));assert.deepEqual(r.popups,[]);
r=scenario({equipped:{1:{uid:1,type:1,power:100}},drops:[{uid:301,type:1,power:200},{uid:302,type:1,power:400}]});
assert.equal(r.rpc.length,1);assert.equal(r.rpc[0].data.uid,302);assert.equal(r.equipped[1].uid,302);assert.ok(r.sale.some(x=>x.uid===301));
r=scenario({equipped:{},drops:[{uid:401,type:1,power:200}],rpcOk:false});
assert.equal(r.ctx.U9.isOpen,false);assert.equal(r.equipped[1],undefined);assert.ok(r.popups.some(x=>x.uid===401));
assert.ok(source.includes('s=e.slice(),o=e.slice()'),'all-drop candidate list missing');
assert.ok(source.includes('var v=function(t){for(var e=t.length-1;0<=e;e--)'),'selected-item removal missing');
console.log(JSON.stringify({result:'PASS',checks:19,emptySlot:true,retainedUpgrade:true,strongestPerSlot:true,rejectFallback:true}));
